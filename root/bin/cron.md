---
name: cron
desc: explain a cron expression and list its next runs — e.g. cron "*/15 9-17 * * MON-FRI"
alias: crontab
demo: cron "*/15 9-17 * * MON-FRI"
seo_title: Cron expression explained — next run times
man: |
  # CRON(1)

  ## NAME
  cron — explain a cron expression and list its next run times

  ## SYNOPSIS
  cron [-n <count>] "<minute> <hour> <day-of-month> <month> <day-of-week>"
  cron [-n <count>] @hourly | @daily | @weekly | @monthly | @yearly

  ## DESCRIPTION
  Translates a five-field cron expression into plain English, then lists the
  next five times it would run, in your local time zone. A mistake in the
  expression is reported with the name of the field at fault.

  Quotes are optional: the five fields can also be typed as five arguments.

  ## OPTIONS
  -n <count>   list <count> run times instead of 5 (1 to 50)

  ## FIELDS
  minute         0-59
  hour           0-23
  day-of-month   1-31
  month          1-12 or JAN-DEC
  day-of-week    0-7 or SUN-SAT (0 and 7 are both Sunday)

  Each field accepts:

  `*`        every value
  `5`        one value
  `1,15`     a list
  `9-17`     a range
  `*/5`      every 5th value
  `1-10/2`   every 2nd value of a range
  `5/15`     every 15th value, starting at 5

  ## SHORTCUTS
  @hourly    0 * * * *
  @daily     0 0 * * *      (also @midnight)
  @weekly    0 0 * * 0
  @monthly   0 0 1 * *
  @yearly    0 0 1 1 *      (also @annually)

  ## HOW IT WORKS
  cron is the Unix scheduler: every minute it compares the current time with
  each line of the crontab and runs the commands whose five fields all match.
  This command applies the same rules to compute upcoming dates.

  One rule surprises everybody. When both day-of-month and day-of-week are
  restricted (neither starts with a star), the job runs when either matches,
  not both: "0 0 13 * FRI" runs on every 13th and on every Friday, not only
  on Friday the 13th. When one of the two is a star, only the other counts.

  The run times use your browser's time zone, while a server usually runs
  cron in its own (often UTC) — mind the difference. A time that does not
  exist on a daylight-saving change day is skipped. Nothing is sent anywhere.

  ## USE CASES
  - check what a crontab line found in a server or a CI pipeline really does;
  - write a schedule (GitHub Actions, Kubernetes CronJob, systemd-free
    hosts) and verify its next occurrences before deploying it;
  - find out why a job ran on an unexpected day.

  ## NOTES
  Standard five-field syntax only: no seconds or year field, no Quartz
  extensions (?, L, W, #), and no @reboot, which is not a schedule.

  ## EXAMPLES
  cron "*/5 * * * *"
  cron "30 9 * * MON-FRI"
  cron "0 0 1,15 * *"
  cron -n 10 "0 8 * JAN,JUL 1"
  cron @daily

  ## SEE ALSO
  epoch, cal, date, pomodoro
js: |
  // cron — explain a five-field cron expression and compute its next runs.
  const USAGE = 'usage: cron [-n <count>] "<minute> <hour> <day-of-month> <month> <day-of-week>"';
  const MONTH_NAMES = [
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
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  /** The three-letter spelling cron accepts: JAN, MON… */
  const shortNames = (names) => names.map((name) => name.slice(0, 3).toUpperCase());

  // The five fields, in order. `noun` is how the explanation calls one value.
  const FIELDS = [
    { name: 'minute', min: 0, max: 59, noun: 'minute' },
    { name: 'hour', min: 0, max: 23, noun: 'hour' },
    { name: 'day-of-month', min: 1, max: 31, noun: 'day-of-month' },
    { name: 'month', min: 1, max: 12, noun: 'month', names: shortNames(MONTH_NAMES) },
    { name: 'day-of-week', min: 0, max: 7, noun: 'day-of-week', names: shortNames(DAY_NAMES) },
  ];
  const SHORTCUTS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  // ---- arguments ----------------------------------------------------------
  const DEFAULT_RUNS = 5;
  const MAX_RUNS = 50;
  let runCount = DEFAULT_RUNS;
  const operands = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    if (arg === '-n') {
      i++;
      runCount = /^\d+$/.test(ctx.args[i] || '') ? Number(ctx.args[i]) : 0;
      if (runCount < 1 || runCount > MAX_RUNS) {
        ctx.error(`cron: -n takes a number between 1 and ${MAX_RUNS}`);
        return;
      }
    } else {
      operands.push(arg);
    }
  }
  // Quoted as one argument or typed as five: same thing once joined.
  let expression = operands.join(' ').trim();
  if (!expression && ctx.stdin) expression = ctx.stdin.trim();
  if (!expression) {
    ctx.error(USAGE);
    return;
  }

  const shortcutUsed = expression.startsWith('@') ? expression.toLowerCase() : null;
  if (shortcutUsed) {
    if (shortcutUsed === '@reboot') {
      ctx.error('cron: @reboot runs once at startup — it has no schedule to explain');
      return;
    }
    if (!SHORTCUTS[shortcutUsed]) {
      const known = Object.keys(SHORTCUTS).join(', ');
      ctx.error(`cron: unknown shortcut "${expression}" (known: ${known})`);
      return;
    }
    expression = SHORTCUTS[shortcutUsed];
  }
  const fieldTexts = expression.split(/\s+/);
  if (fieldTexts.length !== FIELDS.length) {
    const expected = FIELDS.map((field) => field.name).join(' ');
    ctx.error(`cron: expected 5 fields (${expected}), got ${fieldTexts.length}`);
    return;
  }

  // ---- parsing ------------------------------------------------------------
  /** A number or a name (JAN, MON) as the field's numeric value. */
  const parseValue = (token, field) => {
    let value = NaN;
    if (/^\d+$/.test(token)) {
      value = Number(token);
    } else if (field.names && field.names.includes(token.toUpperCase())) {
      // Names are listed from the field's first value: JAN = 1, SUN = 0.
      value = field.names.indexOf(token.toUpperCase()) + field.min;
    }
    if (Number.isNaN(value)) {
      throw new Error(`${field.name}: "${token}" is not a valid value`);
    }
    if (value < field.min || value > field.max) {
      throw new Error(`${field.name}: ${value} is out of range (${field.min}-${field.max})`);
    }
    return value;
  };

  /**
   * Parses one field into `{ text, parts, values }`: `parts` keeps the shape
   * of each list item for the explanation, `values` is the set of matching
   * numbers. Throws an Error that names the field.
   */
  const parseField = (text, field) => {
    const isWeekday = field.name === 'day-of-week';
    const parts = [];
    const values = new Set();
    for (const item of text.split(',')) {
      if (item === '') throw new Error(`${field.name}: empty item in "${text}"`);
      const [rangeText, stepText, extra] = item.split('/');
      if (extra !== undefined) throw new Error(`${field.name}: "${item}" has more than one "/"`);
      let step = 1;
      if (stepText !== undefined) {
        if (!/^\d+$/.test(stepText) || Number(stepText) < 1) {
          throw new Error(`${field.name}: step "${stepText}" must be a positive number`);
        }
        step = Number(stepText);
      }
      const part = { any: false, single: false, from: 0, to: 0, step };
      if (rangeText === '*') {
        part.any = true;
        part.from = field.min;
        // 7 is a second spelling of Sunday: a star stops at Saturday.
        part.to = isWeekday ? 6 : field.max;
      } else if (rangeText.includes('-')) {
        const [fromText, toText, tooMany] = rangeText.split('-');
        if (tooMany !== undefined || fromText === '' || toText === '') {
          throw new Error(`${field.name}: "${rangeText}" is not a valid range`);
        }
        part.from = parseValue(fromText, field);
        part.to = parseValue(toText, field);
        if (part.from > part.to) {
          throw new Error(`${field.name}: range "${rangeText}" goes backwards`);
        }
      } else {
        part.from = parseValue(rangeText, field);
        // `5/15` means "from 5 to the end, every 15".
        part.to = stepText === undefined ? part.from : field.max;
        part.single = stepText === undefined;
      }
      for (let value = part.from; value <= part.to; value += part.step) {
        values.add(isWeekday ? value % 7 : value);
      }
      parts.push(part);
    }
    return { text, parts, values };
  };

  let minutes;
  let hours;
  let monthDays;
  let months;
  let weekDays;
  try {
    [minutes, hours, monthDays, months, weekDays] = fieldTexts.map((text, index) =>
      parseField(text, FIELDS[index]),
    );
  } catch (error) {
    ctx.error(`cron: ${error.message}`);
    return;
  }

  // ---- explanation --------------------------------------------------------
  const pad = (number) => String(number).padStart(2, '0');
  const ordinal = (number) => {
    const lastTwo = number % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${number}th`;
    return number + (['th', 'st', 'nd', 'rd'][number % 10] || 'th');
  };
  /** "a", "a and b", "a, b and c". */
  const joinList = (items) => {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  };

  /**
   * One field in words. `format` names a value (a number, "January",
   * "Monday"); `prefix` is put before plain values ("minute 5", but
   * "Monday" needs none).
   */
  const describeField = (parsed, field, format, prefix) => {
    const singles = [];
    const phrases = [];
    for (const part of parsed.parts) {
      if (part.single) {
        singles.push(format(part.from));
        continue;
      }
      const every =
        part.step > 1 ? `every ${ordinal(part.step)} ${field.noun}` : `every ${field.noun}`;
      if (part.any) phrases.push(every);
      else phrases.push(`${every} from ${format(part.from)} through ${format(part.to)}`);
    }
    if (singles.length) phrases.unshift(prefix + joinList(singles));
    return joinList(phrases);
  };

  const monthName = (value) => MONTH_NAMES[value - 1];
  const dayName = (value) => DAY_NAMES[value % 7];
  const isSingle = (parsed) => parsed.parts.length === 1 && parsed.parts[0].single;
  // Real cron looks at the first character: a field starting with a star does
  // not restrict the day, even with a step.
  const monthDayIsStar = monthDays.text.startsWith('*');
  const weekDayIsStar = weekDays.text.startsWith('*');
  const eitherDay = !monthDayIsStar && !weekDayIsStar;

  let sentence;
  if (isSingle(minutes) && isSingle(hours)) {
    sentence = `At ${pad(hours.parts[0].from)}:${pad(minutes.parts[0].from)}`;
  } else {
    sentence = `At ${describeField(minutes, FIELDS[0], String, 'minute ')}`;
    if (hours.text !== '*') {
      sentence += ` past ${describeField(hours, FIELDS[1], String, 'hour ')}`;
    }
  }
  if (monthDays.text !== '*') {
    sentence += ` on ${describeField(monthDays, FIELDS[2], String, 'day-of-month ')}`;
  }
  if (weekDays.text !== '*') {
    const weekDayPhrase = describeField(weekDays, FIELDS[4], dayName, '');
    if (monthDays.text === '*') sentence += ` on ${weekDayPhrase}`;
    else sentence += eitherDay ? ` or on ${weekDayPhrase}` : ` and on ${weekDayPhrase}`;
  }
  if (months.text !== '*') {
    sentence += ` in ${describeField(months, FIELDS[3], monthName, '')}`;
  }
  sentence += '.';

  // ---- next runs ----------------------------------------------------------
  /** Whether cron would run on that calendar day (time of day left aside). */
  const runsOn = (day) => {
    if (!months.values.has(day.getMonth() + 1)) return false;
    const monthDayMatches = monthDays.values.has(day.getDate());
    const weekDayMatches = weekDays.values.has(day.getDay());
    // Both restricted: either one is enough. Otherwise both must hold (the
    // starred one always does).
    return eitherDay ? monthDayMatches || weekDayMatches : monthDayMatches && weekDayMatches;
  };

  // Far enough to find five 29 Februaries; "31 February" is given up on.
  const SEARCH_YEARS = 40;
  const now = new Date();
  /** The next `runCount` run times after now, scanning one day at a time. */
  const nextRuns = () => {
    const runs = [];
    const sortedHours = [...hours.values].sort((a, b) => a - b);
    const sortedMinutes = [...minutes.values].sort((a, b) => a - b);
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let scanned = 0; scanned < SEARCH_YEARS * 366; scanned++) {
      if (runsOn(day)) {
        for (const hour of sortedHours) {
          for (const minute of sortedMinutes) {
            const run = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
            // A wall-clock time skipped by a daylight-saving change comes
            // back shifted: that run does not happen.
            if (run.getHours() !== hour || run.getMinutes() !== minute) continue;
            if (run.getTime() <= now.getTime()) continue;
            runs.push(run);
            if (runs.length === runCount) return runs;
          }
        }
      }
      day.setDate(day.getDate() + 1);
    }
    return runs;
  };

  /** "in 5 minutes", "in 3 days" — the largest unit that fits. */
  const fromNow = (date) => {
    const UNITS = [
      ['year', 365 * 86400],
      ['month', 30 * 86400],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
    const unit = UNITS.find(([, unitSeconds]) => seconds >= unitSeconds);
    if (!unit) return 'in less than a minute';
    const count = Math.floor(seconds / unit[1]);
    return `in ${count} ${unit[0]}${count > 1 ? 's' : ''}`;
  };

  // ---- output -------------------------------------------------------------
  if (shortcutUsed) ctx.raw(`${shortcutUsed} = ${expression}`);
  ctx.raw(sentence);
  ctx.line('');
  const runs = nextRuns();
  if (!runs.length) {
    ctx.raw(`never runs: no matching date in the next ${SEARCH_YEARS} years`);
    return;
  }
  ctx.append('<div class="ln comment">next runs (your local time)</div>');
  for (const run of runs) {
    const date = `${run.getFullYear()}-${pad(run.getMonth() + 1)}-${pad(run.getDate())}`;
    const time = `${pad(run.getHours())}:${pad(run.getMinutes())}`;
    const weekDay = DAY_NAMES[run.getDay()].slice(0, 3);
    ctx.raw(`${date} ${time}  ${weekDay}  ${fromNow(run)}`);
  }
---
