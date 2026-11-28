---
name: lorem
desc: generate lorem ipsum placeholder text — e.g. lorem, lorem 3 paragraphs, lorem 20 words
agent: read
alias: ipsum
demo: lorem -s 2 paragraphs
seo_title: Lorem ipsum generator — placeholder text
man: |
  # LOREM(1)

  ## NAME
  lorem — generate lorem ipsum placeholder text

  ## SYNOPSIS
  lorem [-s] [count] [words|sentences|paragraphs]

  ## DESCRIPTION
  Prints placeholder text made of pseudo-Latin words: one paragraph by
  default, or the given number of words, sentences or paragraphs. The unit
  can be shortened (w, s, p) and the two arguments can come in any order.
  The text is different on every run.

  The output is plain text: pipe it or redirect it to a file, e.g.
  lorem 5 paragraphs > draft.txt.

  ## OPTIONS
  -s   start with the classic opening "Lorem ipsum dolor sit amet"

  Limits: 5000 words, 500 sentences, 100 paragraphs.

  ## HOW IT WORKS
  "Lorem ipsum" is the filler text printers and designers have used since
  the 1500s. It comes from a scrambled passage of Cicero's De finibus
  bonorum et malorum (45 BC): it looks like real prose — word lengths,
  rhythm, punctuation — but means nothing, so readers judge the layout
  instead of reading the content.

  Words are drawn at random from a fixed list taken from the traditional
  passage. A sentence has 6 to 14 words, sometimes with a comma; a
  paragraph has 4 to 7 sentences. The draw uses your browser's ordinary
  random generator, which is fine for filler text; nothing is downloaded.

  ## USE CASES
  - fill a page mock-up, a template or a slide before the real copy exists;
  - test how a layout wraps short and long texts (lorem 3 words, lorem 8 p);
  - create a sample file to try other commands: lorem 3 p > sample.txt,
    then wc sample.txt.

  ## EXAMPLES
  lorem
  lorem 3 paragraphs
  lorem -s 2 sentences
  lorem 20 words
  lorem 5 p | wc -w

  ## SEE ALSO
  fortune, wc, asciiart, uuid
js: |
  // lorem — pseudo-Latin placeholder text, by words, sentences or paragraphs.
  const USAGE = 'usage: lorem [-s] [count] [words|sentences|paragraphs]';
  const OPENING = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet'];
  // The vocabulary of the traditional passage (after its opening words).
  const WORDS = [
    'lorem',
    'ipsum',
    'dolor',
    'sit',
    'amet',
    'consectetur',
    'adipiscing',
    'elit',
    'sed',
    'do',
    'eiusmod',
    'tempor',
    'incididunt',
    'ut',
    'labore',
    'et',
    'dolore',
    'magna',
    'aliqua',
    'enim',
    'ad',
    'minim',
    'veniam',
    'quis',
    'nostrud',
    'exercitation',
    'ullamco',
    'laboris',
    'nisi',
    'aliquip',
    'ex',
    'ea',
    'commodo',
    'consequat',
    'duis',
    'aute',
    'irure',
    'in',
    'reprehenderit',
    'voluptate',
    'velit',
    'esse',
    'cillum',
    'eu',
    'fugiat',
    'nulla',
    'pariatur',
    'excepteur',
    'sint',
    'occaecat',
    'cupidatat',
    'non',
    'proident',
    'sunt',
    'culpa',
    'qui',
    'officia',
    'deserunt',
    'mollit',
    'anim',
    'id',
    'est',
    'laborum',
  ];
  const LIMITS = { words: 5000, sentences: 500, paragraphs: 100 };

  // ---- arguments ----------------------------------------------------------
  let classicStart = false;
  let count = 1;
  let unit = 'paragraphs';
  let countGiven = false;
  let unitGiven = false;
  for (const arg of ctx.args) {
    const word = arg.toLowerCase();
    // Any prefix of a unit name selects it: w, word, words…
    const namedUnit = Object.keys(LIMITS).find((candidate) => candidate.startsWith(word));
    if (arg === '-s') {
      classicStart = true;
    } else if (/^\d+$/.test(arg) && !countGiven) {
      count = Number(arg);
      countGiven = true;
    } else if (namedUnit && !unitGiven) {
      unit = namedUnit;
      unitGiven = true;
    } else {
      ctx.error(USAGE);
      return;
    }
  }
  if (count < 1 || count > LIMITS[unit]) {
    ctx.error(`lorem: the number of ${unit} must be between 1 and ${LIMITS[unit]}`);
    return;
  }

  // ---- generation ---------------------------------------------------------
  // Math.random is enough here: filler text has no security stake.
  const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  /** A random word, never the one just used ("dolor dolor" reads like a typo). */
  const pickWord = (previous) => {
    let word = WORDS[between(0, WORDS.length - 1)];
    while (word === previous) word = WORDS[between(0, WORDS.length - 1)];
    return word;
  };
  /** `count` words; with `classic`, the first ones are the famous opening. */
  const makeWords = (wordCount, classic) => {
    const words = classic ? OPENING.slice(0, wordCount) : [];
    while (words.length < wordCount) words.push(pickWord(words[words.length - 1]));
    return words;
  };
  const makeSentence = (classic) => {
    const words = makeWords(between(6, 14), classic);
    // The opening is always followed by a comma; other sentences get one
    // half of the time, somewhere in the middle.
    let commaAfter = -1;
    if (classic) commaAfter = OPENING.length - 1;
    else if (words.length >= 8 && Math.random() < 0.5) commaAfter = between(2, words.length - 4);
    const text = words.map((word, index) => (index === commaAfter ? `${word},` : word)).join(' ');
    return `${text[0].toUpperCase()}${text.slice(1)}.`;
  };
  const makeParagraph = (classic) => {
    const sentences = [];
    const sentenceCount = between(4, 7);
    for (let index = 0; index < sentenceCount; index++) {
      sentences.push(makeSentence(classic && index === 0));
    }
    return sentences.join(' ');
  };

  // ---- output -------------------------------------------------------------
  if (unit === 'words') {
    ctx.raw(makeWords(count, classicStart).join(' '));
    return;
  }
  if (unit === 'sentences') {
    const sentences = [];
    for (let index = 0; index < count; index++) {
      sentences.push(makeSentence(classicStart && index === 0));
    }
    ctx.raw(sentences.join(' '));
    return;
  }
  for (let index = 0; index < count; index++) {
    // A blank line between paragraphs, on screen and in a redirected file.
    if (index > 0) ctx.line('');
    ctx.raw(makeParagraph(classicStart && index === 0));
  }
---
