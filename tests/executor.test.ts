import { describe, expect, it } from 'vitest';
import { createExecutor, type Executor } from '../src/lib/executor.ts';
import type { Stage } from '../src/lib/shell-parse.ts';

/**
 * A fake shell: a few commands whose "printers" honor the executor state the
 * same way terminal.ts does (capture stdout, sink stderr, else "paint").
 */
function setup() {
  const screen: string[] = [];
  const errors: string[] = [];
  const files: Record<string, string> = {};
  const out = (text: string): void => void (ex.state.capture ?? screen).push(text);
  const err = (text: string): void => void (ex.state.errSink ?? errors).push(text);

  const commands: Record<string, (s: Stage) => Promise<void> | void> = {
    echo: (s) => out(s.args.join(' ')),
    upper: () => out(ex.state.stdin.toUpperCase()),
    fail: () => err('boom'),
    // Calls capture() from inside a (possibly captured) command, like `denree`.
    nested: async () => {
      const r = await ex.capture('echo inner');
      out(`got ${r.stdout}`);
      out('after');
    },
  };

  const ex: Executor = createExecutor({
    runStage: async (stage) => {
      const cmd = commands[stage.name];
      if (cmd) await cmd(stage);
      else err(`${stage.name}: command not found`);
    },
    readFile: (p) => files[p] ?? null,
    writeFile: (p, c) => {
      files[p] = c;
      return null;
    },
    printErr: err,
  });
  return { ex, screen, errors, files };
}

describe('executor — execute', () => {
  it('paints the final stage', async () => {
    const { ex, screen } = setup();
    await ex.execute('echo hi there');
    expect(screen).toEqual(['hi there']);
  });

  it('pipes stdout into the next stage stdin', async () => {
    const { ex, screen } = setup();
    await ex.execute('echo abc | upper');
    expect(screen).toEqual(['ABC']);
    expect(ex.state.stdin).toBe('');
  });

  it('writes > and appends >>', async () => {
    const { ex, screen, files } = setup();
    await ex.execute('echo one > f');
    await ex.execute('echo two >> f');
    expect(screen).toEqual([]);
    expect(files.f).toBe('one\ntwo\n');
  });

  it('reports a syntax error without running anything', async () => {
    const { ex, screen, errors } = setup();
    await ex.execute('echo x |');
    expect(screen).toEqual([]);
    expect(errors).toEqual(['syntax error near `|`']);
  });

  it('always shows stderr, even mid-pipeline', async () => {
    const { ex, errors } = setup();
    await ex.execute('fail | upper');
    expect(errors).toEqual(['boom']);
  });
});

describe('executor — capture', () => {
  it('returns stdout and stderr without painting', async () => {
    const { ex, screen, errors } = setup();
    expect(await ex.capture('echo a | upper')).toEqual({ ok: true, stdout: 'A', stderr: '' });
    expect(await ex.capture('nope')).toEqual({
      ok: false,
      stdout: '',
      stderr: 'nope: command not found',
    });
    expect(screen).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('restores the outer routing when called from a piped command', async () => {
    const { ex, screen } = setup();
    await ex.execute('nested | upper');
    // Both lines of `nested` reach the next stage — none leaks to the screen.
    expect(screen).toEqual(['GOT INNER\nAFTER']);
  });
});
