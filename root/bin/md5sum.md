---
name: md5sum
desc: compute an MD5 checksum — e.g. md5 hello
alias: md5
demo: md5sum hello
seo_title: MD5 hash generator — online md5sum checksum
man: |
  # MD5SUM(1)

  ## NAME
  md5sum — compute an MD5 checksum

  ## SYNOPSIS
  md5sum <text...>

  ## DESCRIPTION
  Computes the MD5 checksum of the given text (UTF-8 encoded) and prints
  it as lowercase hex, followed by " -" (as for standard input). The Web
  Crypto API has no MD5, so it is computed in JavaScript.

  MD5 is broken for security use (collisions are cheap) — it lives here as
  a checksum and as a companion to hashcat.

  ## HOW IT WORKS
  MD5 turns any input into a fixed 128-bit fingerprint, shown as 32
  hexadecimal characters. The same text always gives the same hash, and the
  smallest change gives a completely different one. The algorithm is
  implemented in the page itself, and the text is hashed as UTF-8 bytes, so
  the result matches `echo -n "text" | md5sum` on Linux.

  ## USE CASES
  - verify a download against a published MD5 checksum;
  - detect accidental changes or duplicates in data;
  - produce test vectors for the hashcat command.

  ## SECURITY
  Do not use MD5 for passwords or signatures: collisions can be forged
  cheaply. Prefer SHA-256 (sha256sum) for anything security-related.

  ## EXAMPLES
  md5sum hello
  md5sum The quick brown fox

  ## SEE ALSO
  sha256sum, hashcat, base64
js: |
  const input = ctx.args.join(' ');
  if (!input) {
    ctx.error('usage: md5sum <text>');
    return;
  }
  // MD5 in pure JS (Web Crypto has no MD5). UTF-8 in, lowercase hex out.
  // Per-round left-rotation amounts (RFC 1321).
  const SHIFT = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  // Per-round additive constants: floor(|sin(i + 1)| * 2^32), as signed 32-bit.
  const TWO_POW_32 = 4294967296;
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * TWO_POW_32) | 0;

  const bytes = new TextEncoder().encode(input);
  const messageLength = bytes.length;
  // Pad: append 0x80, then zeros, then the 64-bit little-endian bit length —
  // up to the next multiple of 64 bytes that leaves room for those 9 bytes.
  const BLOCK_BYTES = 64;
  const total = (((messageLength + 8) >> 6) + 1) * BLOCK_BYTES;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[messageLength] = 0x80;
  const bitLen = messageLength * 8;
  buf[total - 8] = bitLen & 0xff;
  buf[total - 7] = (bitLen >>> 8) & 0xff;
  buf[total - 6] = (bitLen >>> 16) & 0xff;
  buf[total - 5] = (bitLen >>> 24) & 0xff;
  const bitLenHigh = Math.floor(messageLength / 0x20000000); // high 32 bits of the bit length
  buf[total - 4] = bitLenHigh & 0xff;
  buf[total - 3] = (bitLenHigh >>> 8) & 0xff;
  buf[total - 2] = (bitLenHigh >>> 16) & 0xff;
  buf[total - 1] = (bitLenHigh >>> 24) & 0xff;

  // Running digest (the standard initial state), as signed 32-bit words.
  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  // M: the sixteen little-endian 32-bit words of the current block.
  const M = new Int32Array(16);
  for (let blockStart = 0; blockStart < total; blockStart += BLOCK_BYTES) {
    for (let j = 0; j < 16; j++) {
      const k = blockStart + j * 4;
      M[j] = buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16) | (buf[k + 3] << 24);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    // 64 steps in four rounds of 16: each round has its own mixing function
    // `f` and its own order `g` for picking the message words.
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      f = (f + a + K[i] + M[g]) | 0;
      a = d;
      d = c;
      c = b;
      const s = SHIFT[i];
      b = (b + ((f << s) | (f >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  // The digest is the four state words, each written least significant byte first.
  const littleEndianHex = (word) =>
    [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  const hex = littleEndianHex(a0) + littleEndianHex(b0) + littleEndianHex(c0) + littleEndianHex(d0);
  ctx.append(
    `<div class="ln"><span class="accent">${hex}</span><span class="comment">  -</span></div>`,
  );
---
