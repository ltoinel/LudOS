---
name: sort
desc: sort lines of text — e.g. sort -r names.txt, ls | sort -u, du | sort -rn
page: false
man: |
  # SORT(1)

  ## NAME
  sort — sort lines of text

  ## SYNOPSIS
  sort [-r] [-n] [-u] [-f] [-k N[,M]] <file...>
  sort [options]            (sort piped input)

  ## DESCRIPTION
  Prints the lines of the given files (all of them together), sorted. With no
  file (or `-`), sort orders what is piped into it — e.g. `ls | sort -r`.

  Lines are compared character by character in code point order, as the Unix
  sort does in the C locale: digits come first, then capitals, then lowercase
  letters. Use -f to mix capitals and lowercase, -n to compare numbers.

  ## OPTIONS
  -r        reverse the order
  -n        numeric sort: compare the number each line (or key) starts with;
            a line without a number counts as 0
  -u        unique: print only the first of several lines that compare equal
  -f        ignore case
  -k N      sort on a key: from whitespace-separated field N to the end of the line
  -k N,M    sort on fields N to M only
  -         read standard input (the piped text)

  Flags can be combined, e.g. `sort -rn` or `sort -rnk2`.

  ## NOTES
  Lines that compare equal are ordered by their whole text, so the result is
  always the same for the same input. Everything is sorted in your browser.

  ## EXAMPLES
  sort names.txt
  ls /bin | sort -r
  history | sort | uniq -c | sort -rn
  sort -k 2 -n scores.txt
  sort -fu words.txt

  ## SEE ALSO
  uniq, cut, head, tail, wc, grep
js: |
  // sort — order the lines of files or of piped stdin, with -r/-n/-u/-f/-k.
  const USAGE = 'usage: sort [-rnuf] [-k N[,M]] <file>...';
  const args = ctx.args;

  // ---- options ---------------------------------------------------------
  let reverse = false; // -r
  let numeric = false; // -n
  let unique = false; // -u
  let ignoreCase = false; // -f
  let keyFirstField = null; // -k N: 1-based first field of the key (null = whole line)
  let keyLastField = Infinity; // -k N,M: last field of the key
  const files = [];
  let parsingOptions = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // A lone `-` is the stdin operand, not a flag group.
    if (!parsingOptions || arg === '-' || arg[0] !== '-') {
      files.push(arg);
      continue;
    }
    if (arg === '--') {
      parsingOptions = false;
      continue;
    }
    const letters = arg.slice(1);
    for (let j = 0; j < letters.length; j++) {
      const letter = letters[j];
      if (letter === 'r') reverse = true;
      else if (letter === 'n') numeric = true;
      else if (letter === 'u') unique = true;
      else if (letter === 'f') ignoreCase = true;
      else if (letter === 'k') {
        // The key is the rest of this argument (-k2) or the next one (-k 2).
        let spec = letters.slice(j + 1);
        if (spec === '') {
          i++;
          spec = args[i];
        }
        if (spec === undefined) {
          ctx.error('sort: option requires an argument -- k');
          return;
        }
        const match = /^(\d+)(?:,(\d+))?$/.exec(spec);
        const validKey = match && Number(match[1]) >= 1 && (!match[2] || Number(match[2]) >= 1);
        if (!validKey) {
          ctx.error(`sort: invalid key '${spec}' — expected a field number N or a range N,M`);
          return;
        }
        keyFirstField = Number(match[1]);
        keyLastField = match[2] ? Number(match[2]) : Infinity;
        break; // the key consumed the rest of this argument
      } else {
        ctx.error(`sort: invalid option -- ${letter} — ${USAGE}`);
        return;
      }
    }
  }

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | sort`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
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
        // A partial sort would be misleading: like sort, give up entirely.
        ctx.error(`sort: ${file}: ${res.error}`);
        return;
      }
      content = res.content;
    }
    for (const line of toLines(content)) lines.push(line);
  }

  // ---- comparison ------------------------------------------------------
  /** The part of a line that is compared: the whole line, or the -k fields. */
  const keyOf = (line) => {
    let key = line;
    if (keyFirstField !== null) {
      const fields = line.trim().split(/\s+/);
      key = fields.slice(keyFirstField - 1, keyLastField).join(' ');
    }
    return ignoreCase ? key.toUpperCase() : key;
  };

  /** The number a key starts with (-n); 0 when it does not start with one. */
  const numberOf = (key) => {
    const match = /^\s*-?(\d+\.?\d*|\.\d+)/.exec(key);
    return match ? Number(match[0]) : 0;
  };

  /** Plain code point order (the C locale): the same result in every browser. */
  const compareText = (left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  };

  // Keys are computed once per line rather than at every comparison.
  const records = lines.map((line) => {
    const key = keyOf(line);
    return { line, key, number: numeric ? numberOf(key) : 0 };
  });

  const compareKeys = (left, right) =>
    numeric ? Math.sign(left.number - right.number) : compareText(left.key, right.key);

  records.sort((left, right) => {
    let order = compareKeys(left, right);
    // Last resort: equal keys are ordered by the whole line, so the output
    // does not depend on the input order. With -u they stay equal instead,
    // so that only the first of them is kept.
    if (order === 0 && !unique) order = compareText(left.line, right.line);
    return reverse ? -order : order;
  });

  // ---- output ----------------------------------------------------------
  const sorted = unique
    ? records.filter((record, index) => index === 0 || compareKeys(records[index - 1], record) !== 0)
    : records;
  // One block, one line per row: that is what the next pipe stage reads.
  if (sorted.length) ctx.raw(sorted.map((record) => record.line).join('\n'));
---
