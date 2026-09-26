---
name: cal
desc: show a calendar — e.g. cal, cal 12 2026, cal 2026, cal -3
alias: calendar
demo: cal
man: |
  # CAL(1)

  ## NAME
  cal — display a calendar

  ## SYNOPSIS
  cal [-3] [[month] year]

  ## DESCRIPTION
  Displays the current month as a text grid, weeks starting on Monday
  (ISO 8601), with today highlighted. Given a month and a year, shows
  that month; given a year alone, shows the whole year, three months
  per row. Week numbers (ISO) are shown on the left.

  ## OPTIONS
  -3   show the previous, current and next month side by side

  ## HOW IT WORKS
  The grid follows the ISO 8601 conventions used in Europe: weeks start on
  Monday and are numbered so that week 1 is the week containing the year's
  first Thursday. Days come from your browser's clock and time zone, so
  "today" is highlighted in your local time.

  ## USE CASES
  - check the day of the week of a date, or the week number for planning;
  - look up a whole year at a glance (cal 2026);
  - see the previous, current and next month side by side (cal -3).

  ## NOTES
  Like the Unix cal command, the output is plain text: pipe it or redirect it
  to a file, e.g. cal 2026 > year.txt.

  ## EXAMPLES
  cal
  cal 2 2028
  cal 2026
  cal -3

  ## SEE ALSO
  date, pomodoro
js: |
  const E = ctx.escape;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const WIDTH = 23; // "Wk " + 7 × "dd " minus the trailing space
  const today = new Date();
  const isToday = (y, m, d) =>
    y === today.getFullYear() && m === today.getMonth() && d === today.getDate();

  // ISO 8601 week number of a date.
  const isoWeek = (y, m, d) => {
    const t = new Date(Date.UTC(y, m, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  };

  const center = (s, w) => {
    const left = Math.floor((w - s.length) / 2);
    return ' '.repeat(Math.max(0, left)) + s + ' '.repeat(Math.max(0, w - s.length - left));
  };

  // A month as an array of lines, each exactly WIDTH visible chars. Lines are
  // HTML (today is wrapped in a highlight span), padding is plain spaces.
  const month = (y, m, withYear) => {
    const title = MONTHS[m] + (withYear ? ` ${y}` : '');
    const lines = [
      `<span class="accent text-glow">${E(center(title, WIDTH))}</span>`,
      `<span class="comment">Wk Mo Tu We Th Fr Sa Su</span>`,
    ];
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
    const days = new Date(y, m + 1, 0).getDate();
    let cells = Array(first).fill('  ');
    let weekStart = 1;
    const flush = () => {
      while (cells.length < 7) cells.push('  ');
      const wk = String(isoWeek(y, m, weekStart)).padStart(2, ' ');
      lines.push(`<span class="comment">${wk}</span> ${cells.join(' ')}`);
      cells = [];
    };
    for (let d = 1; d <= days; d++) {
      if (cells.length === 0 && d > 1) weekStart = d;
      const txt = String(d).padStart(2, ' ');
      cells.push(isToday(y, m, d)
        ? `<span style="background:var(--green);color:var(--bg);text-shadow:none">${txt}</span>`
        : txt);
      if (cells.length === 7) flush();
    }
    if (cells.length) flush();
    while (lines.length < 8) lines.push(' '.repeat(WIDTH)); // align side-by-side blocks
    return lines;
  };

  // Several months side by side, separated by three spaces.
  const row = (blocks) => {
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) out.push(blocks.map((b) => b[i]).join('   '));
    return out.join('\n');
  };
  const show = (text) => ctx.append(`<div class="ln ascii-art">${text}</div>`);

  const args = ctx.args.filter((a) => a !== '-3');
  const three = ctx.args.includes('-3');
  const nums = args.map((a) => parseInt(a, 10));
  if (args.some((a) => !/^\d+$/.test(a)) || args.length > 2) {
    ctx.error('usage: cal [-3] [[month] year]');
    return;
  }

  if (args.length === 1) {
    // Whole year, three months per row.
    const y = nums[0];
    if (y < 1 || y > 9999) { ctx.error('cal: year must be between 1 and 9999'); return; }
    ctx.append(`<div class="ln"><span class="accent text-glow">${E(center(String(y), WIDTH * 3 + 6))}</span></div>`);
    for (let q = 0; q < 12; q += 3) show(row([q, q + 1, q + 2].map((m) => month(y, m, false))));
    return;
  }

  let y = today.getFullYear();
  let m = today.getMonth();
  if (args.length === 2) {
    [m, y] = [nums[0] - 1, nums[1]];
    if (m < 0 || m > 11) { ctx.error('cal: month must be between 1 and 12'); return; }
    if (y < 1 || y > 9999) { ctx.error('cal: year must be between 1 and 9999'); return; }
  }
  if (three) {
    const at = (k) => { const d = new Date(y, m + k, 1); return month(d.getFullYear(), d.getMonth(), true); };
    show(row([at(-1), at(0), at(1)]));
  } else {
    show(month(y, m, true).join('\n'));
  }
---
