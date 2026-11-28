---
name: color
desc: convert a colour between hex, rgb, hsl and names — e.g. color #ff8800, color tomato
agent: read
alias: colour
demo: color #ff8800
seo_title: Color converter — hex, RGB, HSL & WCAG contrast
man: |
  # COLOR(1)

  ## NAME
  color — convert a colour between hex, RGB, HSL and CSS names

  ## SYNOPSIS
  color <colour>
  color                  (read the colour from piped input)

  ## DESCRIPTION
  Reads a colour in any common CSS notation and prints it in all of them —
  hexadecimal, rgb() and hsl() — next to a swatch, followed by its WCAG
  contrast ratio against white and against black.

  Accepted notations:

  `#f80`, `#ff8800`           hexadecimal, 3 or 6 digits (the # is optional)
  `#f80c`, `#ff8800cc`        hexadecimal with alpha, 4 or 8 digits
  `rgb(255, 136, 0)`          also rgb(255 136 0 / 50%) and rgba(…)
  `hsl(32, 100%, 50%)`        also hsl(32deg 100% 50% / 0.5) and hsla(…)
  `tomato`, `rebeccapurple`   any CSS colour name, and `transparent`

  ## HOW IT WORKS
  The three notations describe the same sRGB colour. Hex and rgb() give the
  red, green and blue channels (0-255); hsl() gives a hue (an angle on the
  colour wheel: 0 red, 120 green, 240 blue), a saturation and a lightness,
  which is easier to adjust by hand. Hex, rgb() and hsl() are converted with
  plain arithmetic; names are resolved by your browser's own CSS engine, so
  every name it knows is accepted.

  The contrast ratio is the one defined by the WCAG accessibility
  guidelines: it compares the relative luminance of two colours and ranges
  from 1:1 (identical) to 21:1 (black on white). Text needs at least 4.5:1
  to reach level AA (3:1 for large text) and 7:1 for level AAA. The ratio
  tells whether white or black text is the readable choice on that colour.
  Transparency is ignored for contrast: the ratio is the opaque colour's.

  Everything is computed in your browser.

  ## USE CASES
  - turn the hex code of a mock-up into rgb() or hsl() for a stylesheet;
  - find the hex value of a CSS colour name;
  - decide between white and black text on a brand colour;
  - check that a text/background pair meets WCAG AA before shipping.

  ## NOTES
  hsl() values are rounded to one decimal, so converting back and forth may
  move a channel by one. Wide-gamut colours (display-p3, lab, oklch) are
  outside the sRGB notations handled here.

  ## EXAMPLES
  color #ff8800
  color f80
  color "rgb(255, 136, 0)"
  color "hsl(210 50% 40% / 0.8)"
  color rebeccapurple

  ## SEE ALSO
  theme, qr, asciiart, bc
js: |
  // color — one sRGB colour in every notation, with its WCAG contrast.
  const E = ctx.escape;
  let input = ctx.args.filter((arg) => arg !== '--').join(' ');
  if (!input.trim() && ctx.stdin) input = ctx.stdin;
  input = input.trim();
  if (!input) {
    ctx.error('usage: color <#hex | rgb(…) | hsl(…) | name>');
    return;
  }

  // ---- parsing ------------------------------------------------------------
  // Every parser returns `{ red, green, blue, alpha }` — channels as numbers
  // in 0-255 (not rounded yet), alpha in 0-1 — or null when the text is not
  // in its notation.
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; the `#` is optional. */
  const parseHex = (text) => {
    const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
    if (!match) return null;
    let digits = match[1];
    // The short form repeats each digit: #f80 is #ff8800.
    if (digits.length <= 4) digits = digits.replace(/./g, '$&$&');
    const channel = (offset) => parseInt(digits.slice(offset, offset + 2), 16);
    return {
      red: channel(0),
      green: channel(2),
      blue: channel(4),
      alpha: digits.length === 8 ? channel(6) / 255 : 1,
    };
  };

  /** Converts HSL (hue in degrees, saturation and lightness in 0-1) to channels. */
  const hslToRgb = (hue, saturation, lightness) => {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = (((hue % 360) + 360) % 360) / 60;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    // Which two channels carry the colour depends on the sixth of the wheel.
    const mixes = [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ];
    const [red, green, blue] = mixes[Math.floor(sector) % 6];
    const base = lightness - chroma / 2;
    return { red: (red + base) * 255, green: (green + base) * 255, blue: (blue + base) * 255 };
  };

  /** `rgb()`, `rgba()`, `hsl()`, `hsla()` — comma or space separated. */
  const parseFunction = (text) => {
    const match = /^(rgb|hsl)a?\(([^()]*)\)$/i.exec(text);
    if (!match) return null;
    const kind = match[1].toLowerCase();
    const parts = match[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    // A number with an optional unit; null when it is anything else.
    const read = (part, units) => {
      const number = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(part);
      if (!number || !units.includes(number[2].toLowerCase())) return null;
      return { value: Number(number[1]), unit: number[2].toLowerCase() };
    };
    let alpha = 1;
    if (parts.length === 4) {
      const alphaPart = read(parts[3], ['', '%']);
      if (!alphaPart) return null;
      alpha = clamp(alphaPart.unit === '%' ? alphaPart.value / 100 : alphaPart.value, 0, 1);
    }
    if (kind === 'rgb') {
      const channels = parts.slice(0, 3).map((part) => read(part, ['', '%']));
      if (channels.includes(null)) return null;
      const [red, green, blue] = channels.map((channel) =>
        clamp(channel.unit === '%' ? channel.value * 2.55 : channel.value, 0, 255),
      );
      return { red, green, blue, alpha };
    }
    const hue = read(parts[0], ['', 'deg']);
    const saturation = read(parts[1], ['', '%']);
    const lightness = read(parts[2], ['', '%']);
    if (!hue || !saturation || !lightness) return null;
    const channels = hslToRgb(
      hue.value,
      clamp(saturation.value, 0, 100) / 100,
      clamp(lightness.value, 0, 100) / 100,
    );
    return { ...channels, alpha };
  };

  /**
   * Lets the browser's CSS engine resolve anything else — colour names above
   * all. A canvas normalizes a valid colour to `#rrggbb` or `rgba(…)` and
   * silently ignores an invalid one, so the same assignment is tried over two
   * different starting values: a result that follows the starting value was
   * never accepted. Returns the normalized text, or null (also without a DOM).
   */
  const resolveWithBrowser = (text) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext ? canvas.getContext('2d') : null;
    if (!context) return null;
    context.fillStyle = '#000000';
    context.fillStyle = text;
    const overBlack = String(context.fillStyle);
    context.fillStyle = '#ffffff';
    context.fillStyle = text;
    const overWhite = String(context.fillStyle);
    return overBlack === overWhite ? overBlack : null;
  };

  let color = parseHex(input) || parseFunction(input);
  let name = null;
  if (!color) {
    const resolved = resolveWithBrowser(input);
    if (resolved) {
      color = parseHex(resolved) || parseFunction(resolved);
      if (!color) {
        ctx.error(`color: "${input}" is outside the sRGB notations (hex, rgb, hsl)`);
        return;
      }
      if (/^[a-z]+$/i.test(input)) name = input.toLowerCase();
    }
  }
  if (!color) {
    const hint = typeof document === 'undefined' ? ' (colour names need a browser)' : '';
    ctx.error(`color: cannot read "${input}"${hint} — try #ff8800, rgb(255, 136, 0) or tomato`);
    return;
  }

  // ---- notations ----------------------------------------------------------
  const red = Math.round(color.red);
  const green = Math.round(color.green);
  const blue = Math.round(color.blue);
  const alpha = color.alpha;
  const opaque = alpha >= 1;
  /** At most `digits` decimals, without trailing zeros. */
  const trim = (number, digits) => String(Number(number.toFixed(digits)));

  const hexPair = (channel) => channel.toString(16).padStart(2, '0');
  const hex =
    `#${hexPair(red)}${hexPair(green)}${hexPair(blue)}` +
    (opaque ? '' : hexPair(Math.round(alpha * 255)));

  /** Hue (degrees), saturation and lightness (percent) of the rounded channels. */
  const toHsl = () => {
    const [r, g, b] = [red / 255, green / 255, blue / 255];
    const highest = Math.max(r, g, b);
    const lowest = Math.min(r, g, b);
    const spread = highest - lowest;
    const lightness = (highest + lowest) / 2;
    let hue = 0;
    let saturation = 0;
    if (spread > 0) {
      saturation = spread / (1 - Math.abs(2 * lightness - 1));
      if (highest === r) hue = ((g - b) / spread) % 6;
      else if (highest === g) hue = (b - r) / spread + 2;
      else hue = (r - g) / spread + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return [trim(hue, 1), trim(saturation * 100, 1), trim(lightness * 100, 1)];
  };
  const [hue, saturation, lightness] = toHsl();
  const alphaText = trim(alpha, 3);
  const rgbText = opaque
    ? `rgb(${red}, ${green}, ${blue})`
    : `rgba(${red}, ${green}, ${blue}, ${alphaText})`;
  const hslText = opaque
    ? `hsl(${hue}, ${saturation}%, ${lightness}%)`
    : `hsla(${hue}, ${saturation}%, ${lightness}%, ${alphaText})`;

  // ---- contrast -----------------------------------------------------------
  /** WCAG 2 relative luminance: 0 for black, 1 for white. */
  const luminance = () => {
    const linear = (channel) => {
      const scaled = channel / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const own = luminance();
  // (lighter + 0.05) / (darker + 0.05); white is 1 and black is 0.
  const againstWhite = 1.05 / (own + 0.05);
  const againstBlack = (own + 0.05) / 0.05;
  /** The WCAG level a text/background pair with that ratio reaches. */
  const level = (ratio) => {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'AA for large text only';
    return 'fails AA';
  };
  const contrast = (ratio) => `${ratio.toFixed(2)}:1  ${level(ratio)}`;

  // ---- output -------------------------------------------------------------
  const LABEL_WIDTH = 11;
  const row = (label, value) => ctx.raw(label.padEnd(LABEL_WIDTH) + value);
  if (name) row('name', name);
  // `hex` only holds hex digits, so it is safe inside the style attribute.
  const swatch =
    '<span style="display:inline-block;width:5em;height:1em;margin-left:1em;' +
    `vertical-align:middle;border:1px solid var(--dim);background:${hex}"></span>`;
  ctx.append(
    '<div class="ln out" style="white-space:pre-wrap">' +
      `${E('hex'.padEnd(LABEL_WIDTH) + hex)}${swatch}</div>`,
  );
  row('rgb', rgbText);
  row('hsl', hslText);
  ctx.line('');
  row('on white', contrast(againstWhite));
  row('on black', contrast(againstBlack));
  const better = againstBlack >= againstWhite ? 'black' : 'white';
  row('text', `${better} text is the more readable on this colour`);
  if (!opaque) ctx.raw('contrast is computed for the opaque colour (alpha ignored)');
---
