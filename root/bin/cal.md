---
name: cal
desc: show a calendar — e.g. cal, cal 12 2026, cal 2026, cal -3
alias: calendar
demo: cal
seo_title: Calendar with ISO week numbers — cal
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
  date, pomodoro, todo, bc
js: |
  const E = ctx.escape;
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const WIDTH = 23; // "Wk " + 7 × "dd " minus the trailing space
  const today = new Date();
  const isToday = (y, m, d) =>
    y === today.getFullYear() && m === today.getMonth() && d === today.getDate();

  // The Date constructor and Date.UTC map the years 0–99 to 1900–1999;
  // setFullYear takes the year literally (and still normalizes an overflowing
  // month or day), so every date is built through these two helpers.
  const localDate = (y, m, d) => {
    const date = new Date(2000, 0, 1);
    date.setFullYear(y, m, d);
    return date;
  };
  const utcDate = (y, m, d) => {
    const date = new Date(Date.UTC(2000, 0, 1));
    date.setUTCFullYear(y, m, d);
    return date;
  };

  // ISO 8601 week number of a date.
  const MS_PER_DAY = 86400000;
  const isoWeek = (y, m, d) => {
    // A week belongs to the year that holds its Thursday: move to the Thursday
    // of this date's week (Monday = 1 … Sunday = 7), then count the weeks
    // since that year's January 1st.
    const thursday = utcDate(y, m, d);
    const isoWeekday = thursday.getUTCDay() || 7;
    thursday.setUTCDate(thursday.getUTCDate() + 4 - isoWeekday);
    const yearStart = utcDate(thursday.getUTCFullYear(), 0, 1);
    const dayOfYear = (thursday - yearStart) / MS_PER_DAY + 1;
    return Math.ceil(dayOfYear / 7);
  };

  const center = (text, width) => {
    const left = Math.floor((width - text.length) / 2);
    const right = width - text.length - left;
    return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, right));
  };

  // A month as an array of lines, each exactly WIDTH visible chars. Lines are
  // HTML (today is wrapped in a highlight span), padding is plain spaces.
  const month = (y, m, withYear) => {
    const title = MONTHS[m] + (withYear ? ` ${y}` : '');
    const lines = [
      `<span class="accent text-glow">${E(center(title, WIDTH))}</span>`,
      `<span class="comment">Wk Mo Tu We Th Fr Sa Su</span>`,
    ];
    // Weekday column of the 1st (Monday = 0): that many blank cells lead the month.
    const firstWeekday = (localDate(y, m, 1).getDay() + 6) % 7;
    // Day 0 of the next month is the last day of this one.
    const daysInMonth = localDate(y, m + 1, 0).getDate();
    const BLANK_CELL = '  ';
    let cells = Array(firstWeekday).fill(BLANK_CELL);
    let weekStart = 1; // day of the month that opens the week being filled
    // Emits the current week as one line, prefixed with its ISO week number.
    const flushWeek = () => {
      while (cells.length < 7) cells.push(BLANK_CELL);
      const weekNumber = String(isoWeek(y, m, weekStart)).padStart(2, ' ');
      lines.push(`<span class="comment">${weekNumber}</span> ${cells.join(' ')}`);
      cells = [];
    };
    for (let d = 1; d <= daysInMonth; d++) {
      if (cells.length === 0 && d > 1) weekStart = d;
      const dayText = String(d).padStart(2, ' ');
      cells.push(
        isToday(y, m, d)
          ? `<span style="background:var(--green);color:var(--bg);text-shadow:none">${dayText}</span>`
          : dayText,
      );
      if (cells.length === 7) flushWeek();
    }
    if (cells.length) flushWeek();
    // Title + weekday header + up to six weeks: pad shorter months so blocks
    // shown side by side keep the same height.
    const BLOCK_HEIGHT = 8;
    while (lines.length < BLOCK_HEIGHT) lines.push(' '.repeat(WIDTH));
    return lines;
  };

  // Several months side by side, separated by three spaces.
  const row = (blocks) => {
    const merged = [];
    for (let i = 0; i < blocks[0].length; i++) {
      merged.push(blocks.map((block) => block[i]).join('   '));
    }
    return merged.join('\n');
  };
  const show = (text) => ctx.append(`<div class="ln ascii-art">${text}</div>`);

  const args = ctx.args.filter((arg) => arg !== '-3');
  const three = ctx.args.includes('-3');
  const nums = args.map((arg) => parseInt(arg, 10));
  if (args.some((arg) => !/^\d+$/.test(arg)) || args.length > 2) {
    ctx.error('usage: cal [-3] [[month] year]');
    return;
  }

  if (args.length === 1) {
    // Whole year, three months per row.
    const y = nums[0];
    if (y < 1 || y > 9999) {
      ctx.error('cal: year must be between 1 and 9999');
      return;
    }
    // The year is centred over the three blocks and their two 3-space gaps.
    const yearRowWidth = WIDTH * 3 + 6;
    ctx.append(
      `<div class="ln"><span class="accent text-glow">${E(center(String(y), yearRowWidth))}</span></div>`,
    );
    for (let quarterStart = 0; quarterStart < 12; quarterStart += 3) {
      const quarter = [quarterStart, quarterStart + 1, quarterStart + 2];
      show(row(quarter.map((m) => month(y, m, false))));
    }
    return;
  }

  let y = today.getFullYear();
  let m = today.getMonth();
  if (args.length === 2) {
    [m, y] = [nums[0] - 1, nums[1]];
    if (m < 0 || m > 11) {
      ctx.error('cal: month must be between 1 and 12');
      return;
    }
    if (y < 1 || y > 9999) {
      ctx.error('cal: year must be between 1 and 9999');
      return;
    }
  }
  if (three) {
    // Previous, current and next month; localDate normalizes a month of -1 or
    // 12 into the neighbouring year.
    const monthAt = (offset) => {
      const date = localDate(y, m + offset, 1);
      return month(date.getFullYear(), date.getMonth(), true);
    };
    show(row([monthAt(-1), monthAt(0), monthAt(1)]));
  } else {
    show(month(y, m, true).join('\n'));
  }
---
