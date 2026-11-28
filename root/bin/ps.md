---
name: ps
desc: list the background workers started by commands
agent: read
index: false
demo: ps
man: |
  # PS(1)

  ## NAME
  ps — report the processes of this page

  ## SYNOPSIS
  ps

  ## DESCRIPTION
  A web page has no real processes: what runs in the background here
  are the Web Workers that commands start for heavy work (hashcat
  cracking a hash, grep matching a regular expression). ps lists them
  — the shell itself comes first, as PID 1 — with their state, age
  and the number of messages they sent back.

  A worker that finished stays listed for a few seconds. Use kill to
  stop one that is still running, and top for a live view.

  ## EXAMPLES
  ps
  ps | grep hashcat

  ## SEE ALSO
  kill, top
js: |
  // Worker ids start at 1 in the registry; the shell is shown as PID 1, so
  // workers are listed (and killed) under id + PID_OFFSET.
  const PID_OFFSET = 1;

  /** A duration in ms as m:ss, like the TIME column of ps. */
  const elapsed = (ms) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const now = performance.now();
  const rows = [['PID', 'STATE', 'TIME', 'MSGS', 'COMMAND']];
  // The page itself: alive since navigation started (performance.now() origin).
  rows.push(['1', 'running', elapsed(now), '-', 'ludsh']);
  for (const worker of ctx.workers()) {
    const end = worker.ended === undefined ? now : worker.ended;
    rows.push([
      String(worker.id + PID_OFFSET),
      worker.state,
      elapsed(end - worker.started),
      String(worker.messages),
      worker.name,
    ]);
  }

  // Pad each column to its widest cell; numbers right-aligned, text left-aligned.
  const RIGHT_ALIGNED = [true, false, true, true, false];
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].length)));
  for (const row of rows) {
    const cells = row.map((cell, col) =>
      RIGHT_ALIGNED[col] ? cell.padStart(widths[col]) : cell.padEnd(widths[col]),
    );
    // The last column is left-aligned: drop the padding it leaves at line end.
    ctx.raw(cells.join('  ').trimEnd());
  }
---
