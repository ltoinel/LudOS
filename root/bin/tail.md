---
name: tail
desc: show the last lines of a file — e.g. tail -n 5 about.md, history | tail -3
agent: read
page: false
man: |
  # TAIL(1)

  ## NAME
  tail — print the last lines of files

  ## SYNOPSIS
  tail [-n N] <file...>
  tail [-n +N] <file...>
  tail [-n N]               (read piped input)

  ## DESCRIPTION
  Prints the last 10 lines of each file. With several files, each one is
  preceded by a `==> name <==` header. With no file (or `-`), tail reads what
  is piped into it — e.g. `history | tail -5`.

  ## OPTIONS
  -n N    print the last N lines instead of the last 10
  -n +N   print everything starting from line N (tail -n +2 skips a header)
  -N      shorthand for -n N (e.g. tail -3)
  -       read standard input (the piped text)

  ## NOTES
  Files in this shell do not grow on their own, so there is no -f (follow).

  ## EXAMPLES
  tail about.md
  tail -n 3 about.md contact.md
  tail -n +2 projects.md
  history | tail -5

  ## SEE ALSO
  head, cat, cut, sort, wc
js: |
  // tail — print the last N lines (or everything from line N with `+N`) of
  // files or of piped stdin. Mirrors `cat`'s input handling.
  const DEFAULT_LINE_COUNT = 10;
  const args = ctx.args;

  // ---- options ---------------------------------------------------------
  let lineCount = DEFAULT_LINE_COUNT;
  let fromStart = false; // `-n +N`: lineCount is then a 1-based starting line
  const files = [];
  let parsingOptions = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // A lone `-` is the stdin operand, not an option.
    if (!parsingOptions || arg === '-' || arg[0] !== '-') {
      files.push(arg);
      continue;
    }
    if (arg === '--') {
      parsingOptions = false;
      continue;
    }
    // The count comes as `-n N`, `-nN` or the historical `-N`.
    let value;
    if (arg === '-n') {
      i++;
      if (i >= args.length) {
        ctx.error('tail: option requires an argument -- n');
        return;
      }
      value = args[i];
    } else if (arg.startsWith('-n')) {
      value = arg.slice(2);
    } else if (/^-\d+$/.test(arg)) {
      value = arg.slice(1);
    } else {
      ctx.error(`tail: invalid option '${arg}' — usage: tail [-n [+]N] <file>...`);
      return;
    }
    if (!/^\+?\d+$/.test(value)) {
      ctx.error(`tail: invalid number of lines: '${value}'`);
      return;
    }
    fromStart = value[0] === '+';
    lineCount = Number(value);
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | tail`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  const sources = [];
  if (!files.length) {
    if (!piped) {
      ctx.error('usage: tail [-n [+]N] <file>...');
      return;
    }
    sources.push({ name: 'standard input', content: ctx.stdin });
  }
  for (const file of files) {
    if (file === '-') {
      sources.push({ name: 'standard input', content: ctx.stdin || '' });
      continue;
    }
    const res = ctx.read(file);
    if (res.error) {
      // Like tail, report the file and carry on with the others.
      ctx.error(`tail: ${file}: ${res.error}`);
      continue;
    }
    sources.push({ name: file, content: res.content });
  }

  // ---- output ----------------------------------------------------------
  /** The lines of a text; its final newline ends the last line, it adds none. */
  const toLines = (text) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

  /** The lines of a text that tail keeps. */
  const keptLines = (text) => {
    const lines = toLines(text);
    // `+N` starts at line N; `+0` behaves like `+1` (the whole text).
    if (fromStart) return lines.slice(Math.max(0, lineCount - 1));
    // slice(-0) would return everything: zero lines must be handled apart.
    if (lineCount === 0) return [];
    return lines.slice(-lineCount);
  };

  // Headers appear as soon as several files were asked for, even if only one
  // of them could be read.
  const showHeaders = files.length > 1;
  const output = [];
  for (const source of sources) {
    if (showHeaders) {
      if (output.length) output.push('');
      output.push(`==> ${source.name} <==`);
    }
    for (const line of keptLines(source.content)) output.push(line);
  }
  // One block, one line per row: that is what the next pipe stage reads.
  if (output.length) ctx.raw(output.join('\n'));
---
