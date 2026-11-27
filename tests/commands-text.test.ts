import { describe, expect, it } from 'vitest';
import { runCommand } from './run-command.ts';

/** A tiny in-memory file set standing in for the VFS (`ctx.read`). */
const FILES: Record<string, string> = {
  'numbers.txt': '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n',
  'short.txt': 'alpha\nbeta\n',
  'unterminated.txt': 'one\ntwo\nthree',
  'empty.txt': '',
  'fruits.txt': 'pear\nApple\nbanana\napple\nCherry\nbanana\n',
  'scores.txt': 'bob 10\nalice 9\ncarol 100\ndave 9\n',
  'data.csv': 'name,age,city\nAda,36,London\nLinus,28,Helsinki\n',
  'tabs.tsv': 'a\tb\tc\nd\te\tf\n',
  'old.txt': 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\n',
  'new.txt': 'a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\nO\np\nq\n',
};

const read = (path: string) =>
  FILES[path] === undefined
    ? { error: 'No such file or directory' }
    : { content: FILES[path], name: path };

/** Runs a command against the in-memory files, optionally with piped stdin. */
const run = (name: string, args: string[] = [], stdin?: string) =>
  runCommand(name, args, { stdin, ctx: { read } });

/** The command's stdout as lines, the way the next pipe stage would read it. */
const lines = (result: { out: string[] }) => result.out.join('\n').split('\n');

describe('head', () => {
  it('prints the first 10 lines by default', async () => {
    const result = await run('head', ['numbers.txt']);
    expect(lines(result)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(result.err).toEqual([]);
  });

  it('accepts -n N, -nN and -N', async () => {
    expect(lines(await run('head', ['-n', '2', 'numbers.txt']))).toEqual(['1', '2']);
    expect(lines(await run('head', ['-n3', 'numbers.txt']))).toEqual(['1', '2', '3']);
    expect(lines(await run('head', ['-1', 'numbers.txt']))).toEqual(['1']);
    expect((await run('head', ['-n', '0', 'numbers.txt'])).out).toEqual([]);
  });

  it('reads piped stdin, with or without the `-` operand', async () => {
    expect(lines(await run('head', ['-2'], 'a\nb\nc'))).toEqual(['a', 'b']);
    expect(lines(await run('head', ['-n', '1', '-'], 'a\nb\nc'))).toEqual(['a']);
  });

  it('adds headers when several files are given', async () => {
    const result = await run('head', ['-n', '1', 'short.txt', 'unterminated.txt']);
    expect(lines(result)).toEqual([
      '==> short.txt <==',
      'alpha',
      '',
      '==> unterminated.txt <==',
      'one',
    ]);
  });

  it('keeps a last line that has no newline, and prints nothing for empty input', async () => {
    expect(lines(await run('head', ['unterminated.txt']))).toEqual(['one', 'two', 'three']);
    expect((await run('head', ['empty.txt'])).out).toEqual([]);
    expect(await run('head', [], '')).toEqual({ out: [], err: [] });
  });

  it('reports a missing file and carries on with the others', async () => {
    const result = await run('head', ['-n', '1', 'nope.txt', 'short.txt']);
    expect(result.err).toEqual(['head: nope.txt: No such file or directory']);
    expect(lines(result)).toEqual(['==> short.txt <==', 'alpha']);
  });

  it('rejects bad options and a missing input', async () => {
    expect((await run('head', ['-x', 'short.txt'])).err[0]).toContain("invalid option '-x'");
    expect((await run('head', ['-n', 'abc', 'short.txt'])).err[0]).toContain(
      "invalid number of lines: 'abc'",
    );
    expect((await run('head', ['-n'])).err[0]).toContain('requires an argument');
    expect((await run('head')).err).toEqual(['usage: head [-n N] <file>...']);
  });
});

describe('tail', () => {
  it('prints the last 10 lines by default', async () => {
    const result = await run('tail', ['numbers.txt']);
    expect(lines(result)).toEqual(['3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('accepts -n N, -nN and -N', async () => {
    expect(lines(await run('tail', ['-n', '2', 'numbers.txt']))).toEqual(['11', '12']);
    expect(lines(await run('tail', ['-n3', 'numbers.txt']))).toEqual(['10', '11', '12']);
    expect(lines(await run('tail', ['-1', 'numbers.txt']))).toEqual(['12']);
    expect((await run('tail', ['-n', '0', 'numbers.txt'])).out).toEqual([]);
  });

  it('starts from line N with -n +N', async () => {
    expect(lines(await run('tail', ['-n', '+11', 'numbers.txt']))).toEqual(['11', '12']);
    expect(lines(await run('tail', ['-n+2', 'short.txt']))).toEqual(['beta']);
    expect(lines(await run('tail', ['-n', '+1', 'short.txt']))).toEqual(['alpha', 'beta']);
    expect((await run('tail', ['-n', '+99', 'short.txt'])).out).toEqual([]);
  });

  it('reads piped stdin and unterminated last lines', async () => {
    expect(lines(await run('tail', ['-2'], 'a\nb\nc'))).toEqual(['b', 'c']);
    expect(lines(await run('tail', ['-n', '1', 'unterminated.txt']))).toEqual(['three']);
    expect(await run('tail', [], '')).toEqual({ out: [], err: [] });
  });

  it('adds headers when several files are given', async () => {
    const result = await run('tail', ['-n', '1', 'short.txt', 'numbers.txt']);
    expect(lines(result)).toEqual(['==> short.txt <==', 'beta', '', '==> numbers.txt <==', '12']);
  });

  it('reports missing files, bad options and a missing input', async () => {
    expect((await run('tail', ['nope.txt'])).err).toEqual([
      'tail: nope.txt: No such file or directory',
    ]);
    expect((await run('tail', ['-f', 'short.txt'])).err[0]).toContain("invalid option '-f'");
    expect((await run('tail', ['-n', '-3', 'short.txt'])).err[0]).toContain(
      'invalid number of lines',
    );
    expect((await run('tail')).err[0]).toContain('usage: tail');
  });
});

describe('sort', () => {
  it('sorts in code point order (capitals before lowercase)', async () => {
    expect(lines(await run('sort', ['fruits.txt']))).toEqual([
      'Apple',
      'Cherry',
      'apple',
      'banana',
      'banana',
      'pear',
    ]);
  });

  it('reverses with -r and removes duplicates with -u', async () => {
    expect(lines(await run('sort', ['-r'], 'b\na\nc'))).toEqual(['c', 'b', 'a']);
    expect(lines(await run('sort', ['-u', 'fruits.txt']))).toEqual([
      'Apple',
      'Cherry',
      'apple',
      'banana',
      'pear',
    ]);
  });

  it('ignores case with -f', async () => {
    expect(lines(await run('sort', ['-f', 'fruits.txt']))).toEqual([
      'Apple',
      'apple',
      'banana',
      'banana',
      'Cherry',
      'pear',
    ]);
    // With -u, lines differing only by case are one: the first read is kept.
    expect(lines(await run('sort', ['-fu'], 'b\nB\nA\na'))).toEqual(['A', 'b']);
  });

  it('sorts numbers with -n, where text order would be wrong', async () => {
    expect(lines(await run('sort', [], '10\n9\n100\n-2\n1.5'))).toEqual([
      '-2',
      '1.5',
      '10',
      '100',
      '9',
    ]);
    expect(lines(await run('sort', ['-n'], '10\n9\n100\n-2\n1.5\nx'))).toEqual([
      '-2',
      'x',
      '1.5',
      '9',
      '10',
      '100',
    ]);
    expect(lines(await run('sort', ['-rn'], '10\n9\n100'))).toEqual(['100', '10', '9']);
  });

  it('sorts on a field with -k', async () => {
    expect(lines(await run('sort', ['-k', '2', '-n', 'scores.txt']))).toEqual([
      'alice 9',
      'dave 9',
      'bob 10',
      'carol 100',
    ]);
    expect(lines(await run('sort', ['-rnk2', 'scores.txt']))).toEqual([
      'carol 100',
      'bob 10',
      'dave 9',
      'alice 9',
    ]);
    expect(lines(await run('sort', ['-k2,2', '-u', '-n', 'scores.txt']))).toEqual([
      'alice 9',
      'bob 10',
      'carol 100',
    ]);
  });

  it('merges several files and handles empty input', async () => {
    expect(lines(await run('sort', ['short.txt', 'unterminated.txt']))).toEqual([
      'alpha',
      'beta',
      'one',
      'three',
      'two',
    ]);
    expect(await run('sort', ['empty.txt'])).toEqual({ out: [], err: [] });
    expect(await run('sort', [], '')).toEqual({ out: [], err: [] });
  });

  it('gives up on a missing file, a bad option or a bad key', async () => {
    expect(await run('sort', ['short.txt', 'nope.txt'])).toEqual({
      out: [],
      err: ['sort: nope.txt: No such file or directory'],
    });
    expect((await run('sort', ['-z', 'short.txt'])).err[0]).toContain('invalid option -- z');
    expect((await run('sort', ['-k', '0', 'short.txt'])).err[0]).toContain("invalid key '0'");
    expect((await run('sort', ['-k'])).err[0]).toContain('requires an argument');
    expect((await run('sort')).err[0]).toContain('usage: sort');
  });
});

describe('uniq', () => {
  const repeated = 'a\na\nb\na\nc\nc\nc';

  it('collapses adjacent duplicates only', async () => {
    expect(lines(await run('uniq', [], repeated))).toEqual(['a', 'b', 'a', 'c']);
  });

  it('counts with -c, right-aligned like the Unix uniq', async () => {
    expect(lines(await run('uniq', ['-c'], repeated))).toEqual([
      '      2 a',
      '      1 b',
      '      1 a',
      '      3 c',
    ]);
  });

  it('selects repeated (-d) or unrepeated (-u) lines', async () => {
    expect(lines(await run('uniq', ['-d'], repeated))).toEqual(['a', 'c']);
    expect(lines(await run('uniq', ['-u'], repeated))).toEqual(['b', 'a']);
    expect((await run('uniq', ['-du'], repeated)).out).toEqual([]);
  });

  it('ignores case with -i, keeping the first spelling', async () => {
    expect(lines(await run('uniq', ['-i'], 'Hello\nhello\nHELLO\nworld'))).toEqual([
      'Hello',
      'world',
    ]);
    expect(lines(await run('uniq', ['-ci'], 'Hello\nhello'))).toEqual(['      2 Hello']);
  });

  it('reads a file operand and handles empty input', async () => {
    expect(lines(await run('uniq', ['fruits.txt']))).toHaveLength(6);
    expect(await run('uniq', ['empty.txt'])).toEqual({ out: [], err: [] });
    expect(await run('uniq', [], '')).toEqual({ out: [], err: [] });
  });

  it('reports errors', async () => {
    expect((await run('uniq', ['nope.txt'])).err).toEqual([
      'uniq: nope.txt: No such file or directory',
    ]);
    expect((await run('uniq', ['-x'], 'a')).err[0]).toContain('invalid option -- x');
    expect((await run('uniq', ['short.txt', 'out.txt'])).err[0]).toContain('extra operand');
    expect((await run('uniq')).err).toEqual(['usage: uniq [-cdui] [file]']);
  });
});

describe('cut', () => {
  it('selects fields on a delimiter', async () => {
    expect(lines(await run('cut', ['-d', ',', '-f', '1,3', 'data.csv']))).toEqual([
      'name,city',
      'Ada,London',
      'Linus,Helsinki',
    ]);
    expect(lines(await run('cut', ['-d,', '-f2', 'data.csv']))).toEqual(['age', '36', '28']);
  });

  it('splits on tabs by default, and accepts \\t as a delimiter', async () => {
    expect(lines(await run('cut', ['-f', '2', 'tabs.tsv']))).toEqual(['b', 'e']);
    expect(lines(await run('cut', ['-d', '\\t', '-f', '1,3', 'tabs.tsv']))).toEqual([
      'a\tc',
      'd\tf',
    ]);
  });

  it('supports N-M, N- and -M ranges, in the original order', async () => {
    const row = 'a:b:c:d:e';
    expect(lines(await run('cut', ['-d', ':', '-f', '2-4'], row))).toEqual(['b:c:d']);
    expect(lines(await run('cut', ['-d', ':', '-f', '4-'], row))).toEqual(['d:e']);
    expect(lines(await run('cut', ['-d', ':', '-f', '-2'], row))).toEqual(['a:b']);
    expect(lines(await run('cut', ['-d', ':', '-f', '5,1,1'], row))).toEqual(['a:e']);
    expect(lines(await run('cut', ['-d', ':', '-f', '9'], row))).toEqual(['']);
  });

  it('passes a line without the delimiter through unchanged', async () => {
    expect(lines(await run('cut', ['-d', ',', '-f', '2'], 'no delimiter\na,b'))).toEqual([
      'no delimiter',
      'b',
    ]);
  });

  it('selects characters by code point with -c', async () => {
    expect(lines(await run('cut', ['-c', '1-3'], 'abcdef\nxy'))).toEqual(['abc', 'xy']);
    expect(lines(await run('cut', ['-c', '2,4-'], 'abcdef'))).toEqual(['bdef']);
    expect(lines(await run('cut', ['-c2'], 'a😀b'))).toEqual(['😀']);
  });

  it('handles empty input and a missing file', async () => {
    expect(await run('cut', ['-f', '1'], '')).toEqual({ out: [], err: [] });
    expect((await run('cut', ['-f', '1', 'nope.txt'])).err).toEqual([
      'cut: nope.txt: No such file or directory',
    ]);
  });

  it('validates its options', async () => {
    expect((await run('cut', [], 'a')).err[0]).toContain('you must specify a list');
    expect((await run('cut', ['-f', '1', '-c', '1'], 'a')).err[0]).toContain('only one type');
    expect((await run('cut', ['-d', ',', '-c', '1'], 'a')).err[0]).toContain('delimiter');
    expect((await run('cut', ['-d', 'ab', '-f', '1'], 'a')).err[0]).toContain('single character');
    expect((await run('cut', ['-f', '0'], 'a')).err[0]).toContain("invalid field list: '0'");
    expect((await run('cut', ['-f', '3-1'], 'a')).err[0]).toContain('invalid field list');
    expect((await run('cut', ['-c', 'x'], 'a')).err[0]).toContain('invalid character list');
    expect((await run('cut', ['-f'], 'a')).err[0]).toContain('requires an argument');
    expect((await run('cut', ['-z'], 'a')).err[0]).toContain("invalid option '-z'");
    expect((await run('cut', ['-f', '1'])).err[0]).toContain('usage: cut');
  });
});

describe('tr', () => {
  it('translates ranges and classes', async () => {
    expect((await run('tr', ['a-z', 'A-Z'], 'hello world')).out).toEqual(['HELLO WORLD']);
    expect((await run('tr', ['[:upper:]', '[:lower:]'], 'Hello World')).out).toEqual([
      'hello world',
    ]);
    expect((await run('tr', ['[:digit:]', '#'], 'a1b22')).out).toEqual(['a#b##']);
    expect((await run('tr', ['abc', 'xy'], 'aabbcc')).out).toEqual(['xxyyyy']);
  });

  it('understands the \\n and \\t escapes', async () => {
    expect(lines(await run('tr', [' ', '\\n'], 'one two three'))).toEqual(['one', 'two', 'three']);
    expect((await run('tr', ['\\n', ' '], 'one\ntwo')).out).toEqual(['one two']);
    expect((await run('tr', ['\\t', ','], 'a\tb')).out).toEqual(['a,b']);
  });

  it('deletes with -d', async () => {
    expect((await run('tr', ['-d', 'l'], 'hello world')).out).toEqual(['heo word']);
    expect((await run('tr', ['-d', '[:space:]'], 'a b\tc\nd')).out).toEqual(['abcd']);
    expect((await run('tr', ['-d', '[:alpha:]'], 'a1b2')).out).toEqual(['12']);
    expect((await run('tr', ['-d', '-'], '2026-11-28')).out).toEqual(['20261128']);
  });

  it('squeezes with -s, alone or after translating / deleting', async () => {
    expect((await run('tr', ['-s', ' '], 'too    many   spaces')).out).toEqual(['too many spaces']);
    expect((await run('tr', ['-s', 'a-z', 'A-Z'], 'aabbcd')).out).toEqual(['ABCD']);
    expect((await run('tr', ['-ds', 'x', ' '], 'ax  xb')).out).toEqual(['a b']);
  });

  it('treats a leading or trailing dash and an emoji as plain characters', async () => {
    expect((await run('tr', ['a-', 'xy'], 'a-b')).out).toEqual(['xyb']);
    expect((await run('tr', ['😀', '!'], 'hi😀')).out).toEqual(['hi!']);
  });

  it('prints nothing for empty input', async () => {
    expect(await run('tr', ['a', 'b'], '')).toEqual({ out: [], err: [] });
  });

  it('only reads stdin and validates its sets', async () => {
    expect((await run('tr', ['a', 'b'])).err[0]).toContain('usage:');
    expect((await run('tr', [], 'x')).err[0]).toContain('usage:');
    expect((await run('tr', ['a'], 'x')).err[0]).toContain("missing operand after 'a'");
    expect((await run('tr', ['-d', 'a', 'b'], 'x')).err[0]).toContain("extra operand 'b'");
    expect((await run('tr', ['-x', 'a', 'b'], 'x')).err[0]).toContain('invalid option -- x');
    expect((await run('tr', ['z-a', 'b'], 'x')).err[0]).toContain('runs backwards');
    expect((await run('tr', ['[:nope:]', 'b'], 'x')).err[0]).toContain(
      "invalid character class 'nope'",
    );
    expect((await run('tr', ['a', ''], 'x')).err[0]).toContain('SET2 must not be empty');
  });
});

describe('rev', () => {
  it('reverses each line, keeping the line order', async () => {
    expect(lines(await run('rev', [], 'hello\nworld'))).toEqual(['olleh', 'dlrow']);
    expect(lines(await run('rev', ['unterminated.txt']))).toEqual(['eno', 'owt', 'eerht']);
  });

  it('keeps emoji and accents whole', async () => {
    expect((await run('rev', [], 'a😀b')).out).toEqual(['b😀a']);
    expect((await run('rev', [], 'été 🇫🇷!')).out).toEqual(['!🇫🇷 été']);
  });

  it('concatenates several files and keeps blank lines', async () => {
    expect(lines(await run('rev', ['short.txt', 'unterminated.txt']))).toHaveLength(5);
    expect(lines(await run('rev', [], 'ab\n\ncd'))).toEqual(['ba', '', 'dc']);
  });

  it('handles empty input and errors', async () => {
    expect(await run('rev', [], '')).toEqual({ out: [], err: [] });
    expect((await run('rev', ['nope.txt'])).err).toEqual([
      'rev: nope.txt: No such file or directory',
    ]);
    expect((await run('rev', ['-x'], 'a')).err[0]).toContain("invalid option '-x'");
    expect((await run('rev')).err).toEqual(['usage: rev <file>...']);
  });
});

describe('xxd', () => {
  it('dumps offset, grouped hex and an ASCII gutter', async () => {
    expect((await run('xxd', ['short.txt'])).out).toEqual([
      '00000000: 616c 7068 610a 6265 7461 0a              alpha.beta.',
    ]);
  });

  it('breaks rows every 16 bytes and encodes text as UTF-8', async () => {
    const rows = lines(await run('xxd', [], '0123456789abcdefXé'));
    expect(rows).toEqual([
      '00000000: 3031 3233 3435 3637 3839 6162 6364 6566  0123456789abcdef',
      // A pipe delivers the final newline (0a) the shell stripped.
      '00000010: 58c3 a90a                                X...',
    ]);
  });

  it('does not add a newline to a file that has none', async () => {
    expect((await run('xxd', ['-p', 'unterminated.txt'])).out).toEqual([
      '6f6e650a74776f0a7468726565',
    ]);
  });

  it('limits bytes with -l and sets the row width with -c', async () => {
    expect((await run('xxd', ['-l', '3', 'short.txt'])).out).toEqual([
      '00000000: 616c 70                                  alp',
    ]);
    expect(lines(await run('xxd', ['-c', '4', '-l6', 'short.txt']))).toEqual([
      '00000000: 616c 7068  alph',
      '00000004: 610a       a.',
    ]);
    expect(lines(await run('xxd', ['-c3', '-l', '3', 'short.txt']))).toEqual([
      '00000000: 616c 70  alp',
    ]);
  });

  it('prints plain hex with -p and uppercase with -u', async () => {
    expect((await run('xxd', ['-p'], 'hello')).out).toEqual(['68656c6c6f0a']);
    expect((await run('xxd', ['-p', '-u', '-c', '2'], 'jk')).out).toEqual(['6A6B\n0A']);
  });

  it('prints nothing for empty input', async () => {
    expect(await run('xxd', ['empty.txt'])).toEqual({ out: [], err: [] });
    expect(await run('xxd', [], '')).toEqual({ out: [], err: [] });
    expect((await run('xxd', ['-l', '0', 'short.txt'])).out).toEqual([]);
  });

  it('reports errors', async () => {
    expect((await run('xxd', ['nope.txt'])).err).toEqual([
      'xxd: nope.txt: No such file or directory',
    ]);
    expect((await run('xxd', ['-r', 'short.txt'])).err[0]).toContain("invalid option '-r'");
    expect((await run('xxd', ['-l', 'x', 'short.txt'])).err[0]).toContain('invalid number for -l');
    expect((await run('xxd', ['-c', '0', 'short.txt'])).err[0]).toContain('between 1 and 256');
    expect((await run('xxd', ['-l'])).err[0]).toContain('requires an argument');
    expect((await run('xxd', ['short.txt', 'empty.txt'])).err[0]).toContain('extra operand');
    expect((await run('xxd')).err[0]).toContain('usage: xxd');
  });
});

describe('diff', () => {
  it('prints nothing when the files are identical', async () => {
    expect(await run('diff', ['old.txt', 'old.txt'])).toEqual({ out: [], err: [] });
    expect(await run('diff', ['-q', 'empty.txt', 'empty.txt'])).toEqual({ out: [], err: [] });
  });

  it('prints unified hunks with 3 lines of context', async () => {
    const result = await run('diff', ['old.txt', 'new.txt']);
    expect(result.err).toEqual([]);
    expect(result.out).toEqual([
      '--- old.txt',
      '+++ new.txt',
      '@@ -1,5 +1,5 @@',
      ' a',
      '-b',
      '+B',
      ' c',
      ' d',
      ' e',
      '@@ -12,5 +12,6 @@',
      ' l',
      ' m',
      ' n',
      '-o',
      '+O',
      ' p',
      '+q',
    ]);
  });

  it('merges changes whose contexts touch into one hunk', async () => {
    const files: Record<string, string> = {
      a: '1\n2\n3\n4\n5\n6\n7\n8\n9\n',
      b: '1\nX\n3\n4\n5\n6\n7\n8\nY\n',
    };
    const result = await runCommand('diff', ['a', 'b'], {
      ctx: { read: (path: string) => ({ content: files[path], name: path }) },
    });
    expect(result.out.filter((line) => line.startsWith('@@'))).toEqual(['@@ -1,9 +1,9 @@']);
  });

  it('writes single-line and empty ranges like diff', async () => {
    expect((await run('diff', ['empty.txt', 'short.txt'])).out).toEqual([
      '--- empty.txt',
      '+++ short.txt',
      '@@ -0,0 +1,2 @@',
      '+alpha',
      '+beta',
    ]);
    expect((await run('diff', ['short.txt', 'empty.txt'])).out[2]).toBe('@@ -1,2 +0,0 @@');
    expect((await run('diff', ['-', 'empty.txt'], 'solo')).out.slice(2)).toEqual([
      '@@ -1 +0,0 @@',
      '-solo',
    ]);
  });

  it('flags a last line without its newline', async () => {
    const files: Record<string, string> = { a: 'one\ntwo\n', b: 'one\ntwo' };
    const result = await runCommand('diff', ['a', 'b'], {
      ctx: { read: (path: string) => ({ content: files[path], name: path }) },
    });
    expect(result.out).toEqual([
      '--- a',
      '+++ b',
      '@@ -1,2 +1,2 @@',
      ' one',
      '-two',
      '+two',
      '\\ No newline at end of file',
    ]);
  });

  it('compares piped text given as `-`', async () => {
    expect(await run('diff', ['-', 'short.txt'], 'alpha\nbeta')).toEqual({ out: [], err: [] });
    const result = await run('diff', ['short.txt', '-'], 'alpha\ngamma');
    expect(result.out.slice(2)).toEqual(['@@ -1,2 +1,2 @@', ' alpha', '-beta', '+gamma']);
  });

  it('only says whether the files differ with -q', async () => {
    expect((await run('diff', ['-q', 'old.txt', 'new.txt'])).out).toEqual([
      'Files old.txt and new.txt differ',
    ]);
  });

  it('escapes HTML in the lines it prints', async () => {
    const files: Record<string, string> = { a: '<b>x</b>\n', b: 'a & b\n' };
    const result = await runCommand('diff', ['a', 'b'], {
      ctx: { read: (path: string) => ({ content: files[path], name: path }) },
    });
    expect(result.out.slice(3)).toEqual(['-<b>x</b>', '+a & b']);
  });

  it('reports errors', async () => {
    expect(await run('diff', ['nope.txt', 'gone.txt'])).toEqual({
      out: [],
      err: [
        'diff: nope.txt: No such file or directory',
        'diff: gone.txt: No such file or directory',
      ],
    });
    expect((await run('diff', ['old.txt'])).err[0]).toContain("missing operand after 'old.txt'");
    expect((await run('diff')).err).toEqual(['usage: diff [-q] <file1> <file2>']);
    expect((await run('diff', ['a', 'b', 'c'])).err[0]).toContain("extra operand 'c'");
    expect((await run('diff', ['-z', 'old.txt', 'new.txt'])).err[0]).toContain(
      'invalid option -- z',
    );
  });
});
