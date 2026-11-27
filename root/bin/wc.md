---
name: wc
desc: count lines, words and bytes — e.g. wc about.md, ls | wc -l
seo_title: Word counter — count words, lines & characters
demo: wc about.md projects.md contact.md
man: |
  # WC(1)

  ## NAME
  wc — count lines, words, characters and bytes

  ## SYNOPSIS
  wc [-l] [-w] [-c] [-m] [-L] <file...>
  wc                        (count piped input)

  ## DESCRIPTION
  Counts newlines, words and bytes in each file, printing one row per file plus a
  `total` row when several are given. With no file (or `-`), wc counts what is
  piped into it — e.g. `ls | wc -l`. With no flag, it prints lines, words and
  bytes (in that order).

  ## OPTIONS
  -l   count lines (newlines)
  -w   count words (whitespace-separated)
  -c   count bytes (UTF-8)
  -m   count characters (code points)
  -L   length of the longest line
  -    count standard input (the piped text)

  Single-letter flags can be combined, e.g. `wc -lw file`.

  ## USE CASES
  - count the words of an article, an essay or a cover letter before sending
    it, or check a text against a word limit;
  - count the lines of a file or of any command's output: ls | wc -l;
  - check a text's size in bytes (-c) versus characters (-m): they differ as
    soon as it contains accents or emoji, which matters for size-limited
    fields (SMS, tweets, database columns).

  ## NOTES
  A word is a run of non-blank characters, as in the Unix wc. Everything is
  counted in your browser: the text is never sent anywhere.

  ## EXAMPLES
  wc about.md
  wc -l about.md contact.md
  ls | wc -l
  echo "hello world" | wc -w

  ## SEE ALSO
  cat, grep, du, bc
js: |
  // wc — count lines / words / bytes / chars / longest line of files or piped
  // stdin, with the usual -l/-w/-c/-m/-L flags. Mirrors `cat`'s input handling.
  const args = ctx.args.slice();

  // Parse combinable flags; collect file operands (in order). `--` ends options.
  let doLines = false;
  let doWords = false;
  let doBytes = false;
  let doChars = false;
  let doLongest = false;
  const files = [];
  let parsingOptions = true;
  for (const arg of args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    // A lone `-` is the stdin operand, not a flag group.
    if (parsingOptions && arg.length > 1 && arg[0] === '-' && arg !== '-') {
      let invalidFlag = null;
      for (const flag of arg.slice(1)) {
        if (flag === 'l') doLines = true;
        else if (flag === 'w') doWords = true;
        else if (flag === 'c') doBytes = true;
        else if (flag === 'm') doChars = true;
        else if (flag === 'L') doLongest = true;
        else {
          invalidFlag = flag;
          break;
        }
      }
      if (invalidFlag) {
        ctx.error('wc: invalid option -- ' + invalidFlag);
        return;
      }
      continue;
    }
    files.push(arg);
  }

  // Default columns (like real wc): lines, words, bytes.
  if (!doLines && !doWords && !doBytes && !doChars && !doLongest) {
    doLines = doWords = doBytes = true;
  }

  // Piped input may be empty (`grep nomatch file | wc -l`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);

  // Resolve the ordered list of sources.
  const sources = [];
  if (!files.length) {
    if (piped) {
      // The shell joins a stage's output lines without a final line break, so
      // the last line would not be counted: restore the newline a real pipe
      // carries (`ls | wc -l` must count every entry).
      const text = ctx.stdin;
      const terminated = text === '' || text.endsWith('\n') ? text : text + '\n';
      sources.push({ name: '', content: terminated });
    } else {
      ctx.error('usage: wc [-lwcmL] <file>...');
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
        ctx.error('wc: ' + file + ': ' + res.error);
        continue;
      }
      sources.push({ name: res.name || file, content: res.content });
    }
  }
  if (!sources.length) return;

  // Count one source.
  const count = (text) => {
    const trimmed = text.trim();
    let longest = 0;
    for (const line of text.split('\n')) if (line.length > longest) longest = line.length;
    return {
      // Like real wc, a line is a newline character: an unterminated last
      // line is not counted.
      lines: (text.match(/\n/g) || []).length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      bytes: new TextEncoder().encode(text).length,
      chars: Array.from(text).length, // code points, not UTF-16 units
      longest,
    };
  };

  // Selected columns, in canonical order.
  const columns = [];
  if (doLines) columns.push('lines');
  if (doWords) columns.push('words');
  if (doBytes) columns.push('bytes');
  if (doChars) columns.push('chars');
  if (doLongest) columns.push('longest');

  const rows = sources.map((source) => ({ name: source.name, counts: count(source.content) }));
  if (rows.length > 1) {
    // The total row sums every column, except the longest line: that one is
    // the maximum across the files.
    const total = { lines: 0, words: 0, bytes: 0, chars: 0, longest: 0 };
    for (const row of rows) {
      for (const column of Object.keys(total)) {
        total[column] =
          column === 'longest'
            ? Math.max(total[column], row.counts[column])
            : total[column] + row.counts[column];
      }
    }
    rows.push({ name: 'total', counts: total });
  }

  // Right-align every count to the widest value, like real wc.
  let width = 1;
  for (const row of rows) {
    for (const column of columns) width = Math.max(width, String(row.counts[column]).length);
  }
  for (const row of rows) {
    const numbers = columns.map((column) => String(row.counts[column]).padStart(width)).join(' ');
    ctx.line(numbers + (row.name ? ' ' + row.name : ''));
  }
---
