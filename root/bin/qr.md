---
name: qr
desc: render text or a URL as a QR code — e.g. qr https://ludovic.toinel.com
demo: qr %URL%
man: |
  # QR(1)

  ## NAME
  qr — render text or a URL as a QR code

  ## SYNOPSIS
  qr [-l L|M|Q|H] <text|url>
  echo text | qr

  ## DESCRIPTION
  Encodes the given text (everything after the command) as a QR code
  and renders it inline as black-on-white blocks, with the standard
  quiet zone so it scans reliably.

  The code is generated entirely in your browser by the command's own
  encoder (byte mode, UTF-8, versions 1–40) — nothing is sent anywhere.
  Text can also be piped in.

  ## OPTIONS
  -l <level>   error correction: L (7 %), M (15 %, default), Q (25 %),
               H (30 %) — higher survives more damage but is denser

  ## HOW IT WORKS
  The text is encoded as UTF-8 bytes, then the command picks the smallest QR
  version (1 to 40) that fits, adds Reed–Solomon error-correction codewords,
  places the data in the standard zigzag pattern and applies the mask with the
  lowest penalty score, as specified by ISO/IEC 18004. The code is drawn with
  Unicode half blocks on a white card, with the quiet margin scanners need.

  ## USE CASES
  - share a URL with a phone in one scan;
  - Wi-Fi access (WIFI:T:WPA;S:name;P:password;;), contact cards, e-mail
    addresses or plain text;
  - a code that survives damage or a logo on top: use -l H.

  ## PRIVACY
  Unlike many online generators, nothing is uploaded or tracked: the code is
  computed entirely in your browser.

  ## EXAMPLES
  qr https://ludovic.toinel.com
  qr WIFI:T:WPA;S:MyNetwork;P:secret;;

  ## SEE ALSO
  open, base64
js: |
  // Self-contained: the QR encoder below is implemented here (no library).
  const args = ctx.args.slice();
  let level = 1; // L=0, M=1, Q=2, H=3 — M (15 % recovery) by default
  const li = args.indexOf('-l');
  if (li !== -1) {
    level = 'LMQH'.indexOf((args[li + 1] || '').toUpperCase());
    if (level < 0) { ctx.error('qr: -l takes L, M, Q or H'); return; }
    args.splice(li, 2);
  }
  const text = (args.join(' ') || ctx.stdin).trim();
  if (!text) {
    ctx.error('usage: qr [-l L|M|Q|H] <text|url>');
    return;
  }

  // ------------------------------------------------------------------------
  // QR Code encoder (ISO/IEC 18004) — byte mode, versions 1 to 40.
  // ------------------------------------------------------------------------

  // Error-correction codewords per block, per level (L, M, Q, H) and version
  // (index 0 is unused so that the version number is the index).
  const ECC_CODEWORDS_PER_BLOCK = [
    [
      0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
      28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
      0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
      26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ],
    [
      0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
      28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
      0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
      30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
  ];

  // Number of error-correction blocks, same layout as above.
  const ECC_BLOCK_COUNT = [
    [
      0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
      8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ],
    [
      0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
      17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ],
    [
      0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
    ],
    [
      0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
    ],
  ];

  // The 2-bit code of each level (L, M, Q, H) in the format information.
  const FORMAT_LEVEL_BITS = [1, 0, 3, 2];

  // Whether bit `index` of `value` is set.
  const getBit = (value, index) => ((value >>> index) & 1) !== 0;

  // Number of modules available for data + ECC in a version (the symbol minus
  // its finder, timing, alignment, format and version patterns).
  const rawDataModules = (version) => {
    let count = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const alignCount = Math.floor(version / 7) + 2;
      count -= (25 * alignCount - 10) * alignCount - 55;
      if (version >= 7) {
        count -= 36;
      }
    }
    return count;
  };

  // Number of 8-bit data codewords (payload capacity) of a version and level.
  const dataCodewordCount = (version, level) => {
    const total = Math.floor(rawDataModules(version) / 8);
    const ecc = ECC_CODEWORDS_PER_BLOCK[level][version] * ECC_BLOCK_COUNT[level][version];
    return total - ecc;
  };

  // --- Reed–Solomon error correction over GF(2^8), polynomial 0x11D ---

  // Product of two field elements (carry-less "Russian peasant" multiply).
  const gfMultiply = (x, y) => {
    let product = 0;
    for (let i = 7; i >= 0; i--) {
      product = (product << 1) ^ ((product >>> 7) * 0x11d);
      product ^= ((y >>> i) & 1) * x;
    }
    return product;
  };

  // Generator polynomial of the given degree (coefficients, highest first,
  // leading 1 omitted).
  const reedSolomonDivisor = (degree) => {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) {
          result[j] ^= result[j + 1];
        }
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  };

  // ECC codewords of a data block: the remainder of data ÷ divisor.
  const reedSolomonRemainder = (data, divisor) => {
    const result = divisor.map(() => 0);
    for (const byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);
      divisor.forEach((coefficient, i) => {
        result[i] ^= gfMultiply(coefficient, factor);
      });
    }
    return result;
  };

  // Encodes `bytes` at error-correction `level` (0..3 = L, M, Q, H). Returns
  // { size, version, isDark(row, col) }, or null if the data doesn't fit.
  const encodeQR = (bytes, level) => {
    // 1. Pick the smallest version whose capacity fits the data.
    const bitsNeeded = (version) => {
      const lengthBits = version < 10 ? 8 : 16;
      return 4 + lengthBits + bytes.length * 8;
    };
    let version = 1;
    while (version <= 40 && bitsNeeded(version) > dataCodewordCount(version, level) * 8) {
      version++;
    }
    if (version > 40) {
      return null; // too long for any QR version
    }

    // 2. Build the data bit stream: mode indicator, length, bytes, terminator,
    //    then pad to a whole byte and fill with the 0xEC / 0x11 pad bytes.
    const bits = [];
    const appendBits = (value, length) => {
      for (let i = length - 1; i >= 0; i--) {
        bits.push((value >>> i) & 1);
      }
    };
    appendBits(0b0100, 4); // byte mode
    appendBits(bytes.length, version < 10 ? 8 : 16);
    for (const byte of bytes) {
      appendBits(byte, 8);
    }
    const capacityBits = dataCodewordCount(version, level) * 8;
    appendBits(0, Math.min(4, capacityBits - bits.length));
    appendBits(0, (8 - (bits.length % 8)) % 8);
    let padByte = 0xec;
    while (bits.length < capacityBits) {
      appendBits(padByte, 8);
      padByte = padByte === 0xec ? 0x11 : 0xec;
    }
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      dataCodewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    }

    // 3. Split into blocks, append each block's ECC, then interleave the
    //    blocks codeword by codeword.
    const blockCount = ECC_BLOCK_COUNT[level][version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version];
    const totalCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlockCount = blockCount - (totalCodewords % blockCount);
    const shortBlockLength = Math.floor(totalCodewords / blockCount);
    const divisor = reedSolomonDivisor(eccLength);
    const blocks = [];
    let offset = 0;
    for (let i = 0; i < blockCount; i++) {
      const dataLength = shortBlockLength - eccLength + (i < shortBlockCount ? 0 : 1);
      const block = dataCodewords.slice(offset, offset + dataLength);
      offset += dataLength;
      const ecc = reedSolomonRemainder(block, divisor);
      if (i < shortBlockCount) {
        block.push(0); // placeholder so all blocks line up; skipped below
      }
      blocks.push(block.concat(ecc));
    }
    const codewords = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        const isPlaceholder = i === shortBlockLength - eccLength && j < shortBlockCount;
        if (!isPlaceholder) {
          codewords.push(block[i]);
        }
      });
    }

    // 4. Draw the function patterns on an empty matrix.
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFunctionModule = (x, y, dark) => {
      modules[y][x] = dark;
      isFunction[y][x] = true;
    };

    // Timing patterns (alternating row 6 / column 6).
    for (let i = 0; i < size; i++) {
      setFunctionModule(6, i, i % 2 === 0);
      setFunctionModule(i, 6, i % 2 === 0);
    }

    // Finder patterns (with their separators) in three corners.
    const drawFinder = (centerX, centerY) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          const x = centerX + dx;
          const y = centerY + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) {
            setFunctionModule(x, y, distance !== 2 && distance !== 4);
          }
        }
      }
    };
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    // Alignment patterns on a grid, except where they'd overlap the finders.
    if (version > 1) {
      const count = Math.floor(version / 7) + 2;
      const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
      const positions = [6];
      for (let pos = size - 7; positions.length < count; pos -= step) {
        positions.splice(1, 0, pos);
      }
      positions.forEach((x, i) => {
        positions.forEach((y, j) => {
          const nearFinder =
            (i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0);
          if (nearFinder) {
            return;
          }
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
          }
        });
      });
    }

    // Format information (level + mask, BCH-protected), drawn twice.
    const drawFormatBits = (mask) => {
      const data = (FORMAT_LEVEL_BITS[level] << 3) | mask;
      let remainder = data;
      for (let i = 0; i < 10; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
      }
      const format = ((data << 10) | remainder) ^ 0x5412;

      // Copy 1: around the top-left finder.
      for (let i = 0; i <= 5; i++) {
        setFunctionModule(8, i, getBit(format, i));
      }
      setFunctionModule(8, 7, getBit(format, 6));
      setFunctionModule(8, 8, getBit(format, 7));
      setFunctionModule(7, 8, getBit(format, 8));
      for (let i = 9; i < 15; i++) {
        setFunctionModule(14 - i, 8, getBit(format, i));
      }

      // Copy 2: split between the top-right and bottom-left finders.
      for (let i = 0; i < 8; i++) {
        setFunctionModule(size - 1 - i, 8, getBit(format, i));
      }
      for (let i = 8; i < 15; i++) {
        setFunctionModule(8, size - 15 + i, getBit(format, i));
      }
      setFunctionModule(8, size - 8, true); // the "dark module", always set
    };
    drawFormatBits(0); // reserves the area; redrawn once the mask is chosen

    // Version information (versions 7+), BCH-protected, drawn twice.
    if (version >= 7) {
      let remainder = version;
      for (let i = 0; i < 12; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
      }
      const info = (version << 12) | remainder;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunctionModule(a, b, getBit(info, i));
        setFunctionModule(b, a, getBit(info, i));
      }
    }

    // 5. Place the codewords in a two-column zigzag, from the bottom-right
    //    corner upward, skipping function modules and the timing column.
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5;
      }
      for (let vertical = 0; vertical < size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;
          if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
            modules[y][x] = getBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
            bitIndex++;
          }
        }
      }
    }

    // 6. Masking: try the eight patterns, keep the one with the lowest
    //    penalty score (rules N1–N4 of the standard).
    const MASK_PATTERNS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];

    // XOR-ing a mask twice restores the matrix, so this both applies and undoes.
    const applyMask = (mask) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!isFunction[y][x] && MASK_PATTERNS[mask](x, y)) {
            modules[y][x] = !modules[y][x];
          }
        }
      }
    };

    const penaltyScore = () => {
      let score = 0;

      // N1 (runs of 5+ same-color modules) and N3 (finder-like patterns),
      // scanned along every row, then every column.
      const scanLines = (getModule) => {
        for (let a = 0; a < size; a++) {
          let runLength = 1;
          let line = '';
          for (let b = 0; b < size; b++) {
            line += getModule(a, b) ? '1' : '0';
            if (b > 0 && getModule(a, b) === getModule(a, b - 1)) {
              runLength++;
              if (runLength === 5) {
                score += 3;
              } else if (runLength > 5) {
                score += 1;
              }
            } else {
              runLength = 1;
            }
          }
          for (const pattern of ['10111010000', '00001011101']) {
            let at = line.indexOf(pattern);
            while (at !== -1) {
              score += 40;
              at = line.indexOf(pattern, at + 1);
            }
          }
        }
      };
      scanLines((row, col) => modules[row][col]);
      scanLines((col, row) => modules[row][col]);

      // N2 (2×2 same-color blocks) and N4 (dark/light balance).
      let darkCount = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (modules[y][x]) {
            darkCount++;
          }
          if (x < size - 1 && y < size - 1) {
            const color = modules[y][x];
            const sameBlock =
              color === modules[y][x + 1] &&
              color === modules[y + 1][x] &&
              color === modules[y + 1][x + 1];
            if (sameBlock) {
              score += 3;
            }
          }
        }
      }
      const total = size * size;
      score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
      return score;
    };

    let bestMask = 0;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormatBits(mask);
      const score = penaltyScore();
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
      applyMask(mask); // undo
    }
    applyMask(bestMask);
    drawFormatBits(bestMask);

    return { size, version, isDark: (row, col) => modules[row][col] };
  };

  const qr = encodeQR([...new TextEncoder().encode(text)], level);
  if (!qr) {
    ctx.error('qr: text is too long to encode');
    return;
  }

  // Render two module-rows per text line with half-block glyphs, on a white card
  // with black ink so any scanner reads it. A 4-module quiet zone frames it.
  const n = qr.size;
  const QUIET = 4;
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
  let out = '';
  for (let r = -QUIET; r < n + QUIET; r += 2) {
    for (let c = -QUIET; c < n + QUIET; c++) {
      const top = dark(r, c);
      const bot = dark(r + 1, c);
      out += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ';
    }
    out += '\n';
  }

  ctx.append(
    `<div class="ln"><pre style="display:inline-block;margin:.4rem 0;padding:12px;` +
      `background:#fff;color:#000;line-height:1;border-radius:6px;font-family:monospace;` +
      `white-space:pre">${ctx.escape(out)}</pre></div>`,
  );
---
