---
name: cat
desc: show a file — e.g. cat about.md, cat -n notes.txt
page: false
man: |
  # CAT(1)

  ## NAME
  cat — concatenate and print files

  ## SYNOPSIS
  cat [-n] [-b] [-E] [-s] <file...>
  cat                       (read piped input)

  ## DESCRIPTION
  Prints the contents of the given files, in order. A single Markdown document
  (.md) is rendered, unless a formatting flag is used; everything else is shown
  verbatim. With no file (or `-`), cat prints what is piped into it, so it works
  in a pipeline — e.g. `ls | cat -n`.

  ## OPTIONS
  -n   number all output lines
  -b   number non-blank output lines (overrides -n)
  -E   show a `$` at the end of each line
  -s   squeeze repeated blank lines into one
  -    read standard input (the piped text)

  Single-letter flags can be combined, e.g. `cat -nE file`.

  ## EXAMPLES
  cat about.md
  cat contact.md projects.md
  cat -n notes.txt
  ls | cat -n
  echo "hello" | cat -E

  ## SEE ALSO
  ls, find, grep
js: |
  // cat — concatenate files (or piped stdin) with the usual -n/-b/-E/-s flags.
  // A lone .md file with no flags is rendered (the portal's nice view); anything
  // else is printed verbatim. Reads ctx.stdin when given no file (or `-`), so it
  // composes in pipelines.
  const args = ctx.args.slice();

  // Parse combinable flags; collect file operands (in order). `--` ends options.
  let number = false; // -n
  let numberNonBlank = false; // -b
  let showEnds = false; // -E
  let squeeze = false; // -s
  const files = [];
  let parsingOptions = true;
  for (const arg of args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    // A lone `-` is the stdin operand, not a flag group.
    if (parsingOptions && arg === '-') {
      files.push('-');
      continue;
    }
    if (parsingOptions && arg.length > 1 && arg[0] === '-') {
      let invalidFlag = null;
      for (const flag of arg.slice(1)) {
        if (flag === 'n') number = true;
        else if (flag === 'b') numberNonBlank = true;
        else if (flag === 'E') showEnds = true;
        else if (flag === 's') squeeze = true;
        else {
          invalidFlag = flag;
          break;
        }
      }
      if (invalidFlag) {
        ctx.error('cat: invalid option -- ' + invalidFlag);
        return;
      }
      continue;
    }
    files.push(arg);
  }

  // Piped input may be empty (`grep nomatch file | cat`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);

  // Resolve the ordered list of sources to print.
  const sources = [];
  if (!files.length) {
    if (piped) sources.push({ name: '-', content: ctx.stdin });
    else {
      ctx.error('usage: cat <file>...');
      return;
    }
  } else {
    for (const file of files) {
      if (file === '-') {
        sources.push({ name: '-', content: ctx.stdin || '' });
        continue;
      }
      const res = ctx.read(file);
      if (res.error) {
        ctx.error('cat: ' + file + ': ' + res.error);
        continue;
      }
      sources.push({ name: res.name || file, content: res.content });
    }
  }

  const flagsActive = number || numberNonBlank || showEnds || squeeze;
  let lineNo = 1; // continuous across files, like real `cat -n`

  // Apply -s/-b/-n/-E to a file's text, returning the transformed string.
  const NUMBER_WIDTH = 6; // real cat right-aligns line numbers on 6 columns
  const numberPrefix = () => String(lineNo++).padStart(NUMBER_WIDTH) + '\t';
  const transform = (text) => {
    // The final newline ends the last line; it is not an extra empty line.
    let lines = text.replace(/\n$/, '').split('\n');
    if (squeeze) {
      // -s: collapse each run of blank lines into a single one.
      const squeezed = [];
      let previousBlank = false;
      for (const line of lines) {
        const blank = line === '';
        if (blank && previousBlank) continue;
        previousBlank = blank;
        squeezed.push(line);
      }
      lines = squeezed;
    }
    return lines
      .map((line) => {
        let prefix = '';
        // -b wins over -n and leaves blank lines unnumbered.
        if (numberNonBlank) prefix = line === '' ? '' : numberPrefix();
        else if (number) prefix = numberPrefix();
        return prefix + line + (showEnds ? '$' : '');
      })
      .join('\n');
  };

  for (const source of sources) {
    if (source.content === '') continue; // nothing to print (empty pipe or file)
    // A lone .md with no flags keeps the rendered view; otherwise print verbatim.
    if (!flagsActive && source.name !== '-' && source.name.endsWith('.md')) {
      ctx.print(source.content);
    } else {
      ctx.raw(transform(source.content));
    }
  }
---
