---
name: top
desc: live view of browser memory, workers and the LLM engine (q to quit)
seo_title: Browser task manager — memory, workers, local LLM
alias: htop
demo: top -n 1
man: |
  # TOP(1)

  ## NAME
  top — display browser resource usage in real time

  ## SYNOPSIS
  top [-d seconds] [-n iterations]

  ## DESCRIPTION
  Shows a live, refreshing view of this page's resources:

  - JavaScript heap (performance.memory: used / allocated / limit) with
    a usage bar and a sparkline of recent samples — Chromium browsers
    only; others report it as unavailable;
  - device hints (approximate RAM, CPU threads), DOM size, open
    terminal windows, page uptime;
  - the local LLM engine (loaded model, tokens) and the service worker;
  - the Web Workers started by shell commands (e.g. hashcat), with
    their state, age and message count.

  Press q or Ctrl+C to quit (the last frame stays on screen).

  ## OPTIONS
  -d <seconds>     refresh interval (default 1, min 0.25)
  -n <iterations>  stop after that many refreshes (e.g. -n 1 = snapshot)

  ## USE CASES
  - watch the memory of the page grow while a local LLM model loads;
  - check that the Web Workers started by hashcat stop after a run;
  - keep an eye on the DOM size after long sessions or many windows.

  ## NOTES
  Browsers limit what a page can measure: there is no per-process CPU or
  system-wide memory as in the Unix top.

  ## EXAMPLES
  top
  top -d 2
  top -n 1

  ## SEE ALSO
  hashcat, llm, du, uname
js: |
  const E = ctx.escape;
  // ---- options: -d <seconds between frames>, -n <number of frames> ----
  const DEFAULT_DELAY_S = 1;
  const MIN_DELAY_S = 0.25; // faster refreshes would only burn CPU
  let delay = DEFAULT_DELAY_S;
  let iterations = Infinity;
  for (let i = 0; i < ctx.args.length; i++) {
    const option = ctx.args[i];
    // Each option consumes the next argument as its value (hence the ++i).
    if (option === '-d') {
      delay = Math.max(MIN_DELAY_S, parseFloat(ctx.args[++i]) || DEFAULT_DELAY_S);
    } else if (option === '-n') {
      iterations = Math.max(1, parseInt(ctx.args[++i], 10) || 1);
    } else {
      ctx.error(`top: unknown option ${option} — see man top`);
      return;
    }
  }

  // ---- formatting helpers ----
  const BYTES_PER_MIB = 1048576;
  const formatMib = (bytes) => (bytes / BYTES_PER_MIB).toFixed(1).padStart(7) + ' MiB';

  // A duration as `5m07s` or `1h05m07s`.
  const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hoursPart = hours ? hours + 'h' : '';
    // Minutes are zero-padded only when hours come before them.
    const minutesPart = String(minutes).padStart(hours ? 2 : 1, '0') + 'm';
    const secondsPart = String(seconds).padStart(2, '0') + 's';
    return hoursPart + minutesPart + secondsPart;
  };

  // A usage gauge: `[||||      ]  42.0%`, turning amber then red as it fills.
  const GAUGE_WARNING_RATIO = 0.6;
  const GAUGE_CRITICAL_RATIO = 0.85;
  const COLOR_CRITICAL = '#ff6b6b';
  const gauge = (ratio, width = 30) => {
    const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
    let color = 'var(--green)';
    if (ratio > GAUGE_CRITICAL_RATIO) color = COLOR_CRITICAL;
    else if (ratio > GAUGE_WARNING_RATIO) color = 'var(--amber)';
    const filledPart = `<span style="color:${color}">${'|'.repeat(filled)}</span>`;
    const emptyPart = ' '.repeat(width - filled);
    const percent = (ratio * 100).toFixed(1).padStart(5);
    return `[${filledPart}${emptyPart}] ${percent}%`;
  };

  // A sparkline: each value becomes one of eight block heights, scaled
  // between the smallest and the largest value of the series.
  const SPARK_LEVELS = '▁▂▃▄▅▆▇█';
  const sparkline = (values) => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const topLevel = SPARK_LEVELS.length - 1;
    return values
      .map((value) => {
        // A flat series has no range to scale on: draw it at the lowest level.
        const level = max === min ? 0 : Math.round(((value - min) / (max - min)) * topLevel);
        return SPARK_LEVELS[level];
      })
      .join('');
  };

  const LABEL_WIDTH = 13;
  const label = (text) => `<span class="comment">${E(text.padEnd(LABEL_WIDTH))}</span>`;
  const title = (text) => `<span class="accent text-glow">${E(text)}</span>`;

  // Used-heap samples, one per frame, feeding the sparkline.
  const HEAP_HISTORY_SIZE = 40;
  const heapHistory = [];

  // Builds one frame (the HTML of the whole screen).
  const frame = () => {
    const lines = [];
    const now = new Date();
    lines.push(
      `${title('top')} <span class="comment">— ${E(now.toLocaleTimeString())} · up ${formatDuration(performance.now())} · refresh ${delay}s · q or Ctrl+C to quit</span>`,
    );
    lines.push('');

    // ---- memory (Chromium's non-standard performance.memory) ----
    lines.push(title('Memory'));
    const mem = performance.memory;
    if (mem && mem.jsHeapSizeLimit) {
      heapHistory.push(mem.usedJSHeapSize);
      if (heapHistory.length > HEAP_HISTORY_SIZE) heapHistory.shift();
      lines.push(`${label('JS heap')}${gauge(mem.usedJSHeapSize / mem.jsHeapSizeLimit)}`);
      lines.push(
        `${label('  used')}${formatMib(mem.usedJSHeapSize)}   <span class="comment">${sparkline(heapHistory)}</span>`,
      );
      lines.push(`${label('  allocated')}${formatMib(mem.totalJSHeapSize)}`);
      lines.push(`${label('  limit')}${formatMib(mem.jsHeapSizeLimit)}`);
    } else {
      lines.push(
        `${label('JS heap')}<span class="comment">unavailable (performance.memory is Chromium-only)</span>`,
      );
    }
    const ram = navigator.deviceMemory;
    lines.push(`${label('Device RAM')}${ram ? '≈ ' + ram + ' GB (approx.)' : 'unknown'}`);
    lines.push(`${label('CPU threads')}${navigator.hardwareConcurrency || 'unknown'}`);
    lines.push(`${label('DOM nodes')}${document.getElementsByTagName('*').length}`);
    lines.push(
      `${label('Windows')}${document.querySelectorAll('.ssh-win:not(.closed)').length} open`,
    );
    lines.push('');

    // ---- local LLM engine + service worker ----
    lines.push(title('Engines'));
    const llm = ctx.llm.state();
    let llmLine = '<span class="comment">idle (no model loaded)</span>';
    if (llm.loading) {
      llmLine = `loading ${E(llm.label || '')} ${Math.round(llm.progress * 100)}%`;
    } else if (llm.modelId) {
      llmLine = `${E(llm.label || llm.modelId)} · ${llm.tokensIn} in / ${llm.tokensOut} out tokens`;
    }
    lines.push(`${label('WebLLM')}${llmLine}`);
    // The service worker controlling this page, if any (offline cache).
    const serviceWorker = navigator.serviceWorker && navigator.serviceWorker.controller;
    lines.push(
      `${label('Service wkr')}${serviceWorker ? E(serviceWorker.state) : '<span class="comment">none</span>'}`,
    );
    lines.push('');

    // ---- Web Workers spawned through ctx.worker() ----
    const workers = ctx.workers();
    const running = workers.filter((worker) => worker.state === 'running').length;
    lines.push(
      `${title('Workers')} <span class="comment">${running} running, ${workers.length - running} finished</span>`,
    );
    if (!workers.length) {
      lines.push('<span class="comment">  no worker (try: hashcat -b)</span>');
    } else {
      lines.push(
        `<span class="comment">${'  ID'.padEnd(6)}${'NAME'.padEnd(16)}${'STATE'.padEnd(12)}${'AGE'.padEnd(10)}MSGS</span>`,
      );
      for (const worker of workers) {
        // A finished worker's age stops at its end time.
        const age = (worker.ended ?? performance.now()) - worker.started;
        let color = 'var(--dim)';
        if (worker.state === 'running') color = 'var(--green)';
        else if (worker.state === 'error') color = COLOR_CRITICAL;
        // Column widths match the header above (6 / 16 / 12 / 10).
        lines.push(
          String(worker.id).padStart(4).padEnd(6) +
            E(worker.name.slice(0, 15).padEnd(16)) +
            `<span style="color:${color}">${worker.state.padEnd(12)}</span>` +
            formatDuration(age).padEnd(10) +
            worker.messages,
        );
      }
    }
    return lines.join('\n');
  };

  // The first frame is part of the appended markup itself, so a pipe or a
  // redirection (which records the text at append time) captures real content
  // — `top -n 1 | grep heap` works. append() wraps the markup: keep a handle
  // on the inner, pre-formatted line to refresh it in place.
  const view = ctx.append(`<div class="ln ascii-art">${frame()}</div>`).firstElementChild;
  // Not on screen (piped, redirected, headless): nothing to refresh, and no
  // keyboard to quit with — one frame is the whole output.
  if (!view || !view.isConnected) return;
  const terminalWindow = view.closest('.ssh-win');
  // A closed window fades out (the main one stays in the DOM, hidden).
  const windowGone = () =>
    !view.isConnected || Boolean(terminalWindow && terminalWindow.classList.contains('closed'));

  // `q` quits, like the real top (Ctrl+C is handled by the shell: ctx.signal).
  // The listener sits on this terminal window, not on `document`, so a `q`
  // typed in another window or field is left alone.
  let quit = false;
  let wakeUp = () => {};
  const onKey = (e) => {
    if (e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      quit = true;
      wakeUp();
    }
  };
  const keyTarget = terminalWindow || document;
  keyTarget.addEventListener('keydown', onKey);
  // One abort listener for the whole run; it wakes whichever wait is pending.
  const onAbort = () => wakeUp();
  ctx.signal?.addEventListener('abort', onAbort);

  // Refresh until q, Ctrl+C, the window is closed or the iteration budget is
  // spent (the first frame is already painted).
  try {
    for (let framesShown = 1; framesShown < iterations; framesShown++) {
      // Wait for the next refresh; `q` and Ctrl+C cut the wait short.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay * 1000);
        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      if (quit || ctx.signal?.aborted || windowGone()) break;
      view.innerHTML = frame();
    }
  } finally {
    keyTarget.removeEventListener('keydown', onKey);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
---
