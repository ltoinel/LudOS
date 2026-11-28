---
name: diff
desc: compare two files line by line — e.g. diff notes.txt notes.bak
agent: read
page: false
man: |
  # DIFF(1)

  ## NAME
  diff — compare two files line by line

  ## SYNOPSIS
  diff [-q] [-u] <file1> <file2>

  ## DESCRIPTION
  Shows what must change in <file1> to obtain <file2>, in the unified format:
  a `--- file1` / `+++ file2` header, then one hunk per changed area. Each
  hunk starts with `@@ -start,count +start,count @@` (its position in both
  files) and lists the lines around the change:

  -line   only in <file1> (removed), shown in red
  +line   only in <file2> (added), shown in green
   line   in both files (3 lines of context around each change)

  Nothing is printed when the files are identical. One of the two files may
  be `-` to compare piped text: `cat a.txt | diff - b.txt`.

  ## OPTIONS
  -q   only report whether the files differ, not how
  -u   unified format — already the format used, accepted for habit
  -    read standard input (the piped text) as one of the files

  ## NOTES
  A file whose last line has no final newline differs from one that has it;
  diff then marks that line with `\ No newline at end of file`. Colours are
  only on screen: piped or redirected (diff a b > changes.patch), the
  output is plain text.

  ## EXAMPLES
  diff notes.txt notes.bak
  diff -q about.md contact.md
  sort names.txt | diff - names.txt
  diff old.txt new.txt > changes.patch

  ## SEE ALSO
  cat, grep, wc, sort, md5sum
js: |
  // diff — line diff of two files (longest common subsequence), printed in
  // the unified format with removed lines in red and added lines in green.
  const USAGE = 'usage: diff [-q] <file1> <file2>';
  const CONTEXT_LINES = 3; // unchanged lines shown around each change
  // The comparison table holds (lines of file1) × (lines of file2) cells: past
  // this size, fall back on a coarser diff rather than freeze the tab.
  const MAX_TABLE_CELLS = 4000000;
  const REMOVED_COLOUR = '#ff6b6b'; // the red the shell uses for errors
  const ADDED_COLOUR = 'var(--green)';
  const HUNK_COLOUR = 'var(--cyan)';

  // ---- options ---------------------------------------------------------
  let brief = false; // -q
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
      if (letter === 'q') brief = true;
      // -u asks for the unified format, which is the only one printed here.
      else if (letter !== 'u') {
        ctx.error(`diff: invalid option -- ${letter} — ${USAGE}`);
        return;
      }
    }
  }
  if (files.length < 2) {
    ctx.error(files.length ? `diff: missing operand after '${files[0]}' — ${USAGE}` : USAGE);
    return;
  }
  if (files.length > 2) {
    ctx.error(`diff: extra operand '${files[2]}' — ${USAGE}`);
    return;
  }

  // ---- input -----------------------------------------------------------
  const texts = [];
  let unreadable = false;
  for (const file of files) {
    if (file === '-') {
      // The shell joins a stage's output lines without a final line break:
      // restore the newline a real pipe carries, or the piped text would
      // always differ from a file by its last line.
      const stdin = ctx.stdin || '';
      texts.push(stdin === '' || stdin.endsWith('\n') ? stdin : stdin + '\n');
      continue;
    }
    const res = ctx.read(file);
    if (res.error) {
      // Report every unreadable file before giving up.
      ctx.error(`diff: ${file}: ${res.error}`);
      unreadable = true;
      continue;
    }
    texts.push(res.content);
  }
  if (unreadable) return;
  if (texts[0] === texts[1]) return; // identical: diff stays silent

  if (brief) {
    ctx.raw(`Files ${files[0]} and ${files[1]} differ`);
    return;
  }

  // ---- comparison ------------------------------------------------------
  /**
   * The lines of a text, each kept with the newline that ends it. A last line
   * without a final newline keeps none, so it compares as different from the
   * same line properly terminated — as diff reports it.
   */
  const linesOf = (text) => {
    if (text === '') return [];
    const pieces = text.split('\n');
    const lastPiece = pieces.pop(); // '' when the text ends with a newline
    const lines = pieces.map((piece) => piece + '\n');
    if (lastPiece !== '') lines.push(lastPiece);
    return lines;
  };
  const oldLines = linesOf(texts[0]);
  const newLines = linesOf(texts[1]);

  // Lines shared at both ends need no comparison: only the middle goes
  // through the (quadratic) table.
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);

  // The edit script: every line of both files, in order, tagged ' ' (in
  // both), '-' (only in file1) or '+' (only in file2).
  const edits = [];
  const keep = (line) => edits.push({ tag: ' ', line });
  const remove = (line) => edits.push({ tag: '-', line });
  const add = (line) => edits.push({ tag: '+', line });

  for (const line of oldLines.slice(0, prefix)) keep(line);

  const rowCount = oldMiddle.length;
  const columnCount = newMiddle.length;
  if (rowCount * columnCount <= MAX_TABLE_CELLS) {
    // common[row * width + column] is the length of the longest common
    // subsequence of oldMiddle[row..] and newMiddle[column..], filled from
    // the end so that the script can then be read from the start.
    const width = columnCount + 1;
    const common = new Uint32Array((rowCount + 1) * width);
    for (let row = rowCount - 1; row >= 0; row--) {
      for (let column = columnCount - 1; column >= 0; column--) {
        if (oldMiddle[row] === newMiddle[column]) {
          common[row * width + column] = common[(row + 1) * width + column + 1] + 1;
        } else {
          const skipOld = common[(row + 1) * width + column];
          const skipNew = common[row * width + column + 1];
          common[row * width + column] = Math.max(skipOld, skipNew);
        }
      }
    }
    let row = 0;
    let column = 0;
    while (row < rowCount && column < columnCount) {
      if (oldMiddle[row] === newMiddle[column]) {
        keep(oldMiddle[row]);
        row++;
        column++;
      } else if (common[(row + 1) * width + column] >= common[row * width + column + 1]) {
        // On a tie, remove first: deletions come before additions, as in diff.
        remove(oldMiddle[row]);
        row++;
      } else {
        add(newMiddle[column]);
        column++;
      }
    }
    for (; row < rowCount; row++) remove(oldMiddle[row]);
    for (; column < columnCount; column++) add(newMiddle[column]);
  } else {
    // Too large to compare finely: a valid, if not minimal, diff replaces the
    // whole differing middle.
    for (const line of oldMiddle) remove(line);
    for (const line of newMiddle) add(line);
  }

  for (const line of oldLines.slice(oldLines.length - suffix)) keep(line);

  // Number every edit with the line it sits at in each file (1-based): the
  // hunk headers need the position of their first line.
  let oldLineNumber = 1;
  let newLineNumber = 1;
  for (const edit of edits) {
    edit.oldLineNumber = oldLineNumber;
    edit.newLineNumber = newLineNumber;
    if (edit.tag !== '+') oldLineNumber++;
    if (edit.tag !== '-') newLineNumber++;
  }

  // ---- hunks -----------------------------------------------------------
  // A hunk covers a group of changes plus its context. Two changes share a
  // hunk when their contexts would touch or overlap.
  const hunks = [];
  let currentHunk = null;
  edits.forEach((edit, index) => {
    if (edit.tag === ' ') return;
    const unchangedBetween = currentHunk ? index - currentHunk.lastChange - 1 : Infinity;
    if (unchangedBetween <= 2 * CONTEXT_LINES) {
      currentHunk.lastChange = index;
    } else {
      currentHunk = { firstChange: index, lastChange: index };
      hunks.push(currentHunk);
    }
  });

  // ---- output ----------------------------------------------------------
  // One element per line: on screen it carries the colour, and captured (pipe
  // or redirection) each one is recorded as a plain line of text.
  const printLine = (text, colour) => {
    const style = colour ? ` style="color:${colour}"` : '';
    ctx.append(`<div class="ln out"${style}>${ctx.escape(text)}</div>`);
  };

  /** A hunk range as diff writes it: `start,count`, or just `start` for one line. */
  const formatRange = (start, count) => {
    // An empty range points at the line before it (0 for the top of the file).
    if (count === 0) return `${start - 1},0`;
    return count === 1 ? String(start) : `${start},${count}`;
  };

  printLine(`--- ${files[0]}`);
  printLine(`+++ ${files[1]}`);
  for (const hunk of hunks) {
    const start = Math.max(0, hunk.firstChange - CONTEXT_LINES);
    const end = Math.min(edits.length - 1, hunk.lastChange + CONTEXT_LINES);
    const hunkEdits = edits.slice(start, end + 1);
    const oldCount = hunkEdits.filter((edit) => edit.tag !== '+').length;
    const newCount = hunkEdits.filter((edit) => edit.tag !== '-').length;
    const oldRange = formatRange(hunkEdits[0].oldLineNumber, oldCount);
    const newRange = formatRange(hunkEdits[0].newLineNumber, newCount);
    printLine(`@@ -${oldRange} +${newRange} @@`, HUNK_COLOUR);
    for (const edit of hunkEdits) {
      let colour = null;
      if (edit.tag === '-') colour = REMOVED_COLOUR;
      if (edit.tag === '+') colour = ADDED_COLOUR;
      const terminated = edit.line.endsWith('\n');
      printLine(edit.tag + (terminated ? edit.line.slice(0, -1) : edit.line), colour);
      // Only a file's last line can lack its newline: say so, like diff.
      if (!terminated) printLine('\\ No newline at end of file');
    }
  }
---
