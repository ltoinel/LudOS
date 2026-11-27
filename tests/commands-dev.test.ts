/**
 * Runtime tests for the filesystem and developer-tool commands (`cp`, `mv`,
 * `which`, `env`, `json`, `epoch`, `urlencode`, `urldecode`, `regex`, `cron`,
 * `color`, `lorem`): each `root/bin/<name>.md` is run as the shell runs it,
 * through `runCommand` and its fake `ctx`.
 *
 * Time-dependent commands run under a faked clock, and assertions only rely
 * on UTC values or on local wall-clock times built with the local `Date`
 * constructor, so the suite gives the same result in every time zone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVfs, vdir, type VNode } from '../src/lib/vfs.ts';
import { runCommand } from './run-command.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = (content: string): VNode => ({ type: 'file', content });

/** A small tree plus the `ctx` accessors, wired like `terminal.ts` `makeCtx`. */
function makeFs() {
  const vfs = createVfs({
    root: vdir({
      home: vdir({
        guest: vdir({
          'about.md': file('# About'),
          'notes.txt': file('hello'),
          docs: vdir({
            'a.txt': file('A'),
            sub: vdir({ 'b.txt': file('B') }),
          }),
          empty: vdir(),
          archive: vdir({ docs: vdir({ 'old.txt': file('old') }) }),
        }),
      }),
      etc: vdir({ motd: file('welcome') }),
      root: vdir({ 'secret.txt': file('s3cret') }),
    }),
    home: '/home/guest',
    storage: null,
  });
  const ctx = {
    cfg: { host: 'example.test', user: 'guest', home: '/home/guest', links: {}, version: '9.9.9' },
    cwd: () => vfs.cwd(),
    cwdLabel: () => vfs.cwdLabel(),
    list: (arg?: string) => vfs.listPath(arg),
    read: (arg: string) => vfs.readPath(arg),
    mkdir: (path: string, parents = false) => vfs.mutate('mkdir', path, { p: parents }),
    write: (path: string, content: string) => vfs.mutate('write', path, { content }),
    rm: (path: string, recursive = false, force = false) =>
      vfs.mutate('rm', path, { r: recursive, f: force }),
  };
  /** Content of the file at an absolute path, or undefined (missing / a directory). */
  const content = (path: string): string | undefined => {
    const node = vfs.nodeAt(path);
    return node?.type === 'file' ? node.content : undefined;
  };
  const isDir = (path: string): boolean => vfs.nodeAt(path)?.type === 'dir';
  return { vfs, ctx, content, isDir };
}

describe('cp', () => {
  it('copies a file to a new name and keeps the source', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['notes.txt', 'copy.txt'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/copy.txt')).toBe('hello');
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');
  });

  it('overwrites an existing file', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['notes.txt', 'about.md'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/about.md')).toBe('hello');
  });

  it('copies into an existing directory under the source name', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['notes.txt', 'about.md', 'empty'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/empty/notes.txt')).toBe('hello');
    expect(fs.content('/home/guest/empty/about.md')).toBe('# About');
  });

  it('needs a directory to receive several sources', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['notes.txt', 'about.md', 'new.txt'], { ctx: fs.ctx });
    expect(err).toEqual(["cp: target 'new.txt' is not a directory"]);
    expect(fs.vfs.nodeAt('/home/guest/new.txt')).toBeUndefined();
  });

  it('omits a directory without -r', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['docs', 'backup'], { ctx: fs.ctx });
    expect(err).toEqual(["cp: -r not specified; omitting directory 'docs'"]);
    expect(fs.vfs.nodeAt('/home/guest/backup')).toBeUndefined();
  });

  it('copies a directory tree with -r, to a new name or into a directory', async () => {
    const fs = makeFs();
    expect((await runCommand('cp', ['-r', 'docs', 'backup'], { ctx: fs.ctx })).err).toEqual([]);
    expect(fs.content('/home/guest/backup/a.txt')).toBe('A');
    expect(fs.content('/home/guest/backup/sub/b.txt')).toBe('B');
    expect(fs.content('/home/guest/docs/sub/b.txt')).toBe('B');

    expect((await runCommand('cp', ['-R', 'docs', 'empty'], { ctx: fs.ctx })).err).toEqual([]);
    expect(fs.content('/home/guest/empty/docs/sub/b.txt')).toBe('B');
  });

  it('merges a directory into an existing one of the same name', async () => {
    const fs = makeFs();
    const { err } = await runCommand('cp', ['-r', 'docs', 'archive'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/archive/docs/old.txt')).toBe('old');
    expect(fs.content('/home/guest/archive/docs/a.txt')).toBe('A');
  });

  it('refuses to copy a directory into itself', async () => {
    const fs = makeFs();
    const nested = await runCommand('cp', ['-r', 'docs', 'docs/sub'], { ctx: fs.ctx });
    expect(nested.err[0]).toContain('into itself');
    const onto = await runCommand('cp', ['-r', 'docs', './docs/../docs'], { ctx: fs.ctx });
    expect(onto.err[0]).toContain('into itself');
    expect(fs.vfs.nodeAt('/home/guest/docs/docs')).toBeUndefined();
    expect(fs.vfs.nodeAt('/home/guest/docs/sub/docs')).toBeUndefined();
  });

  it('refuses to copy a file onto itself', async () => {
    const fs = makeFs();
    const same = await runCommand('cp', ['notes.txt', './notes.txt'], { ctx: fs.ctx });
    expect(same.err[0]).toContain('are the same file');
    const intoCwd = await runCommand('cp', ['notes.txt', '.'], { ctx: fs.ctx });
    expect(intoCwd.err[0]).toContain('are the same file');
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');
  });

  it('reports a missing source and does not guess extensions', async () => {
    const fs = makeFs();
    const missing = await runCommand('cp', ['nope.txt', 'x'], { ctx: fs.ctx });
    expect(missing.err).toEqual(["cp: cannot stat 'nope.txt': No such file or directory"]);
    // `cat about` finds about.md; cp wants the exact name.
    const lenient = await runCommand('cp', ['about', 'x'], { ctx: fs.ctx });
    expect(lenient.err).toEqual(["cp: cannot stat 'about': No such file or directory"]);
    expect(fs.vfs.nodeAt('/home/guest/x')).toBeUndefined();
  });

  it('honours the filesystem permissions and missing parents', async () => {
    const fs = makeFs();
    const outside = await runCommand('cp', ['notes.txt', '/etc/notes.txt'], { ctx: fs.ctx });
    expect(outside.err[0]).toContain('Permission denied');
    const secret = await runCommand('cp', ['/root/secret.txt', 'x'], { ctx: fs.ctx });
    expect(secret.err[0]).toContain('Permission denied');
    const orphan = await runCommand('cp', ['notes.txt', 'nowhere/x.txt'], { ctx: fs.ctx });
    expect(orphan.err[0]).toContain('No such file or directory');
    // Reading outside the home is allowed: only writes are confined.
    const inbound = await runCommand('cp', ['/etc/motd', '~/motd.txt'], { ctx: fs.ctx });
    expect(inbound.err).toEqual([]);
    expect(fs.content('/home/guest/motd.txt')).toBe('welcome');
  });

  it('will not replace a directory with a file, nor a file with a directory', async () => {
    const fs = makeFs();
    fs.ctx.write('archive/notes.txt', 'placeholder');
    fs.ctx.rm('archive/notes.txt');
    fs.ctx.mkdir('archive/notes.txt');
    const fileOverDir = await runCommand('cp', ['notes.txt', 'archive'], { ctx: fs.ctx });
    expect(fileOverDir.err[0]).toContain('cannot overwrite directory');
    const dirOverFile = await runCommand('cp', ['-r', 'docs', 'notes.txt'], { ctx: fs.ctx });
    expect(dirOverFile.err[0]).toContain('cannot overwrite non-directory');
  });

  it('prints its usage and rejects unknown options', async () => {
    expect((await runCommand('cp', ['only-one'])).err[0]).toContain('usage: cp');
    expect((await runCommand('cp', ['-x', 'a', 'b'])).err).toEqual(['cp: invalid option -- x']);
  });
});

describe('mv', () => {
  it('renames a file', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['notes.txt', 'renamed.txt'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/renamed.txt')).toBe('hello');
    expect(fs.vfs.nodeAt('/home/guest/notes.txt')).toBeUndefined();
  });

  it('moves several files into a directory', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['notes.txt', 'about.md', 'empty'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/empty/notes.txt')).toBe('hello');
    expect(fs.content('/home/guest/empty/about.md')).toBe('# About');
    expect(fs.vfs.nodeAt('/home/guest/notes.txt')).toBeUndefined();
    expect(fs.vfs.nodeAt('/home/guest/about.md')).toBeUndefined();
  });

  it('renames a directory with everything in it', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['docs', 'papers'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/papers/a.txt')).toBe('A');
    expect(fs.content('/home/guest/papers/sub/b.txt')).toBe('B');
    expect(fs.vfs.nodeAt('/home/guest/docs')).toBeUndefined();
  });

  it('moves a directory into an existing one', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['docs', 'empty'], { ctx: fs.ctx });
    expect(err).toEqual([]);
    expect(fs.content('/home/guest/empty/docs/sub/b.txt')).toBe('B');
    expect(fs.vfs.nodeAt('/home/guest/docs')).toBeUndefined();
  });

  it('refuses to move a directory into itself and leaves it intact', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['docs', 'docs/sub'], { ctx: fs.ctx });
    expect(err[0]).toContain('subdirectory of itself');
    expect(fs.content('/home/guest/docs/a.txt')).toBe('A');
    expect(fs.content('/home/guest/docs/sub/b.txt')).toBe('B');
    expect(fs.vfs.nodeAt('/home/guest/docs/sub/docs')).toBeUndefined();
  });

  it('refuses to move a file onto itself', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['notes.txt', '.'], { ctx: fs.ctx });
    expect(err[0]).toContain('are the same file');
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');
  });

  it('keeps the source when the destination cannot be written', async () => {
    const fs = makeFs();
    const fileMove = await runCommand('mv', ['notes.txt', '/etc/notes.txt'], { ctx: fs.ctx });
    expect(fileMove.err[0]).toContain('Permission denied');
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');

    const dirMove = await runCommand('mv', ['docs', '/etc/docs'], { ctx: fs.ctx });
    expect(dirMove.err[0]).toContain('Permission denied');
    expect(fs.content('/home/guest/docs/sub/b.txt')).toBe('B');

    const orphan = await runCommand('mv', ['notes.txt', 'nowhere/x.txt'], { ctx: fs.ctx });
    expect(orphan.err[0]).toContain('No such file or directory');
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');
  });

  it('keeps the source and drops the partial copy when a write fails midway', async () => {
    const fs = makeFs();
    // Fail on the last file of the tree, after the first ones were written.
    const failingWrite = (path: string, content: string) =>
      path.endsWith('b.txt') ? 'disk full' : fs.ctx.write(path, content);
    const { err } = await runCommand('mv', ['docs', 'papers'], {
      ctx: { ...fs.ctx, write: failingWrite },
    });
    expect(err).toEqual(['mv: disk full']);
    expect(fs.content('/home/guest/docs/a.txt')).toBe('A');
    expect(fs.content('/home/guest/docs/sub/b.txt')).toBe('B');
    expect(fs.vfs.nodeAt('/home/guest/papers')).toBeUndefined();
  });

  it('says so when the copy succeeded but the source could not be removed', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['/etc/motd', 'motd.txt'], { ctx: fs.ctx });
    expect(err).toHaveLength(1);
    expect(err[0]).toContain('was copied');
    expect(err[0]).toContain('Permission denied');
    expect(fs.content('/home/guest/motd.txt')).toBe('welcome');
    expect(fs.content('/etc/motd')).toBe('welcome');
  });

  it('refuses to move the directory the shell stands in', async () => {
    const fs = makeFs();
    fs.vfs.chdir('docs/sub');
    const { err } = await runCommand('mv', ['/home/guest/docs', '/home/guest/papers'], {
      ctx: fs.ctx,
    });
    expect(err[0]).toContain('directory in use');
    expect(fs.isDir('/home/guest/docs')).toBe(true);
    expect(fs.vfs.nodeAt('/home/guest/papers')).toBeUndefined();
  });

  it('refuses to move onto a non-empty directory', async () => {
    const fs = makeFs();
    const { err } = await runCommand('mv', ['docs', 'archive'], { ctx: fs.ctx });
    expect(err[0]).toContain('Directory not empty');
    expect(fs.content('/home/guest/docs/a.txt')).toBe('A');
    expect(fs.content('/home/guest/archive/docs/old.txt')).toBe('old');
  });

  it('reports a missing source, a bad target and its usage', async () => {
    const fs = makeFs();
    const missing = await runCommand('mv', ['nope', 'x'], { ctx: fs.ctx });
    expect(missing.err).toEqual(["mv: cannot stat 'nope': No such file or directory"]);
    const several = await runCommand('mv', ['notes.txt', 'about.md', 'x'], { ctx: fs.ctx });
    expect(several.err).toEqual(["mv: target 'x' is not a directory"]);
    expect(fs.content('/home/guest/notes.txt')).toBe('hello');
    expect((await runCommand('mv', ['one'])).err[0]).toContain('usage: mv');
  });
});

describe('which', () => {
  const commands = [
    { name: 'ls', desc: '', alias: [], man: '' },
    { name: 'cal', desc: '', alias: ['calendar'], man: '' },
  ];

  it('prints the /bin path of commands and resolves aliases', async () => {
    const { out, err } = await runCommand('which', ['ls', 'calendar'], { ctx: { commands } });
    expect(out).toEqual(['/bin/ls', 'calendar → /bin/cal']);
    expect(err).toEqual([]);
  });

  it('reports unknown names and still resolves the others', async () => {
    const { out, err } = await runCommand('which', ['nope', 'cal'], { ctx: { commands } });
    expect(out).toEqual(['/bin/cal']);
    expect(err).toEqual(['which: no nope in (/bin)']);
  });

  it('needs a name', async () => {
    expect((await runCommand('which', [], { ctx: { commands } })).err).toEqual([
      'usage: which <name>...',
    ]);
  });
});

describe('env', () => {
  it('prints the session state as KEY=value lines', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    const fs = makeFs();
    fs.vfs.chdir('docs');
    const { out, err } = await runCommand('env', [], {
      ctx: { ...fs.ctx, currentTheme: () => 'amber' },
    });
    expect(err).toEqual([]);
    expect(out).toContain('USER=guest');
    expect(out).toContain('HOME=/home/guest');
    expect(out).toContain('PWD=/home/guest/docs');
    expect(out).toContain('HOSTNAME=example.test');
    expect(out).toContain('LANG=fr_FR.UTF-8');
    expect(out).toContain('THEME=amber');
    expect(out).toContain('LUDOS_VERSION=9.9.9');
    for (const line of out) expect(line).toMatch(/^[A-Z_]+=.+$/);
  });

  it('follows the identity after su', async () => {
    const fs = makeFs();
    fs.vfs.su();
    const { out } = await runCommand('env', ['USER', 'HOME', 'PWD'], { ctx: fs.ctx });
    expect(out).toEqual(['root', '/root', '/root']);
  });

  it('prints single values and reports unknown names', async () => {
    const fs = makeFs();
    const { out, err } = await runCommand('env', ['HOME', '$user', 'NOPE'], { ctx: fs.ctx });
    expect(out).toEqual(['/home/guest', 'guest']);
    expect(err).toEqual(['env: NOPE: not set']);
  });

  it('leaves out what the environment does not expose', async () => {
    // No theme accessor and no version: those variables are simply absent.
    const { out } = await runCommand('env', [], {
      ctx: { cfg: { host: 'example.test', user: 'guest', home: '/home/guest', links: {} } },
    });
    expect(out.some((line) => line.startsWith('THEME='))).toBe(false);
    expect(out.some((line) => line.startsWith('LUDOS_VERSION='))).toBe(false);
    expect(out.some((line) => line.startsWith('PWD='))).toBe(false);
    expect(out).toContain('USER=guest');
  });
});

describe('json', () => {
  const sample = { name: 'LudOS', tags: ['shell', 'astro'], nested: { ok: true, n: null } };

  it('pretty-prints with two spaces', async () => {
    const { out, err } = await runCommand('json', [JSON.stringify(sample)]);
    expect(err).toEqual([]);
    expect(out).toEqual([JSON.stringify(sample, null, 2)]);
  });

  it('keeps special characters intact through the syntax colouring', async () => {
    const tricky = { 'a<b': 'x & "y" \\ </span>', n: -1.5e-7, t: [true, false, null] };
    const { out } = await runCommand('json', [JSON.stringify(tricky)]);
    expect(JSON.parse(out[0])).toEqual(tricky);
  });

  it('minifies with -c', async () => {
    const { out } = await runCommand('json', ['-c', '{ "a": 1,\n "b": [1, 2] }']);
    expect(out).toEqual(['{"a":1,"b":[1,2]}']);
  });

  it('accepts scalars and JSON typed as several arguments', async () => {
    expect((await runCommand('json', ['42'])).out).toEqual(['42']);
    expect((await runCommand('json', ['-5'])).out).toEqual(['-5']);
    expect((await runCommand('json', ['{"a":', '1}'])).out).toEqual(['{\n  "a": 1\n}']);
  });

  it('reads a file operand or piped input', async () => {
    const read = (path: string) =>
      path === 'data.json' ? { content: '{"v":1}', name: 'data.json' } : { error: 'No such file' };
    expect((await runCommand('json', ['-c', 'data.json'], { ctx: { read } })).out).toEqual([
      '{"v":1}',
    ]);
    expect((await runCommand('json', ['-c'], { stdin: '[1,\n2]\n' })).out).toEqual(['[1,2]']);
  });

  it('extracts values with -q', async () => {
    const doc = JSON.stringify({
      a: { b: [{ c: 'deep' }] },
      items: [{ name: 'x' }, { name: 'y' }],
      'my key': 7,
    });
    const query = async (path: string, ...flags: string[]) =>
      (await runCommand('json', [...flags, '-q', path, doc])).out;
    expect(await query('.a.b[0].c')).toEqual(['"deep"']);
    expect(await query('.items[].name')).toEqual(['"x"', '"y"']);
    expect(await query('.items[-1].name', '-r')).toEqual(['y']);
    expect(await query('.["my key"]')).toEqual(['7']);
    expect(await query('.items[5]')).toEqual(['null']);
    expect(await query('.missing.deeper')).toEqual(['null']);
    expect(await query('items[0]', '-c')).toEqual(['{"name":"x"}']);
    expect(await query('.', '-c')).toEqual([doc]);
    expect(await query('.a[]', '-c')).toEqual(['[{"c":"deep"}]']);
  });

  it('reports query errors', async () => {
    const doc = '{"a":[1,2],"s":"text"}';
    const failure = async (path: string) => (await runCommand('json', ['-q', path, doc])).err[0];
    expect(await failure('.a.b')).toBe('json: cannot read key "b" of an array');
    expect(await failure('.s[0]')).toBe('json: cannot read index 0 of a string');
    expect(await failure('.s[]')).toBe('json: cannot iterate over a string');
    expect(await failure('.a..b')).toContain('cannot read the path at "..b"');
    expect((await runCommand('json', [doc, '-q'])).err[0]).toContain('-q needs a path');
  });

  it('locates a syntax error by line and column', async () => {
    const { out, err } = await runCommand('json', ['{"a": 1,\n  "b" 2}']);
    expect(out).toEqual([]);
    expect(err[0]).toBe(
      "json: invalid JSON at line 2, column 7: expected ':' after a property name, found '2'",
    );
    expect(err[1]).toBe('    "b" 2}');
    expect(err[2]).toBe('        ^');
  });

  it('explains common mistakes', async () => {
    const failure = async (text: string) => (await runCommand('json', [text])).err[0];
    expect(await failure('[1, 2,]')).toContain("line 1, column 7: unexpected ']'");
    expect(await failure("{'a': 1}")).toContain('column 2: expected a double-quoted property name');
    expect(await failure('{"a": "x')).toContain('unterminated string');
    expect(await failure('{"a": 1} extra')).toContain('column 10');
    expect(await failure('[01]')).toContain('line 1, column 3');
    expect(await failure('{"a": tru}')).toContain("line 1, column 7: unexpected 't'");
    expect(await failure('{"a": 1')).toContain("expected ',' or '}', found end of input");
  });

  it('rejects empty input, missing input and unknown options', async () => {
    expect((await runCommand('json', [], { stdin: '' })).err).toEqual(['json: empty input']);
    expect((await runCommand('json')).err[0]).toContain('usage: json');
    expect((await runCommand('json', ['-x', '1'])).err).toEqual(['json: invalid option -- x']);
  });
});

describe('epoch', () => {
  const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
  const freeze = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  };
  /** The value of a labelled output row. */
  const row = (out: string[], label: string): string | undefined =>
    out.find((line) => line.startsWith(label.padEnd(10)))?.slice(10);

  it('prints the current time in seconds, or milliseconds with -m', async () => {
    freeze();
    expect((await runCommand('epoch')).out).toEqual([String(NOW / 1000)]);
    expect((await runCommand('epoch', ['-m'])).out).toEqual([String(NOW)]);
  });

  it('converts seconds to a date, with the distance from now', async () => {
    freeze();
    const threeDaysAgo = NOW / 1000 - 3 * 86400;
    const { out, err } = await runCommand('epoch', [String(threeDaysAgo)]);
    expect(err).toEqual([]);
    expect(row(out, 'read as')).toBe('seconds (auto-detected)');
    expect(row(out, 'seconds')).toBe(String(threeDaysAgo));
    expect(row(out, 'millis')).toBe(String(threeDaysAgo * 1000));
    expect(row(out, 'utc')).toBe('2026-01-12T12:00:00.000Z');
    expect(row(out, 'local')).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d\d:\d\d/);
    expect(row(out, 'relative')).toBe('3 days ago');
  });

  it('auto-detects milliseconds', async () => {
    freeze();
    const { out } = await runCommand('epoch', ['1700000000000']);
    expect(row(out, 'read as')).toBe('milliseconds (auto-detected)');
    expect(row(out, 'seconds')).toBe('1700000000');
    expect(row(out, 'utc')).toBe('2023-11-14T22:13:20.000Z');
    expect(row(out, 'relative')).toBe('2 years ago');
  });

  it('lets -s and -m override the detection', async () => {
    freeze();
    const asMillis = await runCommand('epoch', ['-m', '86400000']);
    expect(row(asMillis.out, 'read as')).toBe('milliseconds (forced)');
    expect(row(asMillis.out, 'utc')).toBe('1970-01-02T00:00:00.000Z');
    const asSeconds = await runCommand('epoch', ['-s', '86400000']);
    expect(row(asSeconds.out, 'utc')).toBe('1972-09-27T00:00:00.000Z');
  });

  it('handles the future, the past before 1970 and fractions', async () => {
    freeze();
    const inTwoHours = await runCommand('epoch', [String(NOW / 1000 + 2 * 3600 + 5)]);
    expect(row(inTwoHours.out, 'relative')).toBe('in 2 hours');
    const before1970 = await runCommand('epoch', ['-86400']);
    expect(row(before1970.out, 'utc')).toBe('1969-12-31T00:00:00.000Z');
    const fraction = await runCommand('epoch', ['1700000000.5']);
    expect(row(fraction.out, 'millis')).toBe('1700000000500');
    const oneMinute = await runCommand('epoch', [String(NOW / 1000 - 60)]);
    expect(row(oneMinute.out, 'relative')).toBe('1 minute ago');
  });

  it('converts a date to its timestamp', async () => {
    freeze();
    const { out, err } = await runCommand('epoch', ['2026-01-15T12:00:00Z']);
    expect(err).toEqual([]);
    expect(row(out, 'read as')).toBeUndefined();
    expect(row(out, 'seconds')).toBe(String(NOW / 1000));
    expect(row(out, 'millis')).toBe(String(NOW));
    expect(row(out, 'relative')).toBe('now');
    // A date alone is UTC midnight in every time zone.
    const dateOnly = await runCommand('epoch', ['2024-02-29']);
    expect(row(dateOnly.out, 'seconds')).toBe(String(Date.UTC(2024, 1, 29) / 1000));
    expect(row((await runCommand('epoch', ['now'])).out, 'millis')).toBe(String(NOW));
  });

  it('reads the value from a pipe', async () => {
    freeze();
    const { out } = await runCommand('epoch', [], { stdin: '1700000000\n' });
    expect(row(out, 'utc')).toBe('2023-11-14T22:13:20.000Z');
  });

  it('rejects what it cannot read or represent', async () => {
    freeze();
    expect((await runCommand('epoch', ['not', 'a', 'date'])).err[0]).toContain(
      'cannot read "not a date"',
    );
    expect((await runCommand('epoch', ['99999999999999999999'])).err[0]).toContain('out of range');
  });
});

describe('urlencode', () => {
  it('percent-encodes reserved and non-ASCII characters', async () => {
    expect((await runCommand('urlencode', ['hello world & more'])).out).toEqual([
      'hello%20world%20%26%20more',
    ]);
    expect((await runCommand('urlencode', ['café/?=#'])).out).toEqual(['caf%C3%A9%2F%3F%3D%23']);
    // RFC 3986 sub-delimiters that encodeURIComponent leaves alone.
    expect((await runCommand('urlencode', ["!'()*"])).out).toEqual(['%21%27%28%29%2A']);
    expect((await runCommand('urlencode', ['a-b_c.d~e'])).out).toEqual(['a-b_c.d~e']);
  });

  it('joins several arguments with a space', async () => {
    expect((await runCommand('urlencode', ['a', 'b'])).out).toEqual(['a%20b']);
  });

  it('uses + for spaces in form mode, both ways', async () => {
    expect((await runCommand('urlencode', ['-f', 'a b+c'])).out).toEqual(['a+b%2Bc']);
    expect((await runCommand('urlencode', ['-df', 'a+b%2Bc'])).out).toEqual(['a b+c']);
    expect((await runCommand('urlencode', ['-d', 'a+b'])).out).toEqual(['a+b']);
  });

  it('decodes with -d', async () => {
    expect((await runCommand('urlencode', ['-d', 'caf%C3%A9%20%26%20th%c3%a9'])).out).toEqual([
      'café & thé',
    ]);
  });

  it('processes piped input line by line', async () => {
    const { out } = await runCommand('urlencode', [], { stdin: 'a b\nc&d\n' });
    expect(out).toEqual(['a%20b', 'c%26d']);
    expect((await runCommand('urlencode', [], { stdin: '' })).out).toEqual([]);
  });

  it('reports malformed input instead of throwing', async () => {
    const badEscape = await runCommand('urlencode', ['-d', 'ok%zzrest']);
    expect(badEscape.out).toEqual([]);
    expect(badEscape.err).toEqual([
      'urlencode: malformed input: "%zz" at position 3 is not a %XX escape',
    ]);
    const badUtf8 = await runCommand('urlencode', ['-d', '%C3%28']);
    expect(badUtf8.err[0]).toContain('not valid UTF-8');
    const loneSurrogate = await runCommand('urlencode', ['\ud800']);
    expect(loneSurrogate.err[0]).toContain('invalid Unicode');
  });

  it('handles options, -- and a missing text', async () => {
    expect((await runCommand('urlencode', ['--', '-d'])).out).toEqual(['-d']);
    expect((await runCommand('urlencode', ['-x', 'a'])).err).toEqual([
      'urlencode: invalid option -- x',
    ]);
    expect((await runCommand('urlencode')).err[0]).toContain('usage: urlencode');
  });
});

describe('urldecode', () => {
  it('decodes an argument or piped lines', async () => {
    expect((await runCommand('urldecode', ['hello%20world%20%26%20caf%C3%A9'])).out).toEqual([
      'hello world & café',
    ]);
    expect((await runCommand('urldecode', [], { stdin: 'a%20b\nc%26d' })).out).toEqual([
      'a b',
      'c&d',
    ]);
  });

  it('reads + as a space only in form mode', async () => {
    expect((await runCommand('urldecode', ['a+b'])).out).toEqual(['a+b']);
    expect((await runCommand('urldecode', ['-f', 'a+b%2Bc'])).out).toEqual(['a b+c']);
  });

  it('reverses urlencode', async () => {
    const text = 'Zoé & Léa: 100% "sûr" ? #1 / (ok)*';
    const encoded = (await runCommand('urlencode', [text])).out[0];
    expect(encoded).toMatch(/^[A-Za-z0-9%._~-]+$/);
    expect((await runCommand('urldecode', [encoded])).out).toEqual([text]);
  });

  it('reports malformed input instead of throwing', async () => {
    const trailing = await runCommand('urldecode', ['100%']);
    expect(trailing.out).toEqual([]);
    expect(trailing.err).toEqual([
      'urldecode: malformed input: "%" at position 4 is not a %XX escape',
    ]);
    expect((await runCommand('urldecode', ['%FF'])).err[0]).toContain('not valid UTF-8');
    expect((await runCommand('urldecode')).err[0]).toContain('usage: urldecode');
    expect((await runCommand('urldecode', ['-x'])).err[0]).toContain('invalid option');
  });
});

describe('regex', () => {
  it('lists a match with its position and capture groups', async () => {
    const { out, err } = await runCommand('regex', ['(\\d+)-(\\d+)', 'call 555-0199 now']);
    expect(err).toEqual([]);
    expect(out).toEqual([
      'call 555-0199 now',
      '',
      '#1  5-13  "555-0199"',
      '    $1  "555"',
      '    $2  "0199"',
      '1 match',
    ]);
  });

  it('finds every match and shows named groups', async () => {
    const { out } = await runCommand('regex', ['(?<key>\\w+)=(?<value>\\w+)', 'a=1, b=2']);
    expect(out).toContain('#1  0-3  "a=1"');
    expect(out).toContain('#2  5-8  "b=2"');
    expect(out).toContain('    <key>  "b"');
    expect(out).toContain('    <value>  "2"');
    expect(out[out.length - 1]).toBe('2 matches');
  });

  it('applies flags given after the pattern or in /pattern/flags form', async () => {
    const positional = await runCommand('regex', ['A', 'i', 'banana']);
    expect(positional.out[positional.out.length - 1]).toBe('3 matches');
    const literal = await runCommand('regex', ['/^b/im', 'a\nB']);
    expect(literal.out).toContain('#1  2-3  "B"');
    const caseSensitive = await runCommand('regex', ['A', 'banana']);
    expect(caseSensitive.out).toEqual(['no match']);
  });

  it('only reads a word as flags when a text remains', async () => {
    // `is` could be flags, but it is the only text.
    expect((await runCommand('regex', ['s', 'is'])).out).toContain('#1  1-2  "s"');
    // `--` keeps a flag-looking first word in the text.
    const separated = await runCommand('regex', ['is', '--', 'is', 'this']);
    expect(separated.out[0]).toBe('is this');
    expect(separated.out[separated.out.length - 1]).toBe('2 matches');
    // With piped text, the word after the pattern is the flags.
    const piped = await runCommand('regex', ['HELLO', 'i'], { stdin: 'hello world' });
    expect(piped.out).toContain('#1  0-5  "hello"');
  });

  it('reads the text from a pipe', async () => {
    const { out } = await runCommand('regex', ['o+'], { stdin: 'foo\nboo' });
    expect(out[0]).toBe('foo\nboo');
    expect(out).toContain('#2  5-7  "oo"');
  });

  it('shows groups that did not take part and escapes special characters', async () => {
    const { out } = await runCommand('regex', ['(a)|(<b>)', 'a <b>']);
    expect(out[0]).toBe('a <b>');
    expect(out).toContain('    $2  (no match)');
    expect(out).toContain('#2  2-5  "<b>"');
  });

  it('terminates on empty matches', async () => {
    const { out } = await runCommand('regex', ['x*', 'ab']);
    expect(out[out.length - 1]).toBe('3 matches');
    expect(out).toContain('#3  2-2  ""');
  });

  it('caps the number of matches shown', async () => {
    const { out } = await runCommand('regex', ['a', 'a'.repeat(300)]);
    expect(out[out.length - 1]).toBe('200 matches shown — there are more (limit 200)');
  });

  it("reports an invalid pattern or flags with the engine's message", async () => {
    const badPattern = await runCommand('regex', ['(unclosed', 'text']);
    expect(badPattern.out).toEqual([]);
    expect(badPattern.err[0]).toMatch(/^regex: Invalid regular expression/);
    const badFlags = await runCommand('regex', ['/a/gg', 'text']);
    expect(badFlags.err[0]).toMatch(/^regex: Invalid flags/);
  });

  it('needs a pattern and a text', async () => {
    expect((await runCommand('regex')).err[0]).toContain('usage: regex');
    expect((await runCommand('regex', ['abc'])).err[0]).toContain('no text to search');
  });
});

describe('cron', () => {
  /** Thursday 15 January 2026, 10:30 local time — in whatever zone the suite runs. */
  const freeze = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 15, 10, 30, 0));
  };
  const explain = async (expression: string) => (await runCommand('cron', [expression])).out[0];
  /** The run lines (`YYYY-MM-DD HH:MM  Day  in …`) of an output. */
  const runsOf = (out: string[]) =>
    out.filter((line) => /^\d{4}-\d\d-\d\d \d\d:\d\d {2}/.test(line));

  it('explains expressions in plain English', async () => {
    freeze();
    expect(await explain('* * * * *')).toBe('At every minute.');
    expect(await explain('*/5 * * * *')).toBe('At every 5th minute.');
    expect(await explain('30 9 * * *')).toBe('At 09:30.');
    expect(await explain('0 * * * *')).toBe('At minute 0.');
    expect(await explain('*/15 9-17 * * MON-FRI')).toBe(
      'At every 15th minute past every hour from 9 through 17 ' +
        'on every day-of-week from Monday through Friday.',
    );
    expect(await explain('0 0 1,15 * *')).toBe('At 00:00 on day-of-month 1 and 15.');
    expect(await explain('0 8 * JAN,JUL 1')).toBe('At 08:00 on Monday in January and July.');
    expect(await explain('1-10/2 */3 * * *')).toBe(
      'At every 2nd minute from 1 through 10 past every 3rd hour.',
    );
    expect(await explain('0,30 8 * * *')).toBe('At minute 0 and 30 past hour 8.');
    expect(await explain('0 0 * * 7')).toBe('At 00:00 on Sunday.');
    expect(await explain('0 0 * 3-5 sat,sun')).toBe(
      'At 00:00 on Saturday and Sunday in every month from March through May.',
    );
  });

  it('accepts the five fields unquoted and the @ shortcuts', async () => {
    freeze();
    const unquoted = await runCommand('cron', ['30', '9', '*', '*', '*']);
    expect(unquoted.out[0]).toBe('At 09:30.');
    const daily = await runCommand('cron', ['@daily']);
    expect(daily.out.slice(0, 2)).toEqual(['@daily = 0 0 * * *', 'At 00:00.']);
    expect((await runCommand('cron', ['@HOURLY'])).out[1]).toBe('At minute 0.');
    expect((await runCommand('cron', ['@weekly'])).out[1]).toBe('At 00:00 on Sunday.');
    expect((await runCommand('cron', ['@yearly'])).out[1]).toBe(
      'At 00:00 on day-of-month 1 in January.',
    );
  });

  it('lists the next five runs in local time', async () => {
    freeze();
    const { out, err } = await runCommand('cron', ['*/5 * * * *']);
    expect(err).toEqual([]);
    expect(out.slice(1, 3)).toEqual(['', 'next runs (your local time)']);
    expect(runsOf(out)).toEqual([
      '2026-01-15 10:35  Thu  in 5 minutes',
      '2026-01-15 10:40  Thu  in 10 minutes',
      '2026-01-15 10:45  Thu  in 15 minutes',
      '2026-01-15 10:50  Thu  in 20 minutes',
      '2026-01-15 10:55  Thu  in 25 minutes',
    ]);
  });

  it('skips the current minute and rolls over days, months and years', async () => {
    freeze();
    const sameMinute = await runCommand('cron', ['-n', '2', '30 10 * * *']);
    expect(runsOf(sameMinute.out).map((line) => line.slice(0, 16))).toEqual([
      '2026-01-16 10:30',
      '2026-01-17 10:30',
    ]);
    const monthly = await runCommand('cron', ['-n', '3', '0 0 1 * *']);
    expect(runsOf(monthly.out).map((line) => line.slice(0, 21))).toEqual([
      '2026-02-01 00:00  Sun',
      '2026-03-01 00:00  Sun',
      '2026-04-01 00:00  Wed',
    ]);
    const leapDay = await runCommand('cron', ['-n', '2', '0 0 29 2 *']);
    expect(runsOf(leapDay.out).map((line) => line.slice(0, 10))).toEqual([
      '2028-02-29',
      '2032-02-29',
    ]);
  });

  it('runs on either day when day-of-month and day-of-week are both set', async () => {
    freeze();
    const either = await runCommand('cron', ['0 0 20 * FRI']);
    expect(either.out[0]).toBe('At 00:00 on day-of-month 20 or on Friday.');
    expect(runsOf(either.out).map((line) => line.slice(0, 21))).toEqual([
      '2026-01-16 00:00  Fri',
      '2026-01-20 00:00  Tue',
      '2026-01-23 00:00  Fri',
      '2026-01-30 00:00  Fri',
      '2026-02-06 00:00  Fri',
    ]);
    // A starred day-of-month does not count as a restriction, even with a step.
    const both = await runCommand('cron', ['-n', '3', '0 0 */2 * FRI']);
    expect(both.out[0]).toBe('At 00:00 on every 2nd day-of-month and on Friday.');
    expect(runsOf(both.out).map((line) => line.slice(0, 10))).toEqual([
      '2026-01-23',
      '2026-02-13',
      '2026-02-27',
    ]);
  });

  it('treats 7 as Sunday and a value with a step as an open range', async () => {
    freeze();
    const sunday = await runCommand('cron', ['-n', '1', '0 0 * * 7']);
    expect(runsOf(sunday.out)[0].slice(0, 21)).toBe('2026-01-18 00:00  Sun');
    const fromFive = await runCommand('cron', ['-n', '3', '5/20 11 * * *']);
    expect(runsOf(fromFive.out).map((line) => line.slice(11, 16))).toEqual([
      '11:05',
      '11:25',
      '11:45',
    ]);
  });

  it('says when an expression can never run', async () => {
    freeze();
    const { out } = await runCommand('cron', ['0 0 31 2 *']);
    expect(out[out.length - 1]).toContain('never runs');
  });

  it('names the field at fault', async () => {
    freeze();
    const failure = async (expression: string) => (await runCommand('cron', [expression])).err[0];
    expect(await failure('60 * * * *')).toBe('cron: minute: 60 is out of range (0-59)');
    expect(await failure('* 24 * * *')).toBe('cron: hour: 24 is out of range (0-23)');
    expect(await failure('* * 0 * *')).toBe('cron: day-of-month: 0 is out of range (1-31)');
    expect(await failure('* * * FOO *')).toBe('cron: month: "FOO" is not a valid value');
    expect(await failure('* * * * 8')).toBe('cron: day-of-week: 8 is out of range (0-7)');
    expect(await failure('*/0 * * * *')).toBe('cron: minute: step "0" must be a positive number');
    expect(await failure('* 5-2 * * *')).toBe('cron: hour: range "5-2" goes backwards');
    expect(await failure('1,,2 * * * *')).toBe('cron: minute: empty item in "1,,2"');
    expect(await failure('* * * * MON-')).toBe('cron: day-of-week: "MON-" is not a valid range');
  });

  it('rejects a wrong field count, unknown shortcuts and a bad -n', async () => {
    freeze();
    expect((await runCommand('cron', ['* * *'])).err[0]).toContain('expected 5 fields');
    expect((await runCommand('cron', ['* * * * * *'])).err[0]).toContain('got 6');
    expect((await runCommand('cron', ['@reboot'])).err[0]).toContain('@reboot');
    expect((await runCommand('cron', ['@sometimes'])).err[0]).toContain('unknown shortcut');
    expect((await runCommand('cron', ['-n', '0', '* * * * *'])).err[0]).toContain('-n takes');
    expect((await runCommand('cron')).err[0]).toContain('usage: cron');
  });
});

describe('color', () => {
  /** The value of a labelled output row. */
  const row = (out: string[], label: string): string | undefined =>
    out.find((line) => line.startsWith(label.padEnd(11)))?.slice(11);
  const convert = async (...args: string[]) => (await runCommand('color', args)).out;

  it('converts hex to every notation', async () => {
    const { out, err } = await runCommand('color', ['#ff8800']);
    expect(err).toEqual([]);
    expect(row(out, 'hex')).toBe('#ff8800');
    expect(row(out, 'rgb')).toBe('rgb(255, 136, 0)');
    expect(row(out, 'hsl')).toBe('hsl(32, 100%, 50%)');
  });

  it('accepts short hex, a missing # and upper case', async () => {
    expect(row(await convert('#f80'), 'hex')).toBe('#ff8800');
    expect(row(await convert('F80'), 'hex')).toBe('#ff8800');
    expect(row(await convert('FF8800'), 'rgb')).toBe('rgb(255, 136, 0)');
  });

  it('keeps the alpha channel', async () => {
    const out = await convert('#ff880080');
    expect(row(out, 'hex')).toBe('#ff880080');
    expect(row(out, 'rgb')).toBe('rgba(255, 136, 0, 0.502)');
    expect(row(out, 'hsl')).toBe('hsla(32, 100%, 50%, 0.502)');
    expect(out[out.length - 1]).toContain('alpha ignored');
    expect(row(await convert('#f808'), 'hex')).toBe('#ff880088');
  });

  it('reads rgb() in its comma, space, percentage and alpha forms', async () => {
    expect(row(await convert('rgb(255,', '136,', '0)'), 'hex')).toBe('#ff8800');
    expect(row(await convert('rgb(255 136 0)'), 'hex')).toBe('#ff8800');
    expect(row(await convert('RGB(100% 0% 0% / 50%)'), 'hex')).toBe('#ff000080');
    expect(row(await convert('rgba(0, 0, 255, 0.25)'), 'rgb')).toBe('rgba(0, 0, 255, 0.25)');
    // Out-of-range channels are clamped, like CSS does.
    expect(row(await convert('rgb(300, -5, 0)'), 'hex')).toBe('#ff0000');
  });

  it('reads hsl() and converts it to channels', async () => {
    expect(row(await convert('hsl(120, 100%, 25%)'), 'hex')).toBe('#008000');
    expect(row(await convert('hsl(240deg 100% 50%)'), 'rgb')).toBe('rgb(0, 0, 255)');
    expect(row(await convert('hsl(-120, 100%, 50%)'), 'hex')).toBe('#0000ff');
    expect(row(await convert('hsla(0, 0%, 50%, 0.5)'), 'rgb')).toBe('rgba(128, 128, 128, 0.5)');
    expect(row(await convert('#ffffff'), 'hsl')).toBe('hsl(0, 0%, 100%)');
    expect(row(await convert('#336699'), 'hsl')).toBe('hsl(210, 50%, 40%)');
  });

  it('computes the WCAG contrast against white and black', async () => {
    const black = await convert('#000');
    expect(row(black, 'on white')).toBe('21.00:1  AAA');
    expect(row(black, 'on black')).toBe('1.00:1  fails AA');
    expect(row(black, 'text')).toContain('white text');

    const orange = await convert('#ff8800');
    const onWhite = parseFloat(row(orange, 'on white') ?? '');
    const onBlack = parseFloat(row(orange, 'on black') ?? '');
    expect(onWhite).toBeCloseTo(2.39, 1);
    // Both ratios are measured from the same luminance: their product is 21.
    expect(onWhite * onBlack).toBeCloseTo(21, 0);
    expect(row(orange, 'on white')).toContain('fails AA');
    expect(row(orange, 'on black')).toContain('AAA');
    expect(row(orange, 'text')).toContain('black text');

    // #767676 is the classic lightest grey that still passes AA on white.
    expect(row(await convert('#767676'), 'on white')).toBe('4.54:1  AA');
    expect(row(await convert('#949494'), 'on white')).toBe('3.03:1  AA for large text only');
  });

  it('resolves colour names through the browser when a DOM is available', async () => {
    const names: Record<string, string> = { tomato: '#ff6347', transparent: 'rgba(0, 0, 0, 0)' };
    // A canvas keeps its previous fillStyle when given an invalid colour.
    const fakeContext = () => {
      let current = '#000000';
      return {
        get fillStyle() {
          return current;
        },
        set fillStyle(value: string) {
          if (/^#[0-9a-f]{6}$/.test(value)) current = value;
          else if (names[value.toLowerCase()]) current = names[value.toLowerCase()];
        },
      };
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: fakeContext }) });

    const tomato = await convert('Tomato');
    expect(row(tomato, 'name')).toBe('tomato');
    expect(row(tomato, 'hex')).toBe('#ff6347');
    expect(row(tomato, 'rgb')).toBe('rgb(255, 99, 71)');
    expect(row(await convert('transparent'), 'hex')).toBe('#00000000');

    const unknown = await runCommand('color', ['notacolour']);
    expect(unknown.out).toEqual([]);
    expect(unknown.err[0]).toContain('cannot read "notacolour"');
    expect(unknown.err[0]).not.toContain('need a browser');
  });

  it('explains that names need a browser when there is no DOM', async () => {
    const { out, err } = await runCommand('color', ['tomato']);
    expect(out).toEqual([]);
    expect(err[0]).toContain('colour names need a browser');
  });

  it('rejects malformed colours and reads piped input', async () => {
    expect((await runCommand('color', ['#12'])).err[0]).toContain('cannot read');
    expect((await runCommand('color', ['rgb(1, 2)'])).err[0]).toContain('cannot read');
    expect((await runCommand('color', ['hsl(10, 20px, 30%)'])).err[0]).toContain('cannot read');
    expect((await runCommand('color')).err[0]).toContain('usage: color');
    expect(row((await runCommand('color', [], { stdin: '#f80\n' })).out, 'hex')).toBe('#ff8800');
  });
});

describe('lorem', () => {
  const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
  const sentencesOf = (text: string) => text.match(/[^.]+\./g) ?? [];

  it('prints one paragraph of four to seven sentences by default', async () => {
    const { out, err } = await runCommand('lorem');
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    const sentences = sentencesOf(out[0]);
    expect(sentences.length).toBeGreaterThanOrEqual(4);
    expect(sentences.length).toBeLessThanOrEqual(7);
    for (const sentence of sentences) {
      expect(sentence.trim()).toMatch(/^[A-Z][a-z]+(,? [a-z]+){5,13}\.$/);
    }
  });

  it('generates the requested number of words', async () => {
    const { out } = await runCommand('lorem', ['20', 'words']);
    expect(out).toHaveLength(1);
    expect(wordsOf(out[0])).toHaveLength(20);
    expect(out[0]).toMatch(/^[a-z ]+$/);
    expect(wordsOf((await runCommand('lorem', ['words', '7'])).out[0])).toHaveLength(7);
    expect(wordsOf((await runCommand('lorem', ['3', 'w'])).out[0])).toHaveLength(3);
  });

  it('never repeats a word twice in a row', async () => {
    const words = wordsOf((await runCommand('lorem', ['2000', 'words'])).out[0]);
    for (let index = 1; index < words.length; index++) {
      expect(words[index]).not.toBe(words[index - 1]);
    }
  });

  it('generates the requested number of sentences', async () => {
    const { out } = await runCommand('lorem', ['3', 'sentences']);
    expect(out).toHaveLength(1);
    expect(sentencesOf(out[0])).toHaveLength(3);
    expect(sentencesOf((await runCommand('lorem', ['1', 's'])).out[0])).toHaveLength(1);
  });

  it('separates paragraphs with a blank line', async () => {
    const { out } = await runCommand('lorem', ['3', 'paragraphs']);
    expect(out).toHaveLength(5);
    expect(out[1]).toBe('');
    expect(out[3]).toBe('');
    for (const index of [0, 2, 4]) expect(sentencesOf(out[index]).length).toBeGreaterThanOrEqual(4);
  });

  it('starts with the classic opening with -s', async () => {
    const paragraph = (await runCommand('lorem', ['-s'])).out[0];
    expect(paragraph.startsWith('Lorem ipsum dolor sit amet, ')).toBe(true);
    const sentence = (await runCommand('lorem', ['2', 'sentences', '-s'])).out[0];
    expect(sentence.startsWith('Lorem ipsum dolor sit amet, ')).toBe(true);
    expect((await runCommand('lorem', ['-s', '8', 'words'])).out[0]).toMatch(
      /^Lorem ipsum dolor sit amet( [a-z]+){3}$/,
    );
    expect((await runCommand('lorem', ['-s', '3', 'words'])).out).toEqual(['Lorem ipsum dolor']);
  });

  it('is driven by Math.random only', async () => {
    // A constant draw always picks the same word, except where the
    // no-repeat rule would loop forever — so alternate between two values.
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (calls++ % 2 === 0 ? 0 : 0.99));
    const first = (await runCommand('lorem', ['6', 'words'])).out[0];
    calls = 0;
    const second = (await runCommand('lorem', ['6', 'words'])).out[0];
    expect(first).toBe(second);
    expect(first).toBe('lorem laborum lorem laborum lorem laborum');
  });

  it('rejects bad counts, units and extra arguments', async () => {
    expect((await runCommand('lorem', ['0'])).err[0]).toContain('between 1 and 100');
    expect((await runCommand('lorem', ['5001', 'words'])).err[0]).toContain('between 1 and 5000');
    expect((await runCommand('lorem', ['3', 'chapters'])).err[0]).toContain('usage: lorem');
    expect((await runCommand('lorem', ['3', '4'])).err[0]).toContain('usage: lorem');
  });
});
