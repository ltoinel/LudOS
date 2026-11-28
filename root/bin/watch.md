---
name: watch
desc: re-run a command every few seconds — e.g. watch -n 5 date
agent: no
index: false
man: |
  # WATCH(1)

  ## NAME
  watch — run a command periodically and show its output in place

  ## SYNOPSIS
  watch [-n seconds] <command line>

  ## DESCRIPTION
  Runs the command line again and again, redrawing a single view in
  place instead of scrolling. A header shows the interval, the command,
  the clock and the number of runs. Errors printed by the command are
  shown in red below its output.

  The command runs headlessly and its text output is displayed: colours
  and interactive widgets are not reproduced. A run is never started
  before the previous one has finished.

  To watch a pipeline, quote it — otherwise the pipe applies to watch
  itself: watch 'ls | wc -l'.

  Press q or Ctrl+C to stop (the last view stays on screen). In a pipe
  or a redirection, the command is run once and its output passed on.

  ## OPTIONS
  -n <seconds>   time between two runs (default 2, minimum 0.5,
                 maximum 3600; decimals allowed)

  ## NOTES
  Interactive or endless commands make no sense under watch and are
  refused: watch, nano, top, cmatrix, sl, glaude, miaougpt, denree,
  boot and su (under any of their aliases).

  Network commands are really re-run at each interval: be kind to the
  services they query and pick a reasonable interval.

  ## EXAMPLES
  watch date
  watch -n 5 fortune -q
  watch -n 10 ping example.com
  watch 'ls | wc -l'

  ## SEE ALSO
  top, sleep, date, yes
js: |
  const E = ctx.escape;
  const USAGE = 'usage: watch [-n seconds] <command line>';
  const DEFAULT_INTERVAL_S = 2;
  const MIN_INTERVAL_S = 0.5; // faster would hammer the page (and remote services)
  const MAX_INTERVAL_S = 3600;
  const COLOR_ERROR = '#ff6b6b';
  // Commands that take over the terminal, wait for input or never end.
  const REFUSED = [
    'watch',
    'nano',
    'top',
    'cmatrix',
    'sl',
    'glaude',
    'miaougpt',
    'denree',
    'boot',
    'su',
  ];

  // ---- options -----------------------------------------------------------
  const words = [...ctx.args];
  let interval = DEFAULT_INTERVAL_S;
  if (words[0] && /^-n/.test(words[0])) {
    // Both `-n 5` and `-n5` are accepted.
    const option = words.shift();
    const value = option.length > 2 ? option.slice(2) : words.shift();
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(value || '')) {
      ctx.error(`watch: invalid interval '${value ?? ''}' — ${USAGE}`);
      return;
    }
    interval = Math.min(MAX_INTERVAL_S, Math.max(MIN_INTERVAL_S, parseFloat(value)));
  } else if (words[0] && words[0].startsWith('-')) {
    ctx.error(`watch: unknown option ${words[0]} — ${USAGE}`);
    return;
  }
  if (!words.length) {
    ctx.error(`watch: no command given — ${USAGE}`);
    return;
  }

  // ---- the command line to run -------------------------------------------
  // The shell removed the quotes around each argument. A single argument is
  // a whole command line (`watch 'ls | wc -l'`); several are words, re-quoted
  // when they hold characters the shell would otherwise interpret.
  const quoteWord = (word) => {
    if (word !== '' && !/[\s|>'"]/.test(word)) return word;
    // The shell has no escape character: a word holding single quotes is
    // rebuilt from single-quoted pieces joined by double-quoted quotes.
    return word
      .split("'")
      .map((piece) => `'${piece}'`)
      .join(`"'"`);
  };
  const commandLine = words.length === 1 ? words[0].trim() : words.map(quoteWord).join(' ');
  if (!commandLine) {
    ctx.error(`watch: no command given — ${USAGE}`);
    return;
  }

  /** The command name of every pipeline stage (quotes honoured, like the shell). */
  const stageHeads = (line) => {
    const heads = [];
    let head = '';
    let inHead = true; // still reading the first word of the current stage
    let quote = '';
    for (const char of line) {
      if (quote) {
        if (char === quote) quote = '';
        else if (inHead) head += char;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '|') {
        heads.push(head);
        head = '';
        inHead = true;
      } else if (/\s/.test(char)) {
        if (head) inHead = false;
      } else if (inHead) {
        head += char;
      }
    }
    heads.push(head);
    return heads.filter(Boolean);
  };

  // An alias (`htop`) is refused like the command it stands for (`top`).
  const canonicalName = (name) => {
    const known = (ctx.commands || []).find(
      (command) => command.name === name || (command.alias || []).includes(name),
    );
    return known ? known.name : name;
  };
  const refused = stageHeads(commandLine).find((head) => REFUSED.includes(canonicalName(head)));
  if (refused) {
    ctx.error(`watch: refusing to watch '${refused}' — it is interactive or never ends`);
    return;
  }

  // ---- first run ---------------------------------------------------------
  const runOnce = async () => {
    const result = await ctx.capture(commandLine);
    return {
      stdout: String((result && result.stdout) || ''),
      stderr: String((result && result.stderr) || ''),
    };
  };
  let latest = await runOnce();
  if (ctx.signal?.aborted) return;

  // The appended markup holds the plain output only, so that a pipe or a
  // redirection (which records the text at append time) gets exactly what
  // the watched command printed — the header is added once on screen.
  const wrapper = ctx.append(
    `<div class="ln out" style="white-space:pre-wrap">${E(latest.stdout)}</div>`,
  );
  const view = wrapper.firstElementChild;
  if (!view || !view.isConnected) {
    // Captured: one run is the whole output; its errors stay errors.
    for (const errorLine of latest.stderr.split('\n').filter(Boolean)) ctx.error(errorLine);
    return;
  }

  // ---- on screen: redraw in place ----------------------------------------
  let runs = 1;
  const paint = () => {
    const clock = new Date().toLocaleTimeString();
    const header =
      `<span class="accent text-glow">watch</span> ` +
      `<span class="comment">every ${interval}s:</span> ${E(commandLine)} ` +
      `<span class="comment">— ${E(clock)} · run ${runs} · q or Ctrl+C to quit</span>`;
    const errors = latest.stderr
      ? `\n<span style="color:${COLOR_ERROR}">${E(latest.stderr)}</span>`
      : '';
    view.innerHTML = `${header}\n\n${E(latest.stdout)}${errors}`;
  };
  paint();

  const terminalWindow = view.closest('.ssh-win');
  // A closed window fades out (the main one stays in the DOM, hidden).
  const windowGone = () =>
    !view.isConnected || Boolean(terminalWindow && terminalWindow.classList.contains('closed'));

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
  const stopped = () => quit || Boolean(ctx.signal?.aborted) || windowGone();

  try {
    for (;;) {
      // Wait for the next run; `q` and Ctrl+C cut the wait short.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, interval * 1000);
        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      if (stopped()) break;
      const result = await runOnce();
      // Stopped while the command was running: keep the last complete view.
      if (stopped()) break;
      latest = result;
      runs++;
      paint();
    }
  } finally {
    keyTarget.removeEventListener('keydown', onKey);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
---
