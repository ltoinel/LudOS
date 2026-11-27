---
name: sleep
desc: wait for a while — e.g. sleep 2, sleep 1.5m
index: false
man: |
  # SLEEP(1)

  ## NAME
  sleep — pause for a given amount of time

  ## SYNOPSIS
  sleep <number>[s|m] ...

  ## DESCRIPTION
  Waits for the given duration, then gives the prompt back. The number
  may have decimals (sleep 0.5) and an optional unit: s for seconds
  (the default) or m for minutes. Several durations are added together
  (sleep 1m 30s waits ninety seconds).

  The wait is a real one, even when reduced motion is requested: only
  animations are skipped by that setting, not time itself. Press Ctrl+C
  to wake the command up early.

  ## OPTIONS
  None. The total may not exceed 3600 seconds (one hour): a longer wait
  in a browser tab is more likely a typo than a plan.

  ## EXAMPLES
  sleep 2
  sleep 0.5
  sleep 1.5m
  sleep 1m 30s

  ## SEE ALSO
  watch, pomodoro, date
js: |
  // A tab that sleeps for hours is almost certainly a mistake: cap the wait.
  const MAX_SECONDS = 3600;
  const SECONDS_PER_UNIT = { s: 1, m: 60 };
  const USAGE = 'usage: sleep <number>[s|m] ...';

  if (!ctx.args.length) {
    ctx.error(`sleep: missing operand — ${USAGE}`);
    return;
  }

  // Several durations add up, as in the Unix command (`sleep 1m 30s`).
  let totalSeconds = 0;
  for (const arg of ctx.args) {
    const match = /^(\d+(?:\.\d+)?|\.\d+)([sm]?)$/.exec(arg);
    if (!match) {
      ctx.error(`sleep: invalid time interval '${arg}' — ${USAGE}`);
      return;
    }
    totalSeconds += parseFloat(match[1]) * SECONDS_PER_UNIT[match[2] || 's'];
  }
  if (totalSeconds > MAX_SECONDS) {
    ctx.error(`sleep: ${totalSeconds} s is too long — the maximum is ${MAX_SECONDS} s (1 hour)`);
    return;
  }
  if (ctx.signal?.aborted) return;

  // A plain timer, not ctx.sleep(): that helper resolves immediately under
  // prefers-reduced-motion, and a `sleep` that does not wait is useless.
  await new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', finish);
      resolve();
    };
    // Ctrl+C ends the wait early.
    ctx.signal?.addEventListener('abort', finish);
    timer = setTimeout(finish, totalSeconds * 1000);
  });
---
