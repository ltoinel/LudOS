---
name: uniq
desc: drop repeated adjacent lines — e.g. sort names.txt | uniq -c
agent: read
page: false
man: |
  # UNIQ(1)

  ## NAME
  uniq — report or omit repeated lines

  ## SYNOPSIS
  uniq [-c] [-d] [-u] [-i] [file]
  uniq [options]            (filter piped input)

  ## DESCRIPTION
  Collapses each run of identical adjacent lines into a single line. Only
  neighbours are compared, so the input is usually sorted first:
  `sort file | uniq`. With no file (or `-`), uniq filters what is piped into it.

  ## OPTIONS
  -c   prefix each line with the number of times it occurred
  -d   only print the lines that are repeated (one copy of each)
  -u   only print the lines that are not repeated
  -i   ignore case when comparing lines
  -    read standard input (the piped text)

  Flags can be combined, e.g. `uniq -ci`.

  ## NOTES
  uniq takes a single input file; to keep the result, redirect it:
  `uniq in.txt > out.txt`.

  ## EXAMPLES
  sort names.txt | uniq
  history | sort | uniq -c | sort -rn | head -5
  sort names.txt | uniq -d
  sort names.txt | uniq -u

  ## SEE ALSO
  sort, wc, cut, grep
js: |
  // uniq — collapse runs of identical adjacent lines, with -c/-d/-u/-i.
  const USAGE = 'usage: uniq [-cdui] [file]';
  const COUNT_WIDTH = 7; // the Unix uniq right-aligns its counts on 7 columns

  // ---- options ---------------------------------------------------------
  let showCount = false; // -c
  let onlyRepeated = false; // -d
  let onlyUnique = false; // -u
  let ignoreCase = false; // -i
  const files = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    // A lone `-` is the stdin operand, not a flag group.
    if (!parsingOptions || arg === '-' || arg[0] !== '-') {
      files.push(arg);
      continue;
    }
    if (arg === '--') {
      parsingOptions = false;
      continue;
    }
    for (const letter of arg.slice(1)) {
      if (letter === 'c') showCount = true;
      else if (letter === 'd') onlyRepeated = true;
      else if (letter === 'u') onlyUnique = true;
      else if (letter === 'i') ignoreCase = true;
      else {
        ctx.error(`uniq: invalid option -- ${letter} — ${USAGE}`);
        return;
      }
    }
  }
  if (files.length > 1) {
    ctx.error(`uniq: extra operand '${files[1]}' — to save the result, use: uniq file > output`);
    return;
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | uniq`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  let content;
  if (!files.length || files[0] === '-') {
    if (!files.length && !piped) {
      ctx.error(USAGE);
      return;
    }
    content = ctx.stdin || '';
  } else {
    const res = ctx.read(files[0]);
    if (res.error) {
      ctx.error(`uniq: ${files[0]}: ${res.error}`);
      return;
    }
    content = res.content;
  }
  // The final newline ends the last line; it is not an extra empty line.
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');

  // ---- grouping --------------------------------------------------------
  // A group is a run of adjacent equal lines; its first line represents it.
  const groups = [];
  for (const line of lines) {
    const key = ignoreCase ? line.toLowerCase() : line;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.count++;
    } else {
      groups.push({ line, key, count: 1 });
    }
  }

  // ---- output ----------------------------------------------------------
  const kept = groups.filter((group) => {
    // -d and -u together select nothing, as with the Unix uniq.
    if (onlyRepeated && group.count === 1) return false;
    if (onlyUnique && group.count > 1) return false;
    return true;
  });
  const output = kept.map((group) =>
    showCount ? `${String(group.count).padStart(COUNT_WIDTH)} ${group.line}` : group.line,
  );
  // One block, one line per row: that is what the next pipe stage reads.
  if (output.length) ctx.raw(output.join('\n'));
---
