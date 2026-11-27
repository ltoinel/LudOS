---
name: cmatrix
desc: digital rain fills the terminal — q or Ctrl+C to stop
alias: matrix
seo_title: Matrix digital rain in a browser terminal — cmatrix
man: |
  # CMATRIX(6)

  ## NAME
  cmatrix — digital rain in the terminal

  ## SYNOPSIS
  cmatrix [-t seconds]

  ## DESCRIPTION
  Fills the visible part of the terminal with falling columns of
  characters, in the colours of the current theme: a bright head, a
  trail that fades behind it. The rain follows the window when it is
  resized.

  It runs until q or Ctrl+C is pressed, or for the duration given with
  -t. When it stops, the rain is wiped and the prompt comes back.

  In a pipe or a redirection, and when reduced motion is requested, a
  single still frame (60 x 16 characters) is printed instead.

  ## OPTIONS
  -t <seconds>   stop by itself after that many seconds (decimals
                 allowed, at most 3600)

  ## EXAMPLES
  cmatrix
  cmatrix -t 10

  ## SEE ALSO
  sl, theme, asciiart, top
js: |
  const USAGE = 'usage: cmatrix [-t seconds]';
  const MAX_DURATION_S = 3600;

  // ---- options -----------------------------------------------------------
  let durationMs = Infinity;
  for (let index = 0; index < ctx.args.length; index++) {
    const option = ctx.args[index];
    if (option !== '-t') {
      ctx.error(`cmatrix: unknown option ${option} — ${USAGE}`);
      return;
    }
    // -t consumes the next argument as its value.
    const value = ctx.args[++index] || '';
    const seconds = /^(\d+(\.\d+)?|\.\d+)$/.test(value) ? parseFloat(value) : NaN;
    if (!(seconds > 0) || seconds > MAX_DURATION_S) {
      ctx.error(`cmatrix: -t needs a number of seconds between 0 and ${MAX_DURATION_S} — ${USAGE}`);
      return;
    }
    durationMs = seconds * 1000;
  }

  // ---- the rain ----------------------------------------------------------
  // Plain ASCII only: every glyph has the same width in any monospace font
  // (so the grid stays aligned) and none needs HTML escaping.
  const GLYPHS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ:.=*+-|/#$%@';
  const FRAME_MS = 80;
  const MIN_TRAIL = 4;
  // Cell kinds, from nothing to the bright leading glyph of a drop.
  const EMPTY = 0;
  const TAIL = 1;
  const BODY = 2;
  const HEAD = 3;
  const STYLE = {
    [TAIL]: 'color:var(--green-dim)',
    [BODY]: 'color:var(--green)',
    [HEAD]: 'color:var(--fg-bright);text-shadow:var(--glow-strong)',
  };

  const randomInt = (limit) => Math.floor(Math.random() * limit);
  const randomGlyph = () => GLYPHS[randomInt(GLYPHS.length)];

  /**
   * A drop falling down one column. `head` is the row of its leading glyph
   * (negative while it is still above the screen). A `scattered` drop may
   * start anywhere, so the very first frame is already full of rain.
   */
  const newDrop = (rows, scattered) => ({
    head: scattered ? randomInt(rows * 2) - rows : -randomInt(rows),
    speed: 0.35 + Math.random() * 0.85, // rows per frame
    length: MIN_TRAIL + randomInt(Math.max(1, rows - MIN_TRAIL)),
  });

  /** A grid of glyphs with one drop per column. */
  const createRain = (cols, rows) => {
    const glyphs = [];
    for (let row = 0; row < rows; row++) {
      glyphs.push(Array.from({ length: cols }, randomGlyph));
    }
    const drops = Array.from({ length: cols }, () => newDrop(rows, true));
    return { cols, rows, glyphs, drops };
  };

  /** Advances the rain by one frame. */
  const step = (rain) => {
    for (let col = 0; col < rain.cols; col++) {
      const drop = rain.drops[col];
      drop.head += drop.speed;
      // The whole trail has left the screen: a new drop takes the column.
      if (drop.head - drop.length > rain.rows) rain.drops[col] = newDrop(rain.rows, false);
    }
    // A few glyphs change at random, which makes the trails shimmer.
    const mutations = Math.ceil((rain.cols * rain.rows) / 25);
    for (let count = 0; count < mutations; count++) {
      rain.glyphs[randomInt(rain.rows)][randomInt(rain.cols)] = randomGlyph();
    }
  };

  /** What a cell shows: nothing, or a part of its column's drop. */
  const cellKind = (rain, row, col) => {
    const drop = rain.drops[col];
    const head = Math.floor(drop.head);
    if (row > head || row <= head - drop.length) return EMPTY;
    if (row === head) return HEAD;
    return head - row < drop.length / 2 ? BODY : TAIL;
  };

  /** The frame as plain text (a still picture). */
  const frameText = (rain) => {
    const lines = [];
    for (let row = 0; row < rain.rows; row++) {
      let line = '';
      for (let col = 0; col < rain.cols; col++) {
        line += cellKind(rain, row, col) === EMPTY ? ' ' : rain.glyphs[row][col];
      }
      lines.push(line.trimEnd());
    }
    return lines.join('\n');
  };

  /** The frame as HTML: neighbouring cells of one kind share a single span. */
  const frameHtml = (rain) => {
    const lines = [];
    for (let row = 0; row < rain.rows; row++) {
      let line = '';
      let run = '';
      let runKind = EMPTY;
      const flush = () => {
        if (run) line += runKind === EMPTY ? run : `<span style="${STYLE[runKind]}">${run}</span>`;
        run = '';
      };
      for (let col = 0; col < rain.cols; col++) {
        const kind = cellKind(rain, row, col);
        if (kind !== runKind) {
          flush();
          runKind = kind;
        }
        run += kind === EMPTY ? ' ' : rain.glyphs[row][col];
      }
      flush();
      lines.push(line);
    }
    return lines.join('\n');
  };

  // ---- still frame -------------------------------------------------------
  // A still picture first: it is all a pipe (or a reader who asked for
  // reduced motion) gets, and it gives the animation its place on the page.
  const STILL_COLS = 60;
  const STILL_ROWS = 16;
  const STILL_WARMUP_FRAMES = 30; // let the drops spread before the snapshot
  const stillRain = createRain(STILL_COLS, STILL_ROWS);
  for (let count = 0; count < STILL_WARMUP_FRAMES; count++) step(stillRain);
  const wrapper = ctx.append(
    `<div class="ln out ascii-art" style="white-space:pre;overflow:hidden">${ctx.escape(frameText(stillRain))}</div>`,
  );
  // Captured output (a pipe, a redirection) never reaches the page: stop here.
  if (!wrapper.isConnected) return;
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  // ---- sizing ------------------------------------------------------------
  const view = wrapper.firstElementChild;
  const terminalWindow = view.closest('.ssh-win');
  const scroller = view.closest('.ssh-body');
  // A closed window fades out (the main one stays in the DOM, hidden).
  const windowGone = () =>
    !view.isConnected || Boolean(terminalWindow && terminalWindow.classList.contains('closed'));

  // Measure one character cell of this terminal: the width from a run of
  // letters, the height from a block of lines.
  const PROBE_CHARS = 20;
  const PROBE_LINES = 4;
  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(PROBE_CHARS);
  view.textContent = '';
  view.appendChild(probe);
  const charWidth = probe.getBoundingClientRect().width / PROBE_CHARS;
  view.textContent = new Array(PROBE_LINES).fill('M').join('\n');
  const charHeight = view.getBoundingClientRect().height / PROBE_LINES;

  const MIN_COLS = 20;
  const MIN_ROWS = 6;
  const MAX_ROWS = 80;
  const FALLBACK_COLS = 80;
  const FALLBACK_ROWS = 20;
  const SPARE_ROWS = 2; // room for the terminal's padding around the block
  /** The grid size that fills the visible part of the terminal window. */
  const measureGrid = () => {
    const cols = charWidth > 0 ? Math.floor(view.clientWidth / charWidth) : FALLBACK_COLS;
    const visibleHeight = scroller ? scroller.clientHeight : 0;
    const rows =
      charHeight > 0 && visibleHeight > 0
        ? Math.floor(visibleHeight / charHeight) - SPARE_ROWS
        : FALLBACK_ROWS;
    return {
      cols: Math.max(MIN_COLS, cols),
      rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows)),
    };
  };

  // ---- animation ---------------------------------------------------------
  // `q` quits (Ctrl+C is handled by the shell: ctx.signal). The listener sits
  // on this terminal window, not on `document`, so a `q` typed in another
  // window or field is left alone.
  let quit = false;
  let wakeUp = () => {};
  const onKey = (event) => {
    if (event.key === 'q' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      quit = true;
      wakeUp();
    }
  };
  const keyTarget = terminalWindow || document;
  keyTarget.addEventListener('keydown', onKey);
  const onAbort = () => wakeUp();
  ctx.signal?.addEventListener('abort', onAbort);

  const startedAt = performance.now();
  let rain = null;
  try {
    while (!quit && !ctx.signal?.aborted && !windowGone()) {
      if (performance.now() - startedAt >= durationMs) break;
      // (Re)build the grid on the first frame and whenever the window is
      // resized, then keep the block in view.
      const grid = measureGrid();
      const resized = !rain || rain.cols !== grid.cols || rain.rows !== grid.rows;
      if (resized) rain = createRain(grid.cols, grid.rows);
      step(rain);
      view.innerHTML = frameHtml(rain);
      if (resized && scroller) scroller.scrollTop = scroller.scrollHeight;
      // A real timer; `q` and Ctrl+C cut the wait short.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, FRAME_MS);
        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    keyTarget.removeEventListener('keydown', onKey);
    ctx.signal?.removeEventListener('abort', onAbort);
    // The rain stops: wipe it, like a full-screen program restoring the terminal.
    wrapper.remove();
  }
---
