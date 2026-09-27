---
name: pomodoro
desc: focus timer with a chime — e.g. pomodoro 25, pomodoro stop
alias: pomo
seo_title: Pomodoro timer online — focus sessions with breaks
man: |
  # POMODORO(1)

  ## NAME
  pomodoro — run a focus (Pomodoro) timer

  ## SYNOPSIS
  pomodoro [minutes] [break-minutes]
  pomodoro status | stop

  ## DESCRIPTION
  Starts a work timer (25 minutes by default) that runs in the
  background, so the terminal stays usable. A live progress line shows
  the time left, and the browser tab title counts down too.

  When the time is up, a chime plays (Web Audio API) and every shell
  window flashes. If a break length is given, a break timer then starts
  automatically and rings at its end.

  Only one timer runs at a time, shared by every shell window.

  ## OPTIONS
  status   show the running timer
  stop     cancel the running timer

  ## THE TECHNIQUE
  The Pomodoro Technique, created by Francesco Cirillo, splits work into
  focused intervals — traditionally 25 minutes — separated by short breaks of
  about 5 minutes; after four intervals, take a longer break. Short, timed
  sprints make it easier to start a task, to avoid distractions and to notice
  where the time goes.

  ## USE CASES
  - pomodoro 25 5 for the classic cycle, pomodoro 50 10 for deep work;
  - a quick reminder: pomodoro 0.5 rings in 30 seconds;
  - keep using the terminal meanwhile: the timer runs in the background, and
    the browser tab title shows the time left.

  ## EXAMPLES
  pomodoro
  pomodoro 50 10
  pomodoro 0.5
  pomodoro stop

  ## SEE ALSO
  cal, todo, kanban, date
js: |
  const E = ctx.escape;
  // One timer per page, shared by all shell windows.
  const G = globalThis;
  const active = G.__ltshPomodoro || null;
  const sub = ctx.args[0];

  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  if (sub === 'stop') {
    if (!active) { ctx.line('no timer running'); return; }
    active.cancel();
    ctx.line(`⏹ ${active.phase} timer cancelled`);
    return;
  }
  if (sub === 'status') {
    if (!active) ctx.line('no timer running');
    else ctx.line(`${active.phase === 'work' ? '🍅' : '☕'} ${active.phase}: ${fmt(active.end - Date.now())} left`);
    return;
  }

  const work = sub === undefined ? 25 : parseFloat(sub);
  const pause = ctx.args[1] === undefined ? 0 : parseFloat(ctx.args[1]);
  if (!(work > 0 && work <= 240) || !(pause >= 0 && pause <= 60)) {
    ctx.error('usage: pomodoro [minutes (≤240)] [break-minutes (≤60)] | status | stop');
    return;
  }
  if (active) { ctx.error('pomodoro: a timer is already running — pomodoro stop first'); return; }

  // Three-note chime (Web Audio): short sine blips with soft envelopes.
  const chime = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      [880, 1175, 1568].forEach((f, i) => {
        const t = ac.currentTime + i * 0.22;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      setTimeout(() => ac.close(), 1500);
    } catch { /* audio blocked — the visual flash still fires */ }
  };
  const flash = () => {
    document.querySelectorAll('.ssh-win').forEach((w) => {
      w.animate(
        [{ boxShadow: '0 0 0 0 var(--green)' }, { boxShadow: '0 0 40px 8px var(--green)' }, { boxShadow: '0 0 0 0 var(--green)' }],
        { duration: 600, iterations: 3 },
      );
    });
  };

  const baseTitle = document.title;
  const BARW = 30;
  const run = (phase, minutes, next) => {
    const total = minutes * 60000;
    const end = Date.now() + total;
    const icon = phase === 'work' ? '🍅' : '☕';
    const line = ctx.append('<div class="ln"></div>').firstElementChild;
    const paint = () => {
      const left = end - Date.now();
      const f = Math.round(Math.min(1, 1 - left / total) * BARW);
      line.innerHTML =
        `${icon} <span class="accent">${phase}</span> ` +
        `[<span style="color:var(--green)">${'█'.repeat(f)}</span>${'░'.repeat(BARW - f)}] ` +
        `<span class="accent text-glow">${fmt(left)}</span>`;
      document.title = `${icon} ${fmt(left)} — ${baseTitle}`;
    };
    paint();
    const timer = setInterval(() => {
      if (Date.now() < end) { paint(); return; }
      clearInterval(timer);
      paint();
      document.title = baseTitle;
      G.__ltshPomodoro = null;
      const msg = phase === 'work' ? `Time's up! ${minutes} min of focus done.` : 'Break over — back to work!';
      ctx.append(`<div class="ln"><span class="accent text-glow">🔔 ${E(msg)}</span></div>`);
      chime();
      flash();
      if (next) next();
    }, 1000);
    G.__ltshPomodoro = {
      phase,
      end,
      cancel() {
        clearInterval(timer);
        document.title = baseTitle;
        G.__ltshPomodoro = null;
        line.innerHTML += ' <span class="comment">(cancelled)</span>';
      },
    };
  };

  run('work', work, pause > 0 ? () => run('break', pause) : null);
  ctx.sysLine(`timer started — keep working here; "pomodoro stop" to cancel`);
---
