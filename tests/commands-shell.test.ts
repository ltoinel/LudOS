import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage, runCommand } from './run-command.ts';
import { expandAlias, parseCommandLine } from '../src/lib/shell-parse.ts';

describe('alias + unalias', () => {
  let storage: Record<string, string>;
  beforeEach(() => {
    storage = installMemoryStorage();
  });

  it('defines, shows and lists aliases', async () => {
    expect((await runCommand('alias', ['la=ls -la', 'h=history'])).err).toEqual([]);
    expect(JSON.parse(storage['ltsh.aliases'])).toEqual({ la: 'ls -la', h: 'history' });
    expect((await runCommand('alias', ['la'])).out).toEqual(["alias la='ls -la'"]);
    expect((await runCommand('alias')).out).toEqual(["alias h='history'", "alias la='ls -la'"]);
  });

  it('refuses what the shell could not expand', async () => {
    expect((await runCommand('alias', ['x=ls | wc'])).err[0]).toContain('not supported');
    expect((await runCommand('alias', ['1bad=ls'])).err[0]).toContain('invalid alias name');
    expect((await runCommand('alias', ['x='])).err[0]).toContain('empty command');
    expect((await runCommand('alias', ['nope'])).err).toEqual(['alias: nope: not found']);
    expect(storage['ltsh.aliases']).toBeUndefined();
  });

  it('removes one alias, or all of them', async () => {
    await runCommand('alias', ['la=ls -la', 'h=history']);
    expect((await runCommand('unalias', ['la', 'ghost'])).err).toEqual([
      'unalias: ghost: not found',
    ]);
    expect(JSON.parse(storage['ltsh.aliases'])).toEqual({ h: 'history' });
    await runCommand('unalias', ['-a']);
    expect(JSON.parse(storage['ltsh.aliases'])).toEqual({});
    expect((await runCommand('unalias')).err[0]).toContain('usage');
  });
});

describe('expandAlias', () => {
  const stage = (line: string) => parseCommandLine(line).stages[0];

  it('prepends the alias and keeps the typed arguments', () => {
    const expanded = expandAlias(stage('la /etc'), { la: 'ls -la' });
    expect(expanded).toMatchObject({ name: 'ls', args: ['-la', '/etc'] });
  });

  it('expands once, so an alias can wrap the command it is named after', () => {
    expect(expandAlias(stage('ls'), { ls: 'ls -a' })).toMatchObject({ name: 'ls', args: ['-a'] });
  });

  it('ignores unusable values and names inherited from Object.prototype', () => {
    const typed = stage('x 1');
    expect(expandAlias(typed, { x: 'ls | wc' })).toBe(typed);
    expect(expandAlias(typed, { x: 'ls > out' })).toBe(typed);
    expect(expandAlias(typed, { x: 42 })).toBe(typed);
    const inherited = stage('constructor');
    expect(expandAlias(inherited, {})).toBe(inherited);
  });
});

describe('ps + kill', () => {
  const workers = [
    { id: 1, name: 'hashcat#1', state: 'running', started: 0, messages: 12 },
    { id: 2, name: 'grep', state: 'terminated', started: 0, ended: 61_000, messages: 1 },
  ];

  it('lists the shell first, then the tracked workers', async () => {
    const { out } = await runCommand('ps', [], { ctx: { workers: () => workers } });
    expect(out[0]).toMatch(/^PID\s+STATE\s+TIME\s+MSGS\s+COMMAND$/);
    expect(out[1]).toMatch(/^\s*1\s+running\s+\d+:\d\d\s+-\s+ludsh$/);
    expect(out[2]).toMatch(/^\s*2\s+running\s+\d+:\d\d\s+12\s+hashcat#1$/);
    expect(out[3]).toMatch(/^\s*3\s+terminated\s+1:01\s+1\s+grep$/);
  });

  it('kills workers by the pid ps shows, and protects the shell', async () => {
    const killed: number[] = [];
    const killWorker = (id: number) => {
      killed.push(id);
      return id === 1;
    };
    const { err } = await runCommand('kill', ['2', '9', '1', 'abc'], { ctx: { killWorker } });
    expect(killed).toEqual([1, 8]);
    expect(err).toEqual([
      'kill: (9) - No such process',
      'kill: (1) - Operation not permitted — the shell itself; use exit',
      'kill: abc: arguments must be process ids',
    ]);
    expect((await runCommand('kill')).err[0]).toContain('usage');
  });
});
