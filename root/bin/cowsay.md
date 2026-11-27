---
name: cowsay
desc: a talking ASCII cow — e.g. cowsay Hello, fortune | cowsay -f owl
demo: cowsay Welcome to %HOST%
seo_title: Cowsay online — talking ASCII cow generator
man: |
  # COWSAY(6)

  ## NAME
  cowsay — make an ASCII animal say (or think) something

  ## SYNOPSIS
  cowsay [-t] [-e eyes] [-f animal] [text ...]
  cowsay -l

  ## DESCRIPTION
  Draws a speech bubble holding the text, above a cow drawn in plain
  characters. The text comes from the arguments or, when there are
  none, from a pipe (fortune | cowsay).

  The text is wrapped at 40 columns; the line breaks of piped text are
  kept. A one-line message gets a < > bubble, a longer one gets a
  bubble with rounded corners.

  This is a tribute to a classic Unix toy by genre only: the animals
  here are original LudOS drawings.

  ## OPTIONS
  -t            thinking bubble instead of a speech bubble
  -e <eyes>     two characters used as eyes (default oo), e.g. -e ^^
  -f <animal>   who speaks: cow (default), cat, owl or robot
  -l            list the available animals
  --            end of options: what follows is text, even -t

  ## NOTES
  Columns are counted in characters: emoji and wide (CJK) characters
  may push the right border of the bubble.

  ## EXAMPLES
  cowsay Hello
  cowsay -t what is for dinner
  cowsay -e ^^ -f cat purr
  fortune | cowsay -f owl
  cowsay -l

  ## SEE ALSO
  fortune, asciiart, say, neofetch
js: |
  const WRAP_COLUMNS = 40;
  const DEFAULT_EYES = 'oo';
  const USAGE = 'usage: cowsay [-t] [-e eyes] [-f animal] [text ...] | cowsay -l';

  // ---- the animals -------------------------------------------------------
  // Original drawings. Three characters are placeholders, replaced when the
  // animal is drawn: `1` and `2` are the eyes, `%` is the trail that links
  // the bubble to the speaker. String.raw keeps the backslashes readable.
  const ANIMALS = {
    cow: [
      String.raw`      %`,
      String.raw`       %   (\____/)`,
      String.raw`        %  ( 1  2 )~~~~~~~~~~.`,
      String.raw`           (  \/  )           )~*`,
      String.raw`            \_UU_/ |  |~~~~|  |`,
      String.raw`                   |__|    |__|`,
    ],
    cat: [
      String.raw`      %`,
      String.raw`       %    |\      /|`,
      String.raw`        %   | \____/ |`,
      String.raw`            /  1  2  \ `,
      String.raw`           =\   vv   /=`,
      String.raw`             '-.__.-'`,
      String.raw`             /|    |\__`,
      String.raw`            (_|____|___)~`,
    ],
    owl: [
      String.raw`      %`,
      String.raw`       %    /\    /\ `,
      String.raw`        %  ( (1)(2) )`,
      String.raw`           (   \/   )`,
      String.raw`            \ |||| /`,
      String.raw`             \||||/`,
      String.raw`             -"--"-`,
    ],
    robot: [
      String.raw`      %       o`,
      String.raw`       %      |`,
      String.raw`        %  .-----.`,
      String.raw`           |[1 2]|`,
      String.raw`           | === |`,
      String.raw`          ['-----']`,
      String.raw`           /|   |\ `,
      String.raw`            d   b`,
    ],
  };
  const animalNames = Object.keys(ANIMALS);

  // ---- options -----------------------------------------------------------
  let thinking = false;
  let eyes = DEFAULT_EYES;
  let animal = 'cow';
  let index = 0;
  for (; index < ctx.args.length; index++) {
    const arg = ctx.args[index];
    if (arg === '--') {
      index++;
      break;
    }
    if (arg === '-l') {
      ctx.raw(`Animals: ${animalNames.join(', ')}`);
      return;
    }
    if (arg === '-t') {
      thinking = true;
    } else if (arg === '-e' || arg === '-f') {
      // Both options consume the next argument as their value.
      const value = ctx.args[++index];
      if (value === undefined || value === '') {
        ctx.error(`cowsay: option ${arg} needs a value — ${USAGE}`);
        return;
      }
      if (arg === '-e') eyes = value;
      else animal = value.toLowerCase();
    } else if (/^-[a-zA-Z]$/.test(arg)) {
      ctx.error(`cowsay: unknown option ${arg} — ${USAGE}`);
      return;
    } else {
      break; // the first plain word starts the text
    }
  }
  if (!Object.hasOwn(ANIMALS, animal)) {
    ctx.error(`cowsay: unknown animal '${animal}' — choose one of: ${animalNames.join(', ')}`);
    return;
  }
  // Exactly two eye characters: a single one is used for both eyes.
  const eyeChars = Array.from(eyes);
  const leftEye = eyeChars[0];
  const rightEye = eyeChars[1] || eyeChars[0];

  // ---- the text ----------------------------------------------------------
  const words = ctx.args.slice(index);
  const message = words.length ? words.join(' ') : ctx.stdin;
  if (!message.trim()) {
    ctx.error(`cowsay: nothing to say — ${USAGE}`);
    return;
  }

  /** Wraps one paragraph at `columns`, cutting words longer than a line. */
  const wrapParagraph = (paragraph, columns) => {
    const lines = [];
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      // A word that cannot fit on any line is cut into full-width pieces.
      while (rest.length > columns) {
        if (current) lines.push(current);
        current = '';
        lines.push(rest.slice(0, columns));
        rest = rest.slice(columns);
      }
      if (!rest) continue;
      if (!current) current = rest;
      else if (current.length + 1 + rest.length <= columns) current += ` ${rest}`;
      else {
        lines.push(current);
        current = rest;
      }
    }
    if (current) lines.push(current);
    // An empty paragraph is a blank line of the original text: keep it.
    return lines.length ? lines : [''];
  };

  const paragraphs = message.replace(/\r/g, '').replace(/\t/g, ' ').split('\n');
  // Blank lines around the text (a trailing newline from a pipe) are noise.
  while (paragraphs.length && !paragraphs[0].trim()) paragraphs.shift();
  while (paragraphs.length && !paragraphs[paragraphs.length - 1].trim()) paragraphs.pop();
  const textLines = paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, WRAP_COLUMNS));

  // ---- the bubble --------------------------------------------------------
  /** The border characters of one bubble row: [left, right]. */
  const borders = (row, count) => {
    if (thinking) return ['(', ')'];
    if (count === 1) return ['<', '>'];
    if (row === 0) return ['/', '\\'];
    if (row === count - 1) return ['\\', '/'];
    return ['|', '|'];
  };
  const width = Math.max(...textLines.map((line) => line.length));
  const bubble = [` .${'-'.repeat(width)}.`];
  textLines.forEach((line, row) => {
    const [left, right] = borders(row, textLines.length);
    bubble.push(`${left} ${line.padEnd(width)} ${right}`);
  });
  bubble.push(` '${'-'.repeat(width)}'`);

  // ---- the speaker -------------------------------------------------------
  const trail = thinking ? 'o' : '\\';
  const substitutes = { 1: leftEye, 2: rightEye, '%': trail };
  // One pass over each row, so custom eyes are never mistaken for a
  // placeholder themselves (`-e 12`, `-e %%`).
  const drawRow = (row) =>
    Array.from(row.trimEnd())
      .map((char) => (Object.hasOwn(substitutes, char) ? substitutes[char] : char))
      .join('');
  const speaker = ANIMALS[animal].map(drawRow);

  ctx.raw([...bubble, ...speaker].join('\n'));
---
