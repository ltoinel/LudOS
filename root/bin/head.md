---
name: head
desc: show the first lines of a file — e.g. head -n 5 about.md, ls | head -3
agent: read
page: false
man: |
  # HEAD(1)

  ## NAME
  head — print the first lines of files

  ## SYNOPSIS
  head [-n N] <file...>
  head [-n N]               (read piped input)

  ## DESCRIPTION
  Prints the first 10 lines of each file. With several files, each one is
  preceded by a `==> name <==` header. With no file (or `-`), head reads what
  is piped into it — e.g. `ls /bin | head -5`.

  ## OPTIONS
  -n N   print the first N lines instead of the first 10
  -N     shorthand for -n N (e.g. head -3)
  -      read standard input (the piped text)

  ## EXAMPLES
  head about.md
  head -n 3 about.md contact.md
  ls /bin | head -5
  history | sort | head -1

  ## SEE ALSO
  tail, cat, cut, sort, wc
js: |
  // head — print the first N lines of files or of piped stdin. Mirrors `cat`'s
  // input handling (file operands, `-`, piped text).
  const DEFAULT_LINE_COUNT = 10;
  const args = ctx.args;

  // ---- options ---------------------------------------------------------
  let lineCount = DEFAULT_LINE_COUNT;
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
        ctx.error('head: option requires an argument -- n');
        return;
      }
      value = args[i];
    } else if (arg.startsWith('-n')) {
      value = arg.slice(2);
    } else if (/^-\d+$/.test(arg)) {
      value = arg.slice(1);
    } else {
      ctx.error(`head: invalid option '${arg}' — usage: head [-n N] <file>...`);
      return;
    }
    if (!/^\d+$/.test(value)) {
      ctx.error(`head: invalid number of lines: '${value}'`);
      return;
    }
    lineCount = Number(value);
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | head`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  const sources = [];
  if (!files.length) {
    if (!piped) {
      ctx.error('usage: head [-n N] <file>...');
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
      // Like head, report the file and carry on with the others.
      ctx.error(`head: ${file}: ${res.error}`);
      continue;
    }
    sources.push({ name: file, content: res.content });
  }

  // ---- output ----------------------------------------------------------
  /** The lines of a text; its final newline ends the last line, it adds none. */
  const toLines = (text) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

  // Headers appear as soon as several files were asked for, even if only one
  // of them could be read.
  const showHeaders = files.length > 1;
  const output = [];
  for (const source of sources) {
    if (showHeaders) {
      if (output.length) output.push('');
      output.push(`==> ${source.name} <==`);
    }
    for (const line of toLines(source.content).slice(0, lineCount)) output.push(line);
  }
  // One block, one line per row: that is what the next pipe stage reads.
  if (output.length) ctx.raw(output.join('\n'));
---
