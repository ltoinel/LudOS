---
name: asciiart
desc: turn text into ASCII art — e.g. asciiart Hello, asciiart -s 3d Hi
alias: banner
demo: asciiart -s 3d Hello
seo_title: ASCII art text generator — 10 banner styles
man: |
  # ASCIIART(1)

  ## NAME
  asciiart — render text as large ASCII-art letters

  ## SYNOPSIS
  asciiart [-s style] [-w width] <text>
  asciiart --styles
  asciiart --demo [text]
  echo text | asciiart

  ## DESCRIPTION
  Renders text as big letters drawn from a built-in 5-row pixel font,
  in one of several styles: block, shadow, 3d, slant, wide, small,
  hash, dots, letters, binary. Accents are folded (é → E); unsupported
  characters show as ?. Long text wraps at the given width (default 80
  columns). Text can also be piped in.

  ## OPTIONS
  -s <style>   style to use (default: block) — see --styles
  -w <width>   wrap width in columns (20 to 200)
  --styles     list the available styles
  --demo       render a sample (or the given text) in every style

  ## USE CASES
  - banners for a README, a terminal greeting (motd) or a code comment;
  - big, readable text in a chat or a presentation slide;
  - chain it with other commands: date | asciiart -s small.

  ## NOTES
  The font covers the Latin letters, digits and common punctuation; lowercase
  is drawn as uppercase.

  ## EXAMPLES
  asciiart Hello
  asciiart -s shadow LUDO
  asciiart -s 3d -w 60 May the source be with you
  asciiart --demo Hi
  date | asciiart -s small

  ## SEE ALSO
  fortune, qr, echo
js: |
  // Self-contained: a hand-drawn 5-row pixel font rendered through several
  // styles. `X` = ink, `.` = blank; every row of a glyph has the same width.
  const FONT = {
    A: ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
    B: ['XXXX.', 'X...X', 'XXXX.', 'X...X', 'XXXX.'],
    C: ['.XXXX', 'X....', 'X....', 'X....', '.XXXX'],
    D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    E: ['XXXXX', 'X....', 'XXXX.', 'X....', 'XXXXX'],
    F: ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....'],
    G: ['.XXXX', 'X....', 'X..XX', 'X...X', '.XXXX'],
    H: ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    J: ['..XXX', '...X.', '...X.', 'X..X.', '.XX..'],
    K: ['X...X', 'X..X.', 'XXX..', 'X..X.', 'X...X'],
    L: ['X....', 'X....', 'X....', 'X....', 'XXXXX'],
    M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
    N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X'],
    O: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
    P: ['XXXX.', 'X...X', 'XXXX.', 'X....', 'X....'],
    Q: ['.XXX.', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
    R: ['XXXX.', 'X...X', 'XXXX.', 'X..X.', 'X...X'],
    S: ['.XXXX', 'X....', '.XXX.', '....X', 'XXXX.'],
    T: ['XXXXX', '..X..', '..X..', '..X..', '..X..'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    V: ['X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
    W: ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
    X: ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'],
    Y: ['X...X', '.X.X.', '..X..', '..X..', '..X..'],
    Z: ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX'],
    '0': ['.XXX.', 'X..XX', 'X.X.X', 'XX..X', '.XXX.'],
    '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
    '2': ['XXXX.', '....X', '.XXX.', 'X....', 'XXXXX'],
    '3': ['XXXX.', '....X', '.XXX.', '....X', 'XXXX.'],
    '4': ['X..X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
    '5': ['XXXXX', 'X....', 'XXXX.', '....X', 'XXXX.'],
    '6': ['.XXX.', 'X....', 'XXXX.', 'X...X', '.XXX.'],
    '7': ['XXXXX', '...X.', '..X..', '.X...', '.X...'],
    '8': ['.XXX.', 'X...X', '.XXX.', 'X...X', '.XXX.'],
    '9': ['.XXX.', 'X...X', '.XXXX', '....X', '.XXX.'],
    ' ': ['...', '...', '...', '...', '...'],
    '!': ['X', 'X', 'X', '.', 'X'],
    '?': ['XXX.', '...X', '.XX.', '....', '.X..'],
    '.': ['.', '.', '.', '.', 'X'],
    ',': ['..', '..', '..', '.X', 'X.'],
    ':': ['.', 'X', '.', 'X', '.'],
    ';': ['..', '.X', '..', '.X', 'X.'],
    "'": ['X', 'X', '.', '.', '.'],
    '"': ['X.X', 'X.X', '...', '...', '...'],
    '-': ['...', '...', 'XXX', '...', '...'],
    _: ['....', '....', '....', '....', 'XXXX'],
    '+': ['...', '.X.', 'XXX', '.X.', '...'],
    '=': ['...', 'XXX', '...', 'XXX', '...'],
    '*': ['.....', 'X.X.X', '.XXX.', 'X.X.X', '.....'],
    '/': ['....X', '...X.', '..X..', '.X...', 'X....'],
    '(': ['.X', 'X.', 'X.', 'X.', '.X'],
    ')': ['X.', '.X', '.X', '.X', 'X.'],
    '#': ['.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.'],
    '@': ['.XXX.', 'X.X.X', 'X.XXX', 'X....', '.XXXX'],
    '<': ['..X', '.X.', 'X..', '.X.', '..X'],
    '>': ['X..', '.X.', '..X', '.X.', 'X..'],
  };

  const FONT_HEIGHT = 5;

  // Folds a character onto a FONT key: accents stripped, uppercased,
  // anything unsupported becomes `?`.
  const fontKey = (char) => {
    const base = char.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    return FONT[base] ? base : '?';
  };

  // Rasterizes a line of text into a grid of cells: glyphs side by side, one
  // blank column apart. A cell holds the letter it belongs to, or null.
  const rasterize = (text) => {
    const rows = Array.from({ length: FONT_HEIGHT }, () => []);
    [...text].forEach((char, index) => {
      const key = fontKey(char);
      FONT[key].forEach((pattern, y) => {
        if (index > 0) {
          rows[y].push(null); // letter spacing
        }
        for (const pixel of pattern) {
          const inked = pixel === 'X' && key !== ' ';
          rows[y].push(inked ? key : null);
        }
      });
    });
    return rows;
  };

  const gridWidth = (grid) => (grid[0] ? grid[0].length : 0);

  // Paints layers onto a blank canvas (later layers on top). Each layer is
  // { grid, dx, dy, ink(letter, x, y) }. Returns lines, trailing spaces trimmed.
  const paint = (width, height, layers) => {
    const canvas = Array.from({ length: height }, () => new Array(width).fill(' '));
    for (const layer of layers) {
      layer.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell) {
            canvas[y + layer.dy][x + layer.dx] = layer.ink(cell, x, y);
          }
        });
      });
    }
    return canvas.map((row) => row.join('').replace(/\s+$/, ''));
  };

  // A style filling every inked pixel with the same character.
  const solid = (char) => (grid) =>
    paint(gridWidth(grid), grid.length, [{ grid, dx: 0, dy: 0, ink: () => char }]);

  // Each style: a description, how much wider than the bitmap it renders
  // (used to wrap), and the renderer itself.
  const STYLES = {
    block: {
      desc: 'solid blocks (default)',
      widthOf: (w) => w,
      render: solid('█'),
    },
    shadow: {
      desc: 'solid blocks with a drop shadow',
      widthOf: (w) => w + 1,
      render: (grid) =>
        paint(gridWidth(grid) + 1, grid.length + 1, [
          { grid, dx: 1, dy: 1, ink: () => '░' },
          { grid, dx: 0, dy: 0, ink: () => '█' },
        ]),
    },
    '3d': {
      desc: 'extruded 3D letters',
      widthOf: (w) => w + 2,
      render: (grid) =>
        paint(gridWidth(grid) + 2, grid.length + 2, [
          { grid, dx: 2, dy: 2, ink: () => '░' },
          { grid, dx: 1, dy: 1, ink: () => '▒' },
          { grid, dx: 0, dy: 0, ink: () => '█' },
        ]),
    },
    slant: {
      desc: 'italic, leaning right',
      widthOf: (w) => w + FONT_HEIGHT - 1,
      render: (grid) =>
        solid('█')(grid).map((line, y) => ' '.repeat(grid.length - 1 - y) + line),
    },
    wide: {
      desc: 'double-width blocks',
      widthOf: (w) => w * 2,
      render: (grid) => solid('█')(grid.map((row) => row.flatMap((cell) => [cell, cell]))),
    },
    small: {
      desc: 'compact half-blocks, fits narrow screens',
      widthOf: (w) => w,
      render: (grid) => {
        const lines = [];
        for (let y = 0; y < grid.length; y += 2) {
          const line = grid[y].map((top, x) => {
            const bottom = grid[y + 1] ? grid[y + 1][x] : null;
            if (top && bottom) return '█';
            if (top) return '▀';
            if (bottom) return '▄';
            return ' ';
          });
          lines.push(line.join('').replace(/\s+$/, ''));
        }
        return lines;
      },
    },
    hash: {
      desc: 'classic # banner',
      widthOf: (w) => w,
      render: solid('#'),
    },
    dots: {
      desc: 'dot-matrix display',
      widthOf: (w) => w,
      render: solid('•'),
    },
    letters: {
      desc: 'each letter drawn with itself',
      widthOf: (w) => w,
      render: (grid) =>
        paint(gridWidth(grid), grid.length, [{ grid, dx: 0, dy: 0, ink: (letter) => letter }]),
    },
    binary: {
      desc: 'drawn in 0s and 1s',
      widthOf: (w) => w,
      render: (grid) =>
        paint(gridWidth(grid), grid.length, [
          { grid, dx: 0, dy: 0, ink: (_letter, x, y) => ((x * 7 + y * 3) % 5 < 2 ? '0' : '1') },
        ]),
    },
  };

  // Renders `text` in a style, word-wrapping so no line exceeds `maxWidth`
  // columns (an over-long word still gets its own line). Wrapped lines are
  // separated by a blank line.
  const renderArt = (text, style, maxWidth) => {
    const renderedWidth = (line) => style.widthOf(gridWidth(rasterize(line)));
    const lines = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && renderedWidth(candidate) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines.map((line) => style.render(rasterize(line)).join('\n')).join('\n\n');
  };

  // ---- command line ----
  const E = ctx.escape;
  const args = ctx.args.slice();
  let styleName = 'block';
  let width = 80;
  let demo = false;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--styles' || arg === '-l') {
      for (const [name, style] of Object.entries(STYLES)) {
        ctx.append(
          `<div class="ln"><span class="cmd">${E(name.padEnd(9))}</span> ` +
            `<span class="comment">${E(style.desc)}</span></div>`,
        );
      }
      return;
    }
    if (arg === '-s') {
      styleName = (args[++i] || '').toLowerCase();
    } else if (arg === '-w') {
      width = Math.min(200, Math.max(20, parseInt(args[++i], 10) || 80));
    } else if (arg === '--demo') {
      demo = true;
    } else {
      words.push(arg);
    }
  }
  if (!STYLES[styleName]) {
    ctx.error(`asciiart: unknown style "${styleName}" — try: asciiart --styles`);
    return;
  }
  const fallback = demo ? 'Hello' : '';
  const text = (words.join(' ') || ctx.stdin.split('\n')[0] || fallback).trim().slice(0, 200);
  if (!text) {
    ctx.error('usage: asciiart [-s style] [-w width] <text>');
    return;
  }

  const show = (art) => {
    ctx.append(`<div class="ln ascii-art"><span class="accent text-glow">${E(art)}</span></div>`);
  };
  if (demo) {
    for (const [name, style] of Object.entries(STYLES)) {
      ctx.append(
        `<div class="ln"><span class="cmd">${E(name)}</span> ` +
          `<span class="comment">— ${E(style.desc)}</span></div>`,
      );
      show(renderArt(text, style, width));
    }
  } else {
    show(renderArt(text, STYLES[styleName], width));
  }
---
