---
name: hashcat
desc: brute-force an MD5 hash on every CPU core — e.g. hashcat -m 0 -a 3 <md5>
agent: no
seo_title: MD5 hash cracker in your browser — multi-core
man: |
  # HASHCAT(1)

  ## NAME
  hashcat — multi-core MD5 brute-forcer

  ## SYNOPSIS
  hashcat -m 0 -a 3 <md5hash>
  hashcat -b

  ## DESCRIPTION
  A toy, in-browser take on hashcat. It recovers the plaintext behind an
  MD5 hash by brute force (hashcat mode 0, mask attack -a 3), trying every
  candidate of increasing length over a charset.

  To "use all the CPU", the search is sharded across one Web Worker per
  logical core (navigator.hardwareConcurrency): each worker hashes its own
  slice of the keyspace with a hand-rolled single-block MD5, so every thread
  runs flat out. A live status line reports the combined hash rate.

  The worker is self-contained: its code is embedded in this command and
  spawned from a Blob URL (the site CSP allows worker-src 'blob:').

  With -b it runs a benchmark instead: all cores hash for a few seconds and
  the aggregate speed is reported, with no target to crack.

  Note: the run blocks the terminal until it finds the plaintext, exhausts
  the keyspace, or hits the time limit (raise it with --timeout).

  ## OPTIONS
  -m <num>          hash mode; only 0 (MD5) is supported
  -a <num>          attack mode; only 3 (brute-force / mask) is supported
  -b, --benchmark   measure the aggregate hash rate across all cores
  --max <n>         maximum candidate length, 1..8 (default 6)
  --timeout <s>     give up after <s> seconds, 1..120 (default 30)
  --charset <set>   candidate alphabet (default: a-z and 0-9)

  ## EXAMPLES
  hashcat -m 0 -a 3 5f4dcc3b5aa765d61d8327deb882cf99
  hashcat -m 0 -a 3 900150983cd24fb0d6963f7d28e17f72 --max 4
  hashcat -b

  ## SEE ALSO
  md5sum, sha256sum, password, top
js: |
  const E = ctx.escape;
  const args = ctx.args.slice();

  // ---- option parsing (hashcat-flavoured flags) ----
  const HASH_MODE_MD5 = 0;
  const ATTACK_BRUTE_FORCE = 3;
  const DEFAULT_MAX_LENGTH = 6;
  // Candidates must fit the worker's single MD5 block layout (see workerMain).
  const LONGEST_SUPPORTED_LENGTH = 8;
  const DEFAULT_TIMEOUT_S = 30;
  const LONGEST_TIMEOUT_S = 120;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let mode = HASH_MODE_MD5;
  let attack = ATTACK_BRUTE_FORCE;
  let bench = false;
  let maxLen = DEFAULT_MAX_LENGTH;
  let timeoutS = DEFAULT_TIMEOUT_S;
  let charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    // A valued option consumes the next argument (hence the ++i).
    if (option === '-b' || option === '--benchmark') bench = true;
    else if (option === '-m') mode = parseInt(args[++i], 10);
    else if (option === '-a') attack = parseInt(args[++i], 10);
    else if (option === '--max') {
      maxLen = clamp(parseInt(args[++i], 10) || DEFAULT_MAX_LENGTH, 1, LONGEST_SUPPORTED_LENGTH);
    } else if (option === '--timeout') {
      timeoutS = clamp(parseInt(args[++i], 10) || DEFAULT_TIMEOUT_S, 1, LONGEST_TIMEOUT_S);
    } else if (option === '--charset') charset = args[++i] || charset;
    else if (!option.startsWith('-')) positional.push(option);
  }

  if (typeof Worker === 'undefined') {
    ctx.error('hashcat: Web Workers are unavailable in this browser');
    return;
  }
  if (mode !== HASH_MODE_MD5) {
    ctx.error('hashcat: only -m 0 (MD5) is supported here');
    return;
  }
  if (attack !== ATTACK_BRUTE_FORCE) {
    ctx.error('hashcat: only -a 3 (brute-force / mask) is supported here');
    return;
  }
  if (!charset.length) {
    ctx.error('hashcat: empty charset');
    return;
  }

  // Parse the target hash (crack mode) into 4 little-endian digest words.
  let target = null;
  let hashHex = '';
  if (!bench) {
    hashHex = (positional[0] || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hashHex)) {
      ctx.error('usage: hashcat -m 0 -a 3 <md5hash>   |   hashcat -b');
      return;
    }
    // The 8 hex digits at `hexOffset` are 4 bytes, least significant first:
    // comparing the digest as four signed 32-bit words is what the worker's
    // MD5 produces natively (no hex formatting per candidate).
    const digestWord = (hexOffset) => {
      const b0 = parseInt(hashHex.substr(hexOffset, 2), 16);
      const b1 = parseInt(hashHex.substr(hexOffset + 2, 2), 16);
      const b2 = parseInt(hashHex.substr(hexOffset + 4, 2), 16);
      const b3 = parseInt(hashHex.substr(hexOffset + 6, 2), 16);
      return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24) | 0;
    };
    target = [digestWord(0), digestWord(8), digestWord(16), digestWord(24)];
  }

  // One worker per logical core; the cap keeps a many-core machine reasonable.
  const MAX_WORKERS = 32;
  const FALLBACK_CORES = 4; // when the browser hides hardwareConcurrency
  const cores = clamp(navigator.hardwareConcurrency || FALLBACK_CORES, 1, MAX_WORKERS);

  // A hash rate with the largest fitting unit (H/s, kH/s, MH/s, GH/s).
  const formatSpeed = (hashesPerSecond) => {
    if (hashesPerSecond >= 1e9) return (hashesPerSecond / 1e9).toFixed(2) + ' GH/s';
    if (hashesPerSecond >= 1e6) return (hashesPerSecond / 1e6).toFixed(2) + ' MH/s';
    if (hashesPerSecond >= 1e3) return (hashesPerSecond / 1e3).toFixed(2) + ' kH/s';
    return Math.round(hashesPerSecond) + ' H/s';
  };
  const formatCount = (count) => count.toLocaleString('en-US');

  // ---- the compute unit, embedded so the whole command lives in one file ----
  // It is stringified and spawned as a Blob worker (one per core), so it must
  // stay self-contained: nothing from the enclosing scope exists in there.
  // Protocol —
  // main->worker: {init,target,charset,w,W} once, then {run,length} / {stop};
  // worker->main: {progress,n} / {found,plain} / {done,length}.
  // (`w` is the worker's index, `W` the number of workers.)
  const workerMain = () => {
    // MD5 per-round rotates and the sine-derived additive constants.
    const SHIFT = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
      14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const TWO_POW_32 = 4294967296;
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * TWO_POW_32) | 0;
    // One reusable 512-bit block: candidates are <= 8 bytes, so only M[0..2] and
    // M[14] are ever non-zero — every other word stays zero for the worker's life.
    const M = new Int32Array(16);

    let target = null; // [t0..t3] LE digest words, or null (benchmark)
    let codes = null; // charset bytes
    let charset = '';
    let workerIndex = 0; // this worker's index out of …
    let workerCount = 1; // … this many workers
    let candidateLength = 0;
    // The candidate, as an odometer: one charset index per position.
    let digits = null;
    // The keyspace is shared out on the first character: this worker only
    // tries the candidates starting with one of these charset indices.
    let ownedFirstDigits = [];
    let ownedFirstCursor = 0; // which owned first digit is being enumerated
    let stopRequested = false;

    self.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'init') {
        target = message.target;
        charset = message.charset;
        codes = new Int32Array(charset.length);
        for (let i = 0; i < charset.length; i++) codes[i] = charset.charCodeAt(i) & 0xff;
        workerIndex = message.w;
        workerCount = message.W;
      } else if (message.type === 'run') {
        startRun(message.length);
      } else if (message.type === 'stop') {
        stopRequested = true;
      }
    };

    // Own the first-position values workerIndex, workerIndex + workerCount, … ;
    // enumerate the rest for each.
    function startRun(length) {
      candidateLength = length;
      const charsetSize = codes.length;
      ownedFirstDigits = [];
      for (let digit = workerIndex; digit < charsetSize; digit += workerCount) {
        ownedFirstDigits.push(digit);
      }
      ownedFirstCursor = 0;
      digits = new Int32Array(candidateLength);
      if (ownedFirstDigits.length) digits[0] = ownedFirstDigits[0];
      stopRequested = false;
      schedule();
    }

    // Yield between chunks so a 'stop' is delivered; the core runs flat out within.
    function schedule() {
      setTimeout(step, 0);
    }

    // Hashes one chunk of candidates, then reports and reschedules itself.
    function step() {
      if (stopRequested) return;
      const charsetSize = codes.length;
      // Candidates per chunk: large enough to amortize the timer round-trip,
      // small enough for a 'stop' to land within a few milliseconds.
      const CHUNK = 120000;
      let tried = 0;
      while (tried < CHUNK) {
        if (ownedFirstCursor >= ownedFirstDigits.length) {
          // This worker's share of the keyspace is spent for this length.
          if (tried) self.postMessage({ type: 'progress', n: tried });
          self.postMessage({ type: 'done', length: candidateLength });
          return;
        }
        digits[0] = ownedFirstDigits[ownedFirstCursor];

        // --- MD5 of the current candidate (single 512-bit block) ---
        // Pack the candidate's bytes little-endian into the message words,
        // append the 0x80 padding byte, and store the bit length in M[14].
        M[0] = 0;
        M[1] = 0;
        M[2] = 0;
        for (let j = 0; j < candidateLength; j++) {
          M[j >> 2] |= codes[digits[j]] << ((j & 3) << 3);
        }
        M[candidateLength >> 2] |= 0x80 << ((candidateLength & 3) << 3);
        M[14] = candidateLength << 3;
        // a, b, c, d: the MD5 state words; f and g: the round's mixing
        // function and message-word index (the names of RFC 1321).
        let a = 0x67452301;
        let b = 0xefcdab89 | 0;
        let c = 0x98badcfe | 0;
        let d = 0x10325476;
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
        a = (a + 0x67452301) | 0;
        b = (b + (0xefcdab89 | 0)) | 0;
        c = (c + (0x98badcfe | 0)) | 0;
        d = (d + 0x10325476) | 0;
        tried++;

        if (target && a === target[0] && b === target[1] && c === target[2] && d === target[3]) {
          let plain = '';
          for (let j = 0; j < candidateLength; j++) plain += charset[digits[j]];
          if (tried) self.postMessage({ type: 'progress', n: tried });
          self.postMessage({ type: 'found', plain });
          return;
        }

        // Advance the odometer over positions 1..length-1; on overflow move
        // to the next owned first value and reset the rest.
        let position = candidateLength - 1;
        while (position >= 1) {
          if (++digits[position] < charsetSize) break;
          digits[position] = 0;
          position--;
        }
        if (position < 1) {
          ownedFirstCursor++;
          for (let j = 1; j < candidateLength; j++) digits[j] = 0;
        }
      }
      self.postMessage({ type: 'progress', n: tried });
      schedule();
    }
  };

  // Spawn one Blob worker per core from the stringified function above.
  let workers;
  let blobUrl;
  try {
    blobUrl = URL.createObjectURL(
      new Blob(['(' + workerMain.toString() + ')()'], { type: 'text/javascript' }),
    );
    // Tracked by the shell, so `top` can show them while they crack.
    workers = Array.from({ length: cores }, (_, i) => ctx.worker(blobUrl, `hashcat#${i + 1}`));
  } catch (err) {
    ctx.error('hashcat: could not start workers (' + (err.message || err.name) + ')');
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    return;
  }
  const cleanup = () => {
    workers.forEach((worker) => worker.terminate());
    URL.revokeObjectURL(blobUrl);
  };

  // ---- banner ----
  ctx.append(
    `<div class="ln"><span class="accent text-glow">hashcat</span><span class="comment"> (web edition) starting${bench ? ' in benchmark mode' : ''}…</span></div>`,
  );
  ctx.line('');
  ctx.line(`Compute.Units....: ${cores} (Web Workers, one per logical core)`);
  if (!bench) {
    ctx.line('Hash.Mode........: 0 (MD5)');
    ctx.line(`Hash.Target......: ${hashHex}`);
    ctx.line(`Charset..........: ${charset} (${charset.length})`);
    ctx.line(`Mask.............: increment, length 1..${maxLen}`);
  }
  ctx.line('');
  const statusEl = ctx.append('<div class="ln comment">initializing…</div>');

  // ---- shared run state ----
  let totalTried = 0;
  const startTime = performance.now();
  // Snapshot taken at the previous status refresh, to measure the current speed.
  let lastRefreshTime = startTime;
  let triedAtLastRefresh = 0;
  let currentLength = 0;
  let found = null; // the cracked plaintext, once a worker reports it
  let peakSpeed = 0; // hashes per second

  // Repaints the live status line; the speed is the rate since the last repaint.
  const refreshStatus = (state) => {
    const now = performance.now();
    const secondsSinceRefresh = (now - lastRefreshTime) / 1000;
    const speed =
      secondsSinceRefresh > 0 ? (totalTried - triedAtLastRefresh) / secondsSinceRefresh : 0;
    if (speed > peakSpeed) peakSpeed = speed;
    lastRefreshTime = now;
    triedAtLastRefresh = totalTried;
    const elapsed = ((now - startTime) / 1000).toFixed(1);
    statusEl.innerHTML =
      `<span class="comment">Status: </span><span class="out">${E(state)}</span>` +
      ` <span class="comment">· Speed: </span><span class="accent">${E(formatSpeed(speed))}</span>` +
      ` <span class="comment">· Tried: </span><span class="out">${E(formatCount(totalTried))}</span>` +
      ` <span class="comment">· Len: </span><span class="out">${currentLength || '-'}</span>` +
      ` <span class="comment">· ${elapsed}s</span>`;
  };
  const STATUS_REFRESH_MS = 600;
  const ticker = setInterval(() => refreshStatus(found ? 'Cracked' : 'Running'), STATUS_REFRESH_MS);

  // Run one candidate length across all workers; resolves 'found' or 'done'.
  const runLength = (length) =>
    new Promise((resolve) => {
      let finishedWorkers = 0;
      currentLength = length;
      workers.forEach((worker) => {
        worker.onmessage = (event) => {
          const message = event.data;
          if (message.type === 'progress') totalTried += message.n;
          else if (message.type === 'found') {
            found = message.plain;
            resolve('found');
          } else if (message.type === 'done') {
            // The length is exhausted once every worker has spent its share.
            if (++finishedWorkers === workers.length) resolve('done');
          }
        };
        worker.postMessage({ type: 'run', length });
      });
    });

  // Initialize every worker once (target + charset + its shard index).
  workers.forEach((worker, index) =>
    worker.postMessage({ type: 'init', target, charset, w: index, W: workers.length }),
  );

  const BENCHMARK_DURATION_S = 6;
  // With the default charset that is 36^7 ≈ 78 billion candidates: far more
  // than any browser hashes in the benchmark window.
  const BENCHMARK_LENGTH = 7;
  const timeLimitS = bench ? BENCHMARK_DURATION_S : timeoutS;
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeLimitS * 1000));

  // Benchmark hashes a huge fixed length so it never exhausts within the window;
  // cracking sweeps increasing lengths until a hit or the keyspace is spent.
  const sweepLengths = async () => {
    for (let length = 1; length <= maxLen; length++) {
      if (found) return 'found';
      if ((await runLength(length)) === 'found') return 'found';
    }
    return 'exhausted';
  };
  const runner = bench ? runLength(BENCHMARK_LENGTH) : sweepLengths();

  // Ctrl+C (ctx.signal) cancels the run too.
  const aborted = new Promise((resolve) => {
    if (!ctx.signal) return;
    if (ctx.signal.aborted) resolve('aborted');
    else ctx.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
  });
  const outcome = await Promise.race([runner, timeout, aborted]);

  // Stop every worker and tear them down (covers the timeout / abort / found paths).
  workers.forEach((worker) => worker.postMessage({ type: 'stop' }));
  clearInterval(ticker);
  // A hit wins over everything; a benchmark always ends on its time limit.
  let finalState = 'Exhausted';
  if (found) finalState = 'Cracked';
  else if (bench) finalState = 'Done';
  else if (outcome === 'aborted' || outcome === 'timeout') finalState = 'Aborted';
  refreshStatus(finalState);
  cleanup();

  // ---- final report ----
  const secs = (performance.now() - startTime) / 1000;
  const averageSpeed = formatSpeed(secs > 0 ? totalTried / secs : 0);
  ctx.line('');
  if (found !== null) {
    ctx.append(
      `<div class="ln"><span class="accent text-glow">${E(hashHex)}:${E(found)}</span></div>`,
    );
    ctx.line('');
    ctx.line('Status...........: Cracked');
  } else if (bench) {
    ctx.line(
      `Speed.#*.........: ${averageSpeed} (avg) · ${formatSpeed(peakSpeed)} (peak), across ${cores} cores`,
    );
    ctx.line('Status...........: Benchmark done');
  } else if (outcome === 'aborted') {
    ctx.line('Status...........: Aborted (Ctrl+C)');
  } else if (outcome === 'timeout') {
    ctx.line('Status...........: Aborted (timeout) — raise --timeout or shrink the keyspace');
  } else {
    ctx.line(`Status...........: Exhausted — no match for length 1..${maxLen} over the charset`);
  }
  ctx.line(
    `Time.............: ${secs.toFixed(1)}s · ${formatCount(totalTried)} candidates · avg ${averageSpeed}`,
  );
---
