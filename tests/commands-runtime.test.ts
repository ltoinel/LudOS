import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage, runCommand } from './run-command.ts';

describe('asciiart', () => {
  it('renders block letters, one blank column apart', async () => {
    const { out } = await runCommand('asciiart', ['HI']);
    expect(out).toEqual([
      ['█   █ ███', '█   █  █', '█████  █', '█   █  █', '█   █ ███'].join('\n'),
    ]);
  });

  it('draws letters with themselves and folds accents', async () => {
    const { out } = await runCommand('asciiart', ['-s', 'letters', 'é']);
    expect(out[0].split('\n')[0]).toBe('EEEEE');
  });

  it('wraps to the requested width', async () => {
    const { out } = await runCommand('asciiart', ['-w', '40', 'HELLO', 'WORLD']);
    expect(out[0].split('\n\n')).toHaveLength(2);
    for (const line of out[0].split('\n')) expect(line.length).toBeLessThanOrEqual(40);
  });

  it('lists its styles and rejects unknown ones', async () => {
    expect((await runCommand('asciiart', ['--styles'])).out.length).toBeGreaterThan(5);
    expect((await runCommand('asciiart', ['-s', 'nope', 'x'])).err[0]).toContain('unknown style');
  });
});

describe('todo + kanban', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('adds, moves and lists tasks', async () => {
    await runCommand('todo', ['add', 'Finir', 'le', 'projet']);
    await runCommand('todo', ['add', 'Écrire la doc']);
    await runCommand('todo', ['start', '2']);
    await runCommand('todo', ['add', 'Démo']);
    await runCommand('todo', ['done', '3']);
    const { out } = await runCommand('todo', ['ls']);
    expect(out).toEqual(['  1 [ ] Finir le projet', '  2 [~] Écrire la doc', '2 open · 1 done']);
    expect((await runCommand('todo', ['ls', '--all'])).out).toContain('  3 [x] Démo');
  });

  it('reports unknown ids and clears done tasks', async () => {
    await runCommand('todo', ['add', 'a']);
    await runCommand('todo', ['done', '1']);
    expect((await runCommand('todo', ['rm', '9'])).err).toEqual(['todo: no task #9']);
    expect((await runCommand('todo', ['clear'])).out).toEqual(['removed 1 finished task(s)']);
  });

  it('shows the same tasks as a kanban board', async () => {
    await runCommand('todo', ['add', 'alpha']);
    await runCommand('todo', ['add', 'beta']);
    await runCommand('todo', ['start', '2']);
    const board = (await runCommand('kanban')).out[0].split('\n');
    expect(board[1]).toMatch(/TODO \(1\).*DOING \(1\).*DONE \(0\)/);
    expect(board[3]).toMatch(/#1 alpha.*#2 beta/);
  });
});

describe('password', () => {
  it('generates the requested length with every character class', async () => {
    const { out } = await runCommand('password', ['-n', '5', '32']);
    const passwords = out.slice(0, 5);
    for (const p of passwords) {
      expect(p).toHaveLength(32);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[^a-zA-Z0-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
    expect(new Set(passwords).size).toBe(5);
  });

  it('honors --no-symbols and validates the length', async () => {
    expect((await runCommand('password', ['--no-symbols', '16'])).out[0]).toMatch(
      /^[a-zA-Z2-9]{16}$/,
    );
    expect((await runCommand('password', ['4'])).err[0]).toContain('between 8 and 128');
  });
});

describe('cal', () => {
  it('renders a month grid starting on Monday with ISO week numbers', async () => {
    const lines = (await runCommand('cal', ['2', '2026'])).out[0].split('\n');
    expect(lines[0].trim()).toBe('February 2026');
    expect(lines[1]).toBe('Wk Mo Tu We Th Fr Sa Su');
    expect(lines[2]).toBe(' 5                    1'); // Feb 1st 2026 is a Sunday
    expect(lines[3]).toBe(' 6  2  3  4  5  6  7  8');
  });

  it('validates its arguments', async () => {
    expect((await runCommand('cal', ['13', '2026'])).err[0]).toContain('month');
  });
});

describe('qr', () => {
  it('renders a square code with its quiet zone', async () => {
    const { out, err } = await runCommand('qr', ['https://ludovic.toinel.com']);
    expect(err).toEqual([]);
    const rows = out[0].split('\n').filter(Boolean);
    // Version 2 (25 modules) + 2 × 4 quiet modules = 33 columns.
    expect(rows[0]).toHaveLength(33);
    expect(rows).toHaveLength(Math.ceil(33 / 2));
  });

  it('takes piped input and rejects text that cannot fit', async () => {
    expect((await runCommand('qr', [], { stdin: 'hello' })).err).toEqual([]);
    expect((await runCommand('qr', ['x'.repeat(3000)])).err[0]).toContain('too long');
  });
});

describe('dl', () => {
  it('packs the directory into a valid zip and triggers a download', async () => {
    const { createVfs, vdir } = await import('../src/lib/vfs.ts');
    const { crc32 } = await import('node:zlib');
    const vfs = createVfs({
      root: vdir({
        home: vdir({
          guest: vdir({
            'about.md': { type: 'file', content: '# Hello é' },
            notes: vdir({ 'todo.txt': { type: 'file', content: 'buy milk\n' } }),
          }),
        }),
      }),
      home: '/home/guest',
      storage: null,
    });

    // Capture the download instead of touching a real DOM.
    let blob: Blob | undefined;
    let downloadName = '';
    const g = globalThis as Record<string, unknown>;
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (b: Blob) => ((blob = b), 'blob:test');
    g.document = {
      body: { appendChild: () => {} },
      createElement: () => ({
        click() {
          downloadName = (this as unknown as { download: string }).download;
        },
        remove() {},
      }),
    };
    try {
      const { out, err } = await runCommand('dl', [], {
        ctx: {
          cwd: () => vfs.cwd(),
          cd: (p?: string) => vfs.chdir(p),
          list: (p?: string) => vfs.listPath(p),
          read: (p: string) => vfs.readPath(p),
        },
      });
      expect(err).toEqual([]);
      expect(out[0]).toMatch(/^⬇ guest\.zip — 2 file\(s\)/);
    } finally {
      URL.createObjectURL = realCreate;
      delete g.document;
    }
    expect(downloadName).toBe('guest.zip');

    // Walk the central directory and check names + CRCs against the content.
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    const count = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    const files: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const nameLength = view.getUint16(at + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
      files[name] = view.getUint32(at + 16, true);
      at += 46 + nameLength;
    }
    expect(Object.keys(files).sort()).toEqual(['about.md', 'notes/', 'notes/todo.txt']);
    expect(files['about.md']).toBe(crc32(new TextEncoder().encode('# Hello é')));
    expect(files['notes/todo.txt']).toBe(crc32('buy milk\n'));
  });
});

describe('denree (dynamic reasoning graph, scripted LLM)', () => {
  const commands = [
    { name: 'checkip', desc: 'show your public IP address', alias: [], man: '' },
    { name: 'weather', desc: 'current weather — e.g. weather Tokyo', alias: [], man: '' },
    { name: 'rm', desc: 'remove', alias: [], man: '' },
    { name: 'pwd', desc: 'print working directory', alias: [], man: '' },
    { name: 'whoami', desc: 'who am I', alias: [], man: '' },
  ];
  const outputs: Record<string, string> = {
    pwd: '/home/guest',
    whoami: 'Ludovic Toinel — Fullstack & Innovation Architect',
    checkip: 'IP 203.0.113.7 · Rennes, Brittany · France',
    'weather Rennes': 'Rennes: 🌦 +14°C, light rain',
  };

  /** Runs denree with an LLM whose replies are picked by `reply(system, user)`. */
  const runDenree = async (reply: (system: string, user: string) => unknown) => {
    const ran: string[] = [];
    const calls: string[] = [];
    const result = await runCommand(
      'denree',
      ['what', 'is', 'the', 'weather', 'where', 'I', 'am?'],
      {
        ctx: {
          commands,
          capture: async (line: string) => {
            ran.push(line);
            return { ok: true, stdout: outputs[line] ?? '', stderr: '' };
          },
          llm: {
            state: () => ({ modelId: 'test-model', label: 'Test' }),
            interrupt: () => {},
            chat: async (req: { messages: { content: string }[] }) => {
              const [system, user] = [req.messages[0].content, req.messages[1].content];
              const kind = system.includes('Split the goal')
                ? 'plan'
                : system.includes('Decide the NEXT step')
                  ? 'decide'
                  : system.includes('check a command output')
                    ? 'reflect'
                    : system.includes('grade an answer')
                      ? 'critique'
                      : 'synthesize';
              calls.push(kind);
              const value = reply(system, user) ?? {};
              return { content: typeof value === 'string' ? value : JSON.stringify(value) };
            },
          },
        },
      },
    );
    return { ...result, ran, calls };
  };

  it('chains commands: a fact from one output becomes the next argument', async () => {
    const { out, err, ran } = await runDenree((system, user) => {
      if (system.includes('Split the goal')) {
        return {
          analysis: 'Find the city, then its weather.',
          steps: [
            { question: 'Where am I?', command: 'checkip' },
            { question: 'What is the weather there?', command: '' },
          ],
        };
      }
      if (system.includes('Decide the NEXT step')) {
        // Once the city is among the facts, reuse it as the next argument.
        const city = user.match(/city: (\w+)/)?.[1];
        if (!user.includes('$ checkip'))
          return { thought: 'locate', action: 'run', command: 'checkip' };
        if (city && !user.includes('$ weather')) {
          return { thought: 'weather there', action: 'run', command: `weather ${city}` };
        }
        return { thought: 'done', action: 'answer', command: '' };
      }
      if (system.includes('check a command output')) {
        return user.includes('Command: checkip')
          ? { useful: true, facts: 'city: Rennes (France)', problem: '', goal_answered: false }
          : { useful: true, facts: 'Rennes: +14°C, light rain', problem: '', goal_answered: true };
      }
      if (system.includes('grade an answer')) return { score: 9, missing: '', command: '' };
      return 'In Rennes it is 14°C with light rain.';
    });
    expect(err).toEqual([]);
    expect(ran).toEqual(['checkip', 'weather Rennes']);
    expect(out.join('\n')).toContain('✦ answer › In Rennes it is 14°C with light rain.');
  });

  it('recovers from a wrong command using the failure feedback', async () => {
    const { out, ran, calls } = await runDenree((system, user) => {
      if (system.includes('Split the goal')) return { analysis: '', steps: [] };
      if (system.includes('Decide the NEXT step')) {
        if (user.includes('ipconfig →') && !user.includes('$ checkip')) {
          return { thought: 'fix it', action: 'run', command: 'checkip' };
        }
        if (user.includes('$ checkip')) return { thought: 'enough', action: 'answer', command: '' };
        return { thought: 'guess', action: 'run', command: 'ipconfig' };
      }
      if (system.includes('check a command output')) {
        return user.includes('Command: ipconfig')
          ? { useful: false, facts: '', problem: 'use checkip instead', goal_answered: false }
          : { useful: true, facts: 'IP 203.0.113.7', problem: '', goal_answered: false };
      }
      if (system.includes('grade an answer')) return { score: 8, missing: '', command: '' };
      return 'Your IP is 203.0.113.7.';
    });
    // The invented command is rejected without running; the fix runs.
    expect(ran).toEqual(['checkip']);
    expect(out.join('\n')).toContain('command "ipconfig" does not exist here.');
    expect(calls.slice(0, 5)).toEqual(['plan', 'decide', 'reflect', 'decide', 'reflect']);
    expect(out.at(-1)).toMatch(/1 command\(s\) · \d+ LLM call\(s\) · confidence 8\/10/);
  });

  it('does not loop on a repeated command: falls back on the plan, then stops', async () => {
    const { out, ran, calls } = await runDenree((system, user) => {
      if (system.includes('Split the goal')) {
        // The reported case: the analysis names whoami, the only step says pwd.
        return {
          analysis: 'whoami',
          steps: [{ question: 'what is my current working directory?', command: 'pwd' }],
        };
      }
      if (system.includes('Decide the NEXT step')) {
        return { thought: 'check the directory', action: 'run', command: 'pwd' }; // always
      }
      if (system.includes('check a command output')) {
        return user.includes('Command: whoami')
          ? { useful: true, facts: 'Ludovic Toinel, architect', problem: '', goal_answered: false }
          : { useful: true, facts: 'n/a', problem: '', goal_answered: false }; // a placeholder
      }
      if (system.includes('grade an answer')) return { score: 9, missing: '', command: '' };
      return 'You are Ludovic Toinel.';
    });
    expect(ran).toEqual(['pwd', 'whoami']);
    expect(out.join('\n')).toContain('"pwd" already ran — trying "whoami" instead');
    expect(out.join('\n')).toContain('stuck repeating "pwd"');
    // A few decisions, not the 12-step budget.
    expect(calls.filter((c) => c === 'decide').length).toBeLessThanOrEqual(4);
    expect(out.join('\n')).toContain('✦ answer › You are Ludovic Toinel.');
  });
});
