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
  // It lives on a global ({ phase, end, cancel }) so that `pomodoro status` and
  // `pomodoro stop`, typed later or in another window, find the running timer.
  const active = globalThis.__ltshPomodoro || null;
  const sub = ctx.args[0];

  // Remaining time as mm:ss (rounded up, so the last second shows 00:01).
  const formatRemaining = (ms) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  if (sub === 'stop') {
    if (!active) {
      ctx.line('no timer running');
      return;
    }
    active.cancel();
    ctx.line(`⏹ ${active.phase} timer cancelled`);
    return;
  }
  if (sub === 'status') {
    if (!active) ctx.line('no timer running');
    else
      ctx.line(
        `${active.phase === 'work' ? '🍅' : '☕'} ${active.phase}: ${formatRemaining(active.end - Date.now())} left`,
      );
    return;
  }

  const DEFAULT_WORK_MINUTES = 25;
  const MAX_WORK_MINUTES = 240;
  const MAX_BREAK_MINUTES = 60;
  const work = sub === undefined ? DEFAULT_WORK_MINUTES : parseFloat(sub);
  const pause = ctx.args[1] === undefined ? 0 : parseFloat(ctx.args[1]);
  // Written as negated ranges so that NaN (a non-numeric argument) is rejected too.
  if (!(work > 0 && work <= MAX_WORK_MINUTES) || !(pause >= 0 && pause <= MAX_BREAK_MINUTES)) {
    ctx.error('usage: pomodoro [minutes (≤240)] [break-minutes (≤60)] | status | stop');
    return;
  }
  if (active) {
    ctx.error('pomodoro: a timer is already running — pomodoro stop first');
    return;
  }

  // Three-note chime (Web Audio): short sine blips with soft envelopes.
  const chime = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const NOTES_HZ = [880, 1175, 1568]; // A5, D6, G6 — a rising arpeggio
      const NOTE_SPACING_S = 0.22;
      // An exponential ramp cannot start from or reach zero: "silence" is a
      // tiny, inaudible gain.
      const SILENCE = 0.0001;
      const PEAK_GAIN = 0.2;
      NOTES_HZ.forEach((frequency, noteIndex) => {
        const startTime = audio.currentTime + noteIndex * NOTE_SPACING_S;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        // Fast attack, half-second decay.
        gain.gain.setValueAtTime(SILENCE, startTime);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(SILENCE, startTime + 0.5);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.55);
      });
      // Release the audio device once the last note has faded.
      setTimeout(() => audio.close(), 1500);
    } catch {
      /* audio blocked — the visual flash still fires */
    }
  };
  // Pulses a glow around every terminal window, three times.
  const flash = () => {
    document.querySelectorAll('.ssh-win').forEach((terminalWindow) => {
      terminalWindow.animate(
        [
          { boxShadow: '0 0 0 0 var(--green)' },
          { boxShadow: '0 0 40px 8px var(--green)' },
          { boxShadow: '0 0 0 0 var(--green)' },
        ],
        { duration: 600, iterations: 3 },
      );
    });
  };

  const baseTitle = document.title;
  const BAR_WIDTH = 30;
  const MS_PER_MINUTE = 60000;
  // Runs one phase ('work' or 'break'), then `next` (the following phase), if any.
  const run = (phase, minutes, next) => {
    const total = minutes * MS_PER_MINUTE;
    const end = Date.now() + total;
    const icon = phase === 'work' ? '🍅' : '☕';
    const line = ctx.append('<div class="ln"></div>').firstElementChild;
    // Redraws the progress bar in place and mirrors the countdown in the tab
    // title, so it stays visible from another tab.
    const paint = () => {
      const left = end - Date.now();
      const elapsedRatio = Math.min(1, 1 - left / total);
      const filled = Math.round(elapsedRatio * BAR_WIDTH);
      line.innerHTML =
        `${icon} <span class="accent">${phase}</span> ` +
        `[<span style="color:var(--green)">${'█'.repeat(filled)}</span>${'░'.repeat(BAR_WIDTH - filled)}] ` +
        `<span class="accent text-glow">${formatRemaining(left)}</span>`;
      document.title = `${icon} ${formatRemaining(left)} — ${baseTitle}`;
    };
    paint();
    const timer = setInterval(() => {
      if (Date.now() < end) {
        paint();
        return;
      }
      clearInterval(timer);
      paint();
      document.title = baseTitle;
      globalThis.__ltshPomodoro = null;
      const notice =
        phase === 'work' ? `Time's up! ${minutes} min of focus done.` : 'Break over — back to work!';
      ctx.append(`<div class="ln"><span class="accent text-glow">🔔 ${E(notice)}</span></div>`);
      chime();
      flash();
      if (next) next();
    }, 1000);
    globalThis.__ltshPomodoro = {
      phase,
      end,
      cancel() {
        clearInterval(timer);
        document.title = baseTitle;
        globalThis.__ltshPomodoro = null;
        line.innerHTML += ' <span class="comment">(cancelled)</span>';
      },
    };
  };

  run('work', work, pause > 0 ? () => run('break', pause) : null);
  ctx.sysLine(`timer started — keep working here; "pomodoro stop" to cancel`);
---
