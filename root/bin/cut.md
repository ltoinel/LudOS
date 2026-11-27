---
name: cut
desc: extract columns or characters from each line — e.g. cut -d , -f 1,3 data.csv
page: false
man: |
  # CUT(1)

  ## NAME
  cut — extract fields or characters from each line

  ## SYNOPSIS
  cut -f LIST [-d DELIM] <file...>
  cut -c LIST <file...>
  cut -f LIST | -c LIST     (filter piped input)

  ## DESCRIPTION
  Prints the selected parts of each line of the given files. With -f, a line
  is split into fields on a delimiter (a tab by default) and the chosen
  fields are printed, joined by that delimiter. With -c, the chosen
  characters are printed. With no file (or `-`), cut filters what is piped
  into it.

  ## OPTIONS
  -f LIST    select these fields
  -d DELIM   field delimiter, a single character (default: tab); write `\t`
             for a tab and quote a space: -d ' '
  -c LIST    select these characters
  -          read standard input (the piped text)

  ## LISTS
  A LIST is one or more comma-separated ranges; positions start at 1.

  N      the Nth field or character
  N-M    from the Nth to the Mth
  N-     from the Nth to the end of the line
  -M     from the first to the Mth

  The selected parts are always printed in their original order, each one
  once: `cut -f 3,1` prints the same thing as `cut -f 1,3`.

  ## NOTES
  With -f, a line that does not contain the delimiter is printed unchanged.
  Characters are code points, so accented letters and emoji count as one.

  ## EXAMPLES
  cut -d , -f 1,3 data.csv
  echo "2026-11-28" | cut -d - -f 1
  cut -c 1-10 about.md
  echo "a b c d" | cut -d ' ' -f 2-

  ## SEE ALSO
  tr, sort, uniq, head, tail, grep
js: |
  // cut — print selected fields (-f, split on -d) or characters (-c) of each
  // line of files or of piped stdin.
  const USAGE = 'usage: cut -f LIST [-d DELIM] <file>... | cut -c LIST <file>...';
  const args = ctx.args;

  // ---- options ---------------------------------------------------------
  let delimiter = null; // -d (null = not given: tab)
  let fieldList = null; // -f
  let characterList = null; // -c
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
    const letter = arg[1];
    if (!'dfc'.includes(letter)) {
      ctx.error(`cut: invalid option '${arg}' — ${USAGE}`);
      return;
    }
    // Every option takes a value: glued to it (-f1,3) or the next argument.
    let value = arg.slice(2);
    if (value === '') {
      i++;
      if (i >= args.length) {
        ctx.error(`cut: option requires an argument -- ${letter}`);
        return;
      }
      value = args[i];
    }
    if (letter === 'd') delimiter = value;
    else if (letter === 'f') fieldList = value;
    else characterList = value;
  }

  if (fieldList === null && characterList === null) {
    ctx.error('cut: you must specify a list of fields (-f) or characters (-c)');
    return;
  }
  if (fieldList !== null && characterList !== null) {
    ctx.error('cut: only one type of list may be specified (-f or -c)');
    return;
  }
  if (delimiter !== null && characterList !== null) {
    ctx.error('cut: a delimiter (-d) only makes sense with fields (-f)');
    return;
  }
  // A tab cannot be typed in this terminal: accept the two characters `\t`.
  if (delimiter === null || delimiter === '\\t') delimiter = '\t';
  if (Array.from(delimiter).length !== 1) {
    ctx.error('cut: the delimiter must be a single character');
    return;
  }

  /**
   * Parses a LIST (`1,3-5,7-`) into [first, last] ranges of 1-based positions;
   * returns null when it is malformed.
   */
  const parseList = (list) => {
    const ranges = [];
    for (const part of list.split(',')) {
      const match = /^(\d*)(-?)(\d*)$/.exec(part);
      if (!match || (match[1] === '' && match[3] === '')) return null;
      const isRange = match[2] === '-';
      const first = match[1] === '' ? 1 : Number(match[1]);
      let last = first;
      if (isRange) last = match[3] === '' ? Infinity : Number(match[3]);
      // Positions start at 1, and a range cannot run backwards.
      if (first < 1 || last < first) return null;
      ranges.push([first, last]);
    }
    return ranges;
  };

  const byCharacter = characterList !== null;
  const list = byCharacter ? characterList : fieldList;
  const ranges = parseList(list);
  if (!ranges) {
    ctx.error(`cut: invalid ${byCharacter ? 'character' : 'field'} list: '${list}'`);
    return;
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | cut -f1`): only ctx.piped
  // tells an empty pipe from no pipe at all. Older engines lack it: fall back
  // on "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  if (!files.length && !piped) {
    ctx.error(USAGE);
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
        // Like cut, report the file and carry on with the others.
        ctx.error(`cut: ${file}: ${res.error}`);
        continue;
      }
      content = res.content;
    }
    for (const line of toLines(content)) lines.push(line);
  }

  // ---- selection -------------------------------------------------------
  const isSelected = (position) =>
    ranges.some(([first, last]) => position >= first && position <= last);

  /** Keeps the parts whose 1-based position is selected, in their original order. */
  const select = (parts) => parts.filter((part, index) => isSelected(index + 1));

  const cutLine = (line) => {
    // Array.from splits by code point, so an emoji is one character.
    if (byCharacter) return select(Array.from(line)).join('');
    // Like cut (without -s), a line with no delimiter passes through whole.
    if (!line.includes(delimiter)) return line;
    return select(line.split(delimiter)).join(delimiter);
  };

  // One block, one line per row: that is what the next pipe stage reads.
  if (lines.length) ctx.raw(lines.map(cutLine).join('\n'));
---
