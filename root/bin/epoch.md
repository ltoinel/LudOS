---
name: epoch
desc: Unix timestamp converter — e.g. epoch, epoch 1700000000, epoch 2026-01-31T12:00:00Z
alias: timestamp
demo: epoch 1700000000
seo_title: Unix timestamp converter — epoch to date and back
man: |
  # EPOCH(1)

  ## NAME
  epoch — convert Unix timestamps to dates, and dates to timestamps

  ## SYNOPSIS
  epoch [-m]
  epoch [-s|-m] <timestamp>
  epoch <date>

  ## DESCRIPTION
  Without argument, prints the current Unix time in seconds (in milliseconds
  with -m) — a single number, ready to be piped or redirected.

  Given a timestamp, prints the moment it stands for: in UTC (ISO 8601), in
  your local time zone, and relative to now ("3 days ago", "in 2 hours").
  Seconds and milliseconds are told apart automatically.

  Given a date, prints its timestamp in seconds and in milliseconds. Any
  format your browser can read works; ISO 8601 is the safe one. `now` is
  accepted too.

  ## OPTIONS
  -s   read the number as seconds, whatever its size
  -m   read the number as milliseconds; without argument, print the current
       time in milliseconds

  ## HOW IT WORKS
  Unix time counts the seconds elapsed since 1 January 1970 at 00:00:00 UTC,
  "the epoch", leap seconds not included. It is a single number with no time
  zone, which is why logs, databases, APIs and JWT claims use it: the same
  value means the same instant everywhere.

  Many systems (JavaScript, Java, most log pipelines) count milliseconds
  instead. A number of 100 billion or more is read as milliseconds: as
  seconds it would land after the year 5138, as milliseconds it is a date
  from 1973 onward. Use -s or -m when a value falls on the wrong side.

  A date without a time zone (2026-01-31 12:00) is read in your local time
  zone; a date alone (2026-01-31) or one ending in Z is read as UTC. The
  conversion uses your browser's clock and time zone — nothing is sent.

  ## USE CASES
  - read the timestamp found in a log line, a database row or an API reply;
  - check when a JWT expires (its exp claim is in seconds);
  - get the timestamp of a date for a query or a test fixture;
  - grab the current time for a script: epoch > now.txt.

  ## EXAMPLES
  epoch
  epoch -m
  epoch 1700000000
  epoch 1700000000000
  epoch 2026-01-31T12:00:00Z
  epoch "2026-01-31 12:00"

  ## SEE ALSO
  date, cal, cron, jwt
js: |
  // epoch — Unix timestamps to dates and back, with the browser's clock.
  const USAGE = 'usage: epoch [-s|-m] [timestamp | date]';
  const pad = (number, width = 2) => String(number).padStart(width, '0');

  // ---- options ------------------------------------------------------------
  // Only the exact flags are options: `-86400` is a timestamp before 1970.
  let forcedUnit = null;
  const operands = [];
  for (const arg of ctx.args) {
    if (arg === '-s') forcedUnit = 'seconds';
    else if (arg === '-m') forcedUnit = 'milliseconds';
    else if (arg === '-h' || arg === '--help') {
      ctx.error(USAGE);
      return;
    } else if (arg !== '--') operands.push(arg);
  }

  // Piped text is read as the value to convert (`echo 1700000000 | epoch`).
  let input = operands.join(' ').trim();
  if (!input && ctx.stdin) input = ctx.stdin.trim();

  const now = Date.now();
  if (!input) {
    const current = forcedUnit === 'milliseconds' ? now : Math.floor(now / 1000);
    ctx.raw(String(current));
    return;
  }

  // ---- parsing ------------------------------------------------------------
  // As seconds, 1e11 is the year 5138; as milliseconds it is March 1973. Any
  // number at least that large is far more likely to be milliseconds.
  const MILLISECONDS_THRESHOLD = 1e11;
  // The widest range a JavaScript Date can hold: ±100 million days.
  const MAX_DATE_MS = 8.64e15;

  let milliseconds;
  let unitNote = null;
  if (/^[+-]?\d+(\.\d+)?$/.test(input)) {
    const number = Number(input);
    const detected = Math.abs(number) >= MILLISECONDS_THRESHOLD ? 'milliseconds' : 'seconds';
    const unit = forcedUnit || detected;
    milliseconds = Math.round(unit === 'seconds' ? number * 1000 : number);
    unitNote = `${unit} (${forcedUnit ? 'forced' : 'auto-detected'})`;
  } else if (/^now$/i.test(input)) {
    milliseconds = now;
  } else {
    milliseconds = Date.parse(input);
    if (Number.isNaN(milliseconds)) {
      ctx.error(`epoch: cannot read "${input}" — try 1700000000 or 2026-01-31T12:00:00Z`);
      return;
    }
  }
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > MAX_DATE_MS) {
    ctx.error('epoch: out of range (dates span ±100 million days around 1970)');
    return;
  }
  const date = new Date(milliseconds);

  // ---- formatting ---------------------------------------------------------
  /** Local wall-clock time with its UTC offset, e.g. `2026-01-31 13:00:00 +01:00`. */
  const localTime = () => {
    const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    // getTimezoneOffset is "UTC minus local", hence the inverted sign.
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes < 0 ? '-' : '+';
    const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
    const offset = `${sign}${offsetHours}:${pad(Math.abs(offsetMinutes) % 60)}`;
    let zone = '';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      // No Intl: the numeric offset is enough.
    }
    return `${day} ${time} ${offset}${zone ? ` (${zone})` : ''}`;
  };

  /** Distance from now in the largest unit that fits: "3 days ago", "in 2 hours". */
  const relativeTime = () => {
    const UNITS = [
      ['year', 365 * 86400],
      ['month', 30 * 86400],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1],
    ];
    const seconds = Math.floor(Math.abs(milliseconds - now) / 1000);
    if (seconds === 0) return 'now';
    const [unit, size] = UNITS.find(([, unitSeconds]) => seconds >= unitSeconds);
    const count = Math.floor(seconds / size);
    const amount = `${count} ${unit}${count > 1 ? 's' : ''}`;
    return milliseconds < now ? `${amount} ago` : `in ${amount}`;
  };

  const rows = [];
  if (unitNote) rows.push(['read as', unitNote]);
  rows.push(['seconds', String(Math.floor(milliseconds / 1000))]);
  rows.push(['millis', String(milliseconds)]);
  rows.push(['utc', date.toISOString()]);
  rows.push(['local', localTime()]);
  rows.push(['relative', relativeTime()]);
  for (const [label, value] of rows) ctx.raw(`${label.padEnd(10)}${value}`);
---
