---
name: xxd
desc: hex dump of a file or piped text — e.g. xxd about.md, echo hello | xxd
alias: hexdump
demo: xxd -l 96 about.md
seo_title: Hex dump online — xxd hex viewer in your browser
man: |
  # XXD(1)

  ## NAME
  xxd — make a hex dump of a file or of piped text

  ## SYNOPSIS
  xxd [-l N] [-c N] [-p] [-u] <file>
  xxd [options]             (dump piped input)

  ## DESCRIPTION
  Prints the bytes of a file in hexadecimal. Each row shows the offset of its
  first byte (8 hex digits), 16 bytes grouped by two, and the same bytes as
  text in a gutter on the right, where anything that is not printable ASCII
  appears as a dot. With no file (or `-`), xxd dumps what is piped into it —
  e.g. `echo hello | xxd`.

  Text is dumped as its UTF-8 bytes, so an accented letter takes two bytes and
  an emoji four.

  ## OPTIONS
  -l N   stop after N bytes
  -c N   N bytes per row (default 16, or 30 with -p; at most 256)
  -p     plain hex dump: only the hex digits, no offset and no gutter
  -u     use uppercase hex digits
  -      read standard input (the piped text)

  ## USE CASES
  - see the real bytes behind a text: an invisible character, a tab instead
    of spaces, a non-breaking space, a byte order mark;
  - check how a character is encoded in UTF-8: echo é | xxd;
  - get the hex form of a short string: echo hello | xxd -p.

  ## NOTES
  This xxd only dumps: there is no -r to turn a hex dump back into a file.
  Piped text is dumped with the newline that ends its last line, as a Unix
  pipe would deliver it. Nothing leaves your browser.

  ## EXAMPLES
  xxd about.md
  xxd -l 64 about.md
  echo hello | xxd
  echo "héllo ✓" | xxd -c 8
  echo hello | xxd -p

  ## SEE ALSO
  base64, md5sum, sha256sum, wc, cat
js: |
  // xxd — hex dump of a file or of piped stdin, as UTF-8 bytes.
  const USAGE = 'usage: xxd [-l N] [-c N] [-p] [-u] <file>';
  const DEFAULT_COLUMNS = 16;
  const DEFAULT_PLAIN_COLUMNS = 30; // what the Unix xxd uses for -p
  const MAX_COLUMNS = 256;
  const OFFSET_DIGITS = 8;
  const args = ctx.args;

  // ---- options ---------------------------------------------------------
  let byteLimit = null; // -l
  let columns = null; // -c (null = the default of the chosen format)
  let plain = false; // -p
  let uppercase = false; // -u
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
    if (arg === '-p' || arg === '-ps') {
      plain = true;
      continue;
    }
    if (arg === '-u') {
      uppercase = true;
      continue;
    }
    const letter = arg[1];
    if (letter !== 'l' && letter !== 'c') {
      ctx.error(`xxd: invalid option '${arg}' — ${USAGE}`);
      return;
    }
    // -l and -c take a number: glued to the flag (-l16) or the next argument.
    let value = arg.slice(2);
    if (value === '') {
      i++;
      if (i >= args.length) {
        ctx.error(`xxd: option requires an argument -- ${letter}`);
        return;
      }
      value = args[i];
    }
    if (!/^\d+$/.test(value)) {
      ctx.error(`xxd: invalid number for -${letter}: '${value}'`);
      return;
    }
    if (letter === 'l') {
      byteLimit = Number(value);
    } else {
      columns = Number(value);
      if (columns < 1 || columns > MAX_COLUMNS) {
        ctx.error(`xxd: -c must be between 1 and ${MAX_COLUMNS}`);
        return;
      }
    }
  }
  if (files.length > 1) {
    ctx.error(`xxd: extra operand '${files[1]}' — xxd dumps one file at a time`);
    return;
  }
  if (columns === null) columns = plain ? DEFAULT_PLAIN_COLUMNS : DEFAULT_COLUMNS;

  // ---- input -----------------------------------------------------------
  // Piped input may be empty (`grep nomatch file | xxd`): only ctx.piped tells
  // an empty pipe from no pipe at all. Older engines lack it: fall back on
  // "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  let text;
  if (!files.length || files[0] === '-') {
    if (!files.length && !piped) {
      ctx.error(USAGE);
      return;
    }
    // The shell joins a stage's output lines without a final line break:
    // restore the newline a real pipe carries, so that `echo hello | xxd`
    // ends with 0a as it does on Unix (and as `wc -c` counts it here).
    const stdin = ctx.stdin || '';
    text = stdin === '' || stdin.endsWith('\n') ? stdin : stdin + '\n';
  } else {
    const res = ctx.read(files[0]);
    if (res.error) {
      ctx.error(`xxd: ${files[0]}: ${res.error}`);
      return;
    }
    text = res.content;
  }

  let bytes = new TextEncoder().encode(text);
  if (byteLimit !== null) bytes = bytes.subarray(0, byteLimit);

  // ---- dump ------------------------------------------------------------
  const toHex = (byte) => {
    const digits = byte.toString(16).padStart(2, '0');
    return uppercase ? digits.toUpperCase() : digits;
  };

  /** The hex digits of a row, with a space between each group of two bytes. */
  const groupedHex = (rowBytes) => {
    let hex = '';
    rowBytes.forEach((byte, index) => {
      if (index > 0 && index % 2 === 0) hex += ' ';
      hex += toHex(byte);
    });
    return hex;
  };

  /** The text gutter: printable ASCII as is, everything else as a dot. */
  const asciiGutter = (rowBytes) => {
    let gutter = '';
    for (const byte of rowBytes) {
      const printable = byte >= 0x20 && byte <= 0x7e;
      gutter += printable ? String.fromCharCode(byte) : '.';
    }
    return gutter;
  };

  // Width of a full row's hex area: a short last row is padded to it so that
  // the gutter stays aligned.
  const hexWidth = columns * 2 + Math.ceil(columns / 2) - 1;

  const rows = [];
  for (let offset = 0; offset < bytes.length; offset += columns) {
    const rowBytes = bytes.subarray(offset, offset + columns);
    if (plain) {
      rows.push(Array.from(rowBytes, toHex).join(''));
      continue;
    }
    const address = offset.toString(16).padStart(OFFSET_DIGITS, '0');
    rows.push(`${address}: ${groupedHex(rowBytes).padEnd(hexWidth)}  ${asciiGutter(rowBytes)}`);
  }
  // One block, one line per row: that is what the next pipe stage reads.
  if (rows.length) ctx.raw(rows.join('\n'));
---
