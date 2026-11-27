---
name: kill
desc: stop a background worker — e.g. kill 2 (see ps)
page: false
man: |
  # KILL(1)

  ## NAME
  kill — terminate a background worker

  ## SYNOPSIS
  kill pid...

  ## DESCRIPTION
  Terminates the Web Workers listed by ps, by PID. The command that
  started a worker is not told: if it is still waiting for an answer,
  interrupt it with Ctrl+C.

  PID 1 is the shell itself and cannot be killed — close the window
  with exit instead.

  ## EXAMPLES
  kill 2
  kill 2 3 4

  ## SEE ALSO
  ps, top, exit
js: |
  // `ps` shows the shell as PID 1 and each worker as its registry id + 1.
  const PID_OFFSET = 1;

  if (!ctx.args.length) {
    ctx.error('usage: kill pid...');
    return;
  }

  for (const arg of ctx.args) {
    if (!/^\d+$/.test(arg)) {
      ctx.error(`kill: ${arg}: arguments must be process ids`);
      continue;
    }
    const pid = Number(arg);
    if (pid === 1) {
      ctx.error('kill: (1) - Operation not permitted — the shell itself; use exit');
      continue;
    }
    if (!ctx.killWorker(pid - PID_OFFSET)) ctx.error(`kill: (${pid}) - No such process`);
  }
---
