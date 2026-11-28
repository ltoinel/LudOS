import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEBLLM_VERSION, createFitter, type ChatRequest } from '../src/lib/llm.ts';

describe('WEBLLM_VERSION', () => {
  it('matches the installed @mlc-ai/web-llm package', () => {
    const pkg = JSON.parse(
      readFileSync(
        new URL('../node_modules/@mlc-ai/web-llm/package.json', import.meta.url),
        'utf8',
      ),
    ) as { version: string };
    expect(WEBLLM_VERSION).toBe(pkg.version);
  });
});

describe('createFitter', () => {
  const messagesOf = (budget: number) => [
    { role: 'system', content: 's'.repeat(Math.min(budget, 100)) },
    { role: 'user', content: 'u'.repeat(Math.max(0, budget - 100)) },
  ];

  it('sizes the prompt from the context window and caps the answer', async () => {
    const requests: ChatRequest[] = [];
    const fit = createFitter({
      chat: async (req) => {
        requests.push(req);
        return { content: 'ok', usage: null };
      },
      contextWindow: () => 1024,
    });
    const budgets: number[] = [];
    await fit({
      build: (budget) => {
        budgets.push(budget);
        return messagesOf(budget);
      },
      maxTokens: 4000,
    });
    // The answer never takes more than a quarter of the window…
    expect(requests[0].maxTokens).toBe(256);
    // …and prompt + answer fit at the first guess of 3.2 characters per token.
    expect(budgets[0] / 3.2 + 256).toBeLessThanOrEqual(1024);
    expect(requests[0].stream).toBe(false);
  });

  it('assumes the common 4k window when the engine reports none', async () => {
    const budgets: number[] = [];
    const fit = createFitter({
      chat: async () => ({ content: '', usage: null }),
      contextWindow: () => null,
    });
    await fit({ build: (budget) => (budgets.push(budget), messagesOf(budget)) });
    expect(budgets[0]).toBe(Math.floor((4096 - 256 - 64) * 3.2));
  });

  it('rebuilds once from the exact token count after an overflow', async () => {
    let calls = 0;
    const budgets: number[] = [];
    const fit = createFitter({
      chat: async (req) => {
        calls++;
        const chars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
        // One token per character: far denser than the first guess.
        if (chars > 4096 - 256)
          throw new Error(
            `Prompt tokens exceed context window size: number of prompt tokens: ${chars}`,
          );
        return { content: 'ok', usage: null };
      },
      contextWindow: () => 4096,
    });
    const result = await fit({ build: (budget) => (budgets.push(budget), messagesOf(budget)) });
    expect(result.content).toBe('ok');
    expect(calls).toBe(2);
    expect(budgets[1]).toBeLessThan(budgets[0] / 3);
  });

  it('gives up on a second overflow and passes other errors through', async () => {
    const overflowing = createFitter({
      chat: async () => {
        throw new Error('number of prompt tokens: 99999');
      },
      contextWindow: () => 4096,
    });
    await expect(overflowing({ build: messagesOf })).rejects.toThrow('prompt tokens');
    const broken = createFitter({
      chat: async () => {
        throw new Error('GPU device lost');
      },
      contextWindow: () => 4096,
    });
    await expect(broken({ build: messagesOf })).rejects.toThrow('GPU device lost');
  });

  it('follows the measured density, and forgets it when the model changes', async () => {
    let model = 'a';
    const budgets: number[] = [];
    const fit = createFitter({
      // Reports twice as many tokens as the first guess expects.
      chat: async (req) => ({
        content: '',
        usage: {
          promptTokens: req.messages.reduce((sum, m) => sum + m.content.length, 0) / 1.6,
          completionTokens: 1,
        },
      }),
      contextWindow: () => 4096,
      modelKey: () => model,
    });
    const build = (budget: number) => (budgets.push(budget), messagesOf(budget));
    await fit({ build });
    await fit({ build });
    expect(Math.abs(budgets[1] - budgets[0] / 2)).toBeLessThanOrEqual(1); // followed at once
    model = 'b';
    await fit({ build });
    expect(budgets[2]).toBe(budgets[0]);
  });

  it('streams when asked to', async () => {
    let streamed = false;
    const fit = createFitter({
      chat: async (req) => {
        streamed = req.stream === true;
        req.onToken?.('hi', 'hi');
        return { content: 'hi', usage: null };
      },
      contextWindow: () => 4096,
    });
    const seen: string[] = [];
    await fit({ build: messagesOf, onToken: (_delta, full) => void seen.push(full) });
    expect(streamed).toBe(true);
    expect(seen).toEqual(['hi']);
  });
});
