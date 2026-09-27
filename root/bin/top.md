---
name: top
desc: live view of browser memory, workers and the LLM engine (q to quit)
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
  let delay = 1;
  let iterations = Infinity;
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === '-d') delay = Math.max(0.25, parseFloat(ctx.args[++i]) || 1);
    else if (a === '-n') iterations = Math.max(1, parseInt(ctx.args[++i], 10) || 1);
    else { ctx.error(`top: unknown option ${a} — see man top`); return; }
  }

  const mib = (b) => (b / 1048576).toFixed(1).padStart(7) + ' MiB';
  const dur = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + 'h' : '') + String(m).padStart(h ? 2 : 1, '0') + 'm' + String(r).padStart(2, '0') + 's';
  };
  const bar = (ratio, width = 30) => {
    const f = Math.max(0, Math.min(width, Math.round(ratio * width)));
    const color = ratio > 0.85 ? '#ff6b6b' : ratio > 0.6 ? 'var(--amber)' : 'var(--green)';
    return `[<span style="color:${color}">${'|'.repeat(f)}</span>${' '.repeat(width - f)}] ${(ratio * 100).toFixed(1).padStart(5)}%`;
  };
  const SPARK = '▁▂▃▄▅▆▇█';
  const spark = (values) => {
    if (values.length < 2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    return values.map((v) => SPARK[max === min ? 0 : Math.round(((v - min) / (max - min)) * 7)]).join('');
  };
  const label = (s) => `<span class="comment">${E(s.padEnd(13))}</span>`;
  const title = (s) => `<span class="accent text-glow">${E(s)}</span>`;

  const history = [];
  // append() wraps the markup: keep a handle on the inner, pre-formatted line.
  const view = ctx.append('<div class="ln ascii-art">…</div>').firstElementChild;

  const frame = () => {
    const lines = [];
    const now = new Date();
    lines.push(`${title('top')} <span class="comment">— ${E(now.toLocaleTimeString())} · up ${dur(performance.now())} · refresh ${delay}s · q or Ctrl+C to quit</span>`);
    lines.push('');

    // ---- memory (Chromium's non-standard performance.memory) ----
    lines.push(title('Memory'));
    const mem = performance.memory;
    if (mem && mem.jsHeapSizeLimit) {
      history.push(mem.usedJSHeapSize);
      if (history.length > 40) history.shift();
      lines.push(`${label('JS heap')}${bar(mem.usedJSHeapSize / mem.jsHeapSizeLimit)}`);
      lines.push(`${label('  used')}${mib(mem.usedJSHeapSize)}   <span class="comment">${spark(history)}</span>`);
      lines.push(`${label('  allocated')}${mib(mem.totalJSHeapSize)}`);
      lines.push(`${label('  limit')}${mib(mem.jsHeapSizeLimit)}`);
    } else {
      lines.push(`${label('JS heap')}<span class="comment">unavailable (performance.memory is Chromium-only)</span>`);
    }
    const ram = navigator.deviceMemory;
    lines.push(`${label('Device RAM')}${ram ? '≈ ' + ram + ' GB (approx.)' : 'unknown'}`);
    lines.push(`${label('CPU threads')}${navigator.hardwareConcurrency || 'unknown'}`);
    lines.push(`${label('DOM nodes')}${document.getElementsByTagName('*').length}`);
    lines.push(`${label('Windows')}${document.querySelectorAll('.ssh-win:not(.closed)').length} open`);
    lines.push('');

    // ---- local LLM engine + service worker ----
    lines.push(title('Engines'));
    const llm = ctx.llm.state();
    const llmLine = llm.loading
      ? `loading ${E(llm.label || '')} ${Math.round(llm.progress * 100)}%`
      : llm.modelId
        ? `${E(llm.label || llm.modelId)} · ${llm.tokensIn} in / ${llm.tokensOut} out tokens`
        : '<span class="comment">idle (no model loaded)</span>';
    lines.push(`${label('WebLLM')}${llmLine}`);
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    lines.push(`${label('Service wkr')}${sw ? E(sw.state) : '<span class="comment">none</span>'}`);
    lines.push('');

    // ---- Web Workers spawned through ctx.worker() ----
    const workers = ctx.workers();
    const running = workers.filter((w) => w.state === 'running').length;
    lines.push(`${title('Workers')} <span class="comment">${running} running, ${workers.length - running} finished</span>`);
    if (!workers.length) {
      lines.push('<span class="comment">  no worker (try: hashcat -b)</span>');
    } else {
      lines.push(`<span class="comment">${'  ID'.padEnd(6)}${'NAME'.padEnd(16)}${'STATE'.padEnd(12)}${'AGE'.padEnd(10)}MSGS</span>`);
      for (const w of workers) {
        const age = (w.ended ?? performance.now()) - w.started;
        const color = w.state === 'running' ? 'var(--green)' : w.state === 'error' ? '#ff6b6b' : 'var(--dim)';
        lines.push(
          String(w.id).padStart(4).padEnd(6) + E(w.name.slice(0, 15).padEnd(16)) +
          `<span style="color:${color}">${w.state.padEnd(12)}</span>` + dur(age).padEnd(10) + w.messages,
        );
      }
    }
    view.innerHTML = lines.join('\n');
  };

  // `q` quits, like the real top (Ctrl+C is handled by the shell: ctx.signal).
  let quit = false;
  let wakeUp = () => {};
  const onKey = (e) => {
    if (e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      quit = true;
      wakeUp();
    }
  };
  document.addEventListener('keydown', onKey);

  // Refresh until q, Ctrl+C or the iteration budget is spent.
  try {
    for (let n = 0; n < iterations; n++) {
      frame();
      if (n + 1 >= iterations) break;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay * 1000);
        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
        ctx.signal?.addEventListener('abort', wakeUp, { once: true });
      });
      if (quit || ctx.signal?.aborted) break;
    }
  } finally {
    document.removeEventListener('keydown', onKey);
  }
---
