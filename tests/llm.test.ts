import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEBLLM_VERSION } from '../src/lib/llm.ts';

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
