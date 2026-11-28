---
name: yes
desc: repeat a line until Ctrl+C — e.g. yes, yes maybe
agent: no
index: false
man: |
  # YES(1)

  ## NAME
  yes — print a line over and over

  ## SYNOPSIS
  yes [text ...]

  ## DESCRIPTION
  Prints its arguments (joined by spaces; y when there are none) again
  and again, until Ctrl+C stops it.

  On screen, the lines are produced in small batches so the page stays
  responsive, and only the last 100 lines are kept: the output cannot
  grow without bound. A counter shows how many lines were printed.

  In a pipe or a redirection this shell cannot stream: a stage runs to
  completion before the next one starts. An endless command would never
  finish, so yes then prints exactly 1000 lines and stops.

  ## OPTIONS
  None: every argument is part of the text.

  ## EXAMPLES
  yes
  yes maybe
  yes | head -3
  yes no > answers.txt

  ## SEE ALSO
  echo, head, sleep, watch
js: |
  // A pipe is not a stream here: the whole stage output is handed over at
  // once, so the piped form has to be finite.
  const PIPE_LINES = 1000;
  // On screen: how many lines stay visible, and how fast they arrive.
  const SCREEN_LINES = 100;
  const LINES_PER_TICK = 4;
  const TICK_MS = 50;

  const text = ctx.args.length ? ctx.args.join(' ') : 'y';
  const repeated = (count) => new Array(count).fill(text).join('\n');

  // The bounded block is what a pipe or a redirection records (the text of
  // the element at the time it is appended).
  const wrapper = ctx.append(
    `<div class="ln out" style="white-space:pre-wrap">${ctx.escape(repeated(PIPE_LINES))}</div>`,
  );
  // Captured output never reaches the page: the 1000 lines are the result.
  if (!wrapper.isConnected) return;

  // ---- on screen: an endless, bounded view -------------------------------
  const view = wrapper.firstElementChild;
  const counter = document.createElement('div');
  counter.className = 'ln comment';
  wrapper.appendChild(counter);
  const terminalWindow = wrapper.closest('.ssh-win');
  const scroller = wrapper.closest('.ssh-body');
  // A closed window fades out (the main one stays in the DOM, hidden).
  const windowGone = () =>
    !wrapper.isConnected || Boolean(terminalWindow && terminalWindow.classList.contains('closed'));

  let printed = 0;
  const paint = (hint) => {
    view.textContent = repeated(Math.min(printed, SCREEN_LINES));
    counter.textContent = `${printed.toLocaleString('en-US')} lines — ${hint}`;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  // One abort listener for the whole run; it wakes whichever wait is pending.
  let wakeUp = () => {};
  const onAbort = () => wakeUp();
  ctx.signal?.addEventListener('abort', onAbort);
  try {
    while (!ctx.signal?.aborted && !windowGone()) {
      printed += LINES_PER_TICK;
      paint('Ctrl+C to stop');
      // A real timer (ctx.sleep resolves immediately under reduced motion,
      // which would turn this loop into a busy one and freeze the page).
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, TICK_MS);
        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    ctx.signal?.removeEventListener('abort', onAbort);
  }
  if (!windowGone()) paint(`only the last ${SCREEN_LINES} are kept on screen`);
---
