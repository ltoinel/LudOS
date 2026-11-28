---
name: rev
desc: reverse each line, character by character — e.g. echo hello | rev
agent: read
page: false
man: |
  # REV(1)

  ## NAME
  rev — reverse the characters of each line

  ## SYNOPSIS
  rev <file...>
  rev                       (reverse piped input)

  ## DESCRIPTION
  Prints each line of the given files with its characters in reverse order;
  the order of the lines themselves does not change. With no file (or `-`),
  rev reverses what is piped into it — e.g. `echo hello | rev`.

  ## OPTIONS
  -    read standard input (the piped text)

  ## NOTES
  Lines are reversed by visible character, not by byte: accented letters,
  emoji and flags come out intact.

  ## EXAMPLES
  echo "hello world" | rev
  rev about.md
  echo "a/b/c.txt" | rev | cut -d / -f 1 | rev
  echo "kayak" | rev

  ## SEE ALSO
  tr, cut, cat, sort
js: |
  // rev — reverse every line of files or of piped stdin.

  // ---- arguments -------------------------------------------------------
  const files = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    // A lone `-` is the stdin operand; rev has no option of its own.
    if (!parsingOptions || arg === '-' || arg[0] !== '-') {
      files.push(arg);
      continue;
    }
    if (arg === '--') {
      parsingOptions = false;
      continue;
    }
    ctx.error(`rev: invalid option '${arg}' — usage: rev <file>...`);
    return;
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | rev`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  if (!files.length && !piped) {
    ctx.error('usage: rev <file>...');
    return;
  }

  /** The lines of a text; its final newline ends the last line, it adds none. */
  const toLines = (text) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

  const lines = [];
  for (const file of files.length ? files : ['-']) {
    let content;
    if (file === '-') {
      content = ctx.stdin || '';
    } else {
      const res = ctx.read(file);
      if (res.error) {
        // Like rev, report the file and carry on with the others.
        ctx.error(`rev: ${file}: ${res.error}`);
        continue;
      }
      content = res.content;
    }
    for (const line of toLines(content)) lines.push(line);
  }

  // ---- reversal --------------------------------------------------------
  // Reversing UTF-16 units would tear emoji apart, and reversing code points
  // would still break the multi-part ones (flags, families, skin tones) and
  // detach combining accents: split on grapheme clusters when the browser can.
  const segmenter =
    typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;

  /** The visible characters of a line (code points on older browsers). */
  const charactersOf = (line) => {
    if (!segmenter) return Array.from(line);
    return Array.from(segmenter.segment(line), (part) => part.segment);
  };

  const reverseLine = (line) => charactersOf(line).reverse().join('');

  // One block, one line per row: that is what the next pipe stage reads.
  if (lines.length) ctx.raw(lines.map(reverseLine).join('\n'));
---
