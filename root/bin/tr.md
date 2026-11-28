---
name: tr
desc: translate or delete characters of piped text — e.g. echo hello | tr a-z A-Z
agent: read
page: false
man: |
  # TR(1)

  ## NAME
  tr — translate, squeeze or delete characters

  ## SYNOPSIS
  ... | tr SET1 SET2
  ... | tr -d SET1
  ... | tr -s SET1 [SET2]

  ## DESCRIPTION
  Copies the piped text, replacing each character of SET1 by the character at
  the same position in SET2. When SET2 is shorter, its last character is
  repeated. Like the Unix tr, it only reads standard input: to transform a
  file, pipe it in — `cat file | tr a-z A-Z`.

  ## OPTIONS
  -d   delete the characters of SET1 instead of translating them
  -s   squeeze: replace each run of a repeated character of the last set
       by a single one (after translating or deleting, if any)

  ## SETS
  A set is a string of characters. It may contain:

  a-z         a range of characters
  [:upper:]   capital letters A-Z
  [:lower:]   lowercase letters a-z
  [:alpha:]   letters
  [:digit:]   digits 0-9
  [:alnum:]   letters and digits
  [:space:]   whitespace (space, tab, newline…)
  \n \t \\    a newline, a tab, a backslash

  Quote a set that contains a space or a backslash: `tr ' ' '\n'`. Start the
  sets with `--` if SET1 begins with a dash.

  ## NOTES
  Character classes cover ASCII only: accented letters are left untouched by
  `[:upper:]` and `[:lower:]`.

  ## EXAMPLES
  echo "hello world" | tr a-z A-Z
  echo "Hello World" | tr '[:upper:]' '[:lower:]'
  echo "one two three" | tr ' ' '\n'
  echo "2026-11-28" | tr -d -
  echo "too    many   spaces" | tr -s ' '
  cat about.md | tr -d '[:digit:]'

  ## SEE ALSO
  cut, rev, sort, grep, cat
js: |
  // tr — translate (SET1 -> SET2), delete (-d) or squeeze (-s) the characters
  // of piped stdin. Like the Unix tr, it takes no file operand.
  const USAGE = 'usage: … | tr [-ds] SET1 [SET2]  (e.g. echo hello | tr a-z A-Z)';

  // ---- options ---------------------------------------------------------
  let deleteMode = false; // -d
  let squeeze = false; // -s
  const sets = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    // Options come first: after the first set, a dash is an ordinary character.
    if (!parsingOptions || sets.length || arg.length < 2 || arg[0] !== '-') {
      sets.push(arg);
      continue;
    }
    if (arg === '--') {
      parsingOptions = false;
      continue;
    }
    for (const letter of arg.slice(1)) {
      if (letter === 'd') deleteMode = true;
      else if (letter === 's') squeeze = true;
      else {
        ctx.error(`tr: invalid option -- ${letter} — ${USAGE}`);
        return;
      }
    }
  }

  // How many sets each mode needs: translating takes two, deleting one,
  // squeezing one or two, deleting then squeezing two.
  let minimumSets = 2;
  let maximumSets = 2;
  if (deleteMode && !squeeze) minimumSets = maximumSets = 1;
  if (squeeze && !deleteMode) minimumSets = 1;
  if (sets.length === 0) {
    ctx.error(USAGE);
    return;
  }
  if (sets.length < minimumSets) {
    ctx.error(`tr: missing operand after '${sets[sets.length - 1]}' — two sets are required`);
    return;
  }
  if (sets.length > maximumSets) {
    ctx.error(`tr: extra operand '${sets[maximumSets]}'`);
    return;
  }

  // ---- sets ------------------------------------------------------------
  /** Every character from `first` to `last`, by code point. */
  const characterRange = (first, last) => {
    const characters = [];
    for (let code = first.codePointAt(0); code <= last.codePointAt(0); code++) {
      characters.push(String.fromCodePoint(code));
    }
    return characters;
  };
  const UPPER = characterRange('A', 'Z');
  const LOWER = characterRange('a', 'z');
  const DIGIT = characterRange('0', '9');
  const CLASSES = {
    upper: UPPER,
    lower: LOWER,
    digit: DIGIT,
    alpha: [...UPPER, ...LOWER],
    alnum: [...DIGIT, ...UPPER, ...LOWER],
    space: [' ', '\t', '\n', '\r', '\v', '\f'],
  };
  // The shell hands backslashes over untouched, so `\n` arrives as two characters.
  const ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\' };

  /**
   * Expands a set (`a-z0-9`, `[:upper:]`, `\n`…) into its list of characters.
   * Throws an Error describing the problem when the set is malformed.
   */
  const expandSet = (spec) => {
    const symbols = Array.from(spec); // code points, so an emoji is one symbol
    const expanded = [];
    let position = 0;

    /** Reads the character at `position`, decoding a backslash escape. */
    const readCharacter = () => {
      const symbol = symbols[position];
      position++;
      // A trailing backslash stands for itself.
      if (symbol !== '\\' || position >= symbols.length) return symbol;
      const escaped = symbols[position];
      position++;
      // An unknown escape (`\-`, `\[`) is that character taken literally.
      return ESCAPES[escaped] ?? escaped;
    };

    while (position < symbols.length) {
      // A `[:name:]` character class.
      const classMatch = /^\[:([a-z]*):\]/.exec(symbols.slice(position).join(''));
      if (classMatch) {
        const members = CLASSES[classMatch[1]];
        if (!members) throw new Error(`invalid character class '${classMatch[1]}'`);
        for (const member of members) expanded.push(member);
        position += classMatch[0].length;
        continue;
      }
      const first = readCharacter();
      // A dash between two characters makes a range; a leading or trailing
      // dash is an ordinary character.
      const startsRange = symbols[position] === '-' && position + 1 < symbols.length;
      if (!startsRange) {
        expanded.push(first);
        continue;
      }
      position++; // skip the dash
      const last = readCharacter();
      if (last.codePointAt(0) < first.codePointAt(0)) {
        throw new Error(`the range '${first}-${last}' runs backwards`);
      }
      for (const member of characterRange(first, last)) expanded.push(member);
    }
    return expanded;
  };

  let firstSet;
  let secondSet = null;
  try {
    firstSet = expandSet(sets[0]);
    if (sets.length > 1) secondSet = expandSet(sets[1]);
  } catch (err) {
    ctx.error(`tr: ${err.message}`);
    return;
  }
  const translating = !deleteMode && secondSet !== null;
  if (translating && firstSet.length && !secondSet.length) {
    ctx.error('tr: SET2 must not be empty when translating');
    return;
  }

  // ---- input -----------------------------------------------------------
  // Only ctx.piped tells an empty pipe from no pipe at all. Older engines lack
  // it: fall back on "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  if (!piped) {
    ctx.error(USAGE);
    return;
  }
  let characters = Array.from(ctx.stdin);

  // ---- transformation --------------------------------------------------
  if (deleteMode) {
    const deleted = new Set(firstSet);
    characters = characters.filter((character) => !deleted.has(character));
  } else if (translating) {
    const translation = new Map();
    firstSet.forEach((character, index) => {
      // A shorter SET2 is extended with its last character, as GNU tr does.
      translation.set(character, secondSet[Math.min(index, secondSet.length - 1)]);
    });
    characters = characters.map((character) => translation.get(character) ?? character);
  }
  if (squeeze) {
    // Squeezing applies to the last set given, after the step above.
    const squeezed = new Set(secondSet ?? firstSet);
    characters = characters.filter(
      (character, index) => !(squeezed.has(character) && characters[index - 1] === character),
    );
  }

  // Each output entry is one line for the next pipe stage, which adds the line
  // break itself: drop the one that ends the text.
  const result = characters.join('').replace(/\n$/, '');
  if (result !== '') ctx.raw(result);
---
