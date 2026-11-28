---
name: dig
desc: detailed DNS lookup — e.g. dig example.com MX, dig example.com +short
agent: network
demo: dig %HOST%
seo_title: dig online — DNS records with TTL (A, MX, TXT, CAA…)
man: |
  # DIG(1)

  ## NAME
  dig — DNS lookup with the full answer

  ## SYNOPSIS
  dig <name> [type] [+short]
  dig -x <address> [+short]

  ## DESCRIPTION
  Asks a public resolver for the records of a name and prints the
  answer in the style of dig: the response status (NOERROR, NXDOMAIN,
  SERVFAIL...), its flags, the question, then one line per record with
  its TTL, class and type. The authority section (typically the SOA
  record of the zone) is shown when the resolver returns one, as it
  does for a name that does not exist. The query time and the server
  close the report.

  The type defaults to A. Recognised types: A, AAAA, MX, TXT, NS, CNAME,
  SOA, CAA, SRV and PTR. ANY is not answered by public resolvers any
  more, so it is replaced by one query for each of the common types
  (A, AAAA, CNAME, MX, NS, TXT, SOA, CAA), merged into a single answer.

  The type may come before or after the name, in upper or lower case.

  ## OPTIONS
  +short         print only the record data, one per line
  -x <address>   reverse lookup: PTR record of an IPv4 or IPv6 address

  ## HOW IT WORKS
  Browsers cannot send DNS packets, so the lookup goes through
  DNS-over-HTTPS: an HTTPS request to Google Public DNS (dns.google),
  which resolves the name and answers in JSON. The result is what a
  public resolver sees, not your local or corporate one, and the query
  time includes the HTTPS round trip. The "ad" flag means the resolver
  validated the answer with DNSSEC.

  ## NOTES
  The TTL is the number of seconds resolvers may still cache the record.
  A request is abandoned after 8 seconds, or at once with Ctrl+C.

  ## EXAMPLES
  dig example.com
  dig example.com MX
  dig example.com TXT +short
  dig example.com ANY
  dig -x 8.8.8.8

  ## SEE ALSO
  nslookup, whois, ping, curl, httpstest
js: |
  // Real DNS is unreachable from a browser: the lookup goes over
  // DNS-over-HTTPS (Google Public DNS), whose JSON API is CORS-enabled.
  const RESOLVER_URL = 'https://dns.google/resolve';
  const RESOLVER_LABEL = 'dns.google (DNS-over-HTTPS)';
  const TIMEOUT_MS = 8000;
  const USAGE = 'usage: dig <name> [type] [+short] | dig -x <address>';

  // Record types that can be asked for, with their numeric code.
  const TYPE_CODES = {
    A: 1,
    NS: 2,
    CNAME: 5,
    SOA: 6,
    PTR: 12,
    MX: 15,
    TXT: 16,
    AAAA: 28,
    SRV: 33,
    CAA: 257,
  };
  // Codes that may show up in an answer without having been asked for.
  const EXTRA_TYPE_NAMES = { 39: 'DNAME', 43: 'DS', 46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY' };
  // What `ANY` stands for: public resolvers refuse the real ANY query.
  const ANY_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
  const STATUS_NAMES = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'];
  const NXDOMAIN = 3;

  const isType = (word) =>
    word.toUpperCase() === 'ANY' || Object.hasOwn(TYPE_CODES, word.toUpperCase());

  // ---- reverse lookups ---------------------------------------------------
  /** `192.0.2.1` -> `1.2.0.192.in-addr.arpa`, or '' if not an IPv4 address. */
  const ipv4ToArpa = (address) => {
    const parts = address.split('.');
    const valid =
      parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) < 256);
    return valid ? `${parts.reverse().join('.')}.in-addr.arpa` : '';
  };

  /** An IPv6 address -> its nibble-reversed `ip6.arpa` name, or '' if invalid. */
  const ipv6ToArpa = (address) => {
    const halves = address.split('::');
    if (halves.length > 2) return '';
    const leading = halves[0] ? halves[0].split(':') : [];
    const trailing = halves[1] ? halves[1].split(':') : [];
    // `::` stands for as many zero groups as needed to reach eight.
    const missing = 8 - leading.length - trailing.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return '';
    const groups = [...leading, ...new Array(missing).fill('0'), ...trailing];
    if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return '';
    const nibbles = groups.map((group) => group.padStart(4, '0')).join('');
    return `${[...nibbles].reverse().join('.')}.ip6.arpa`.toLowerCase();
  };

  const toArpa = (address) => ipv4ToArpa(address) || ipv6ToArpa(address);

  // ---- arguments ---------------------------------------------------------
  let short = false;
  let reverseAddress = '';
  const positionals = [];
  for (let index = 0; index < ctx.args.length; index++) {
    const arg = ctx.args[index];
    if (arg.toLowerCase() === '+short') {
      short = true;
    } else if (arg === '-x') {
      // -x consumes the next argument: the address to look up.
      reverseAddress = ctx.args[++index] || '';
      if (!reverseAddress) {
        ctx.error(`dig: -x needs an address — ${USAGE}`);
        return;
      }
    } else if (arg.startsWith('+') || arg.startsWith('-')) {
      ctx.error(`dig: unknown option ${arg} — ${USAGE}`);
      return;
    } else {
      positionals.push(arg);
    }
  }

  let name = '';
  let type = 'A';
  if (reverseAddress) {
    name = toArpa(reverseAddress);
    type = 'PTR';
    if (!name || positionals.length) {
      ctx.error(
        name
          ? `dig: -x takes an address only — ${USAGE}`
          : `dig: '${reverseAddress}' is not an IP address`,
      );
      return;
    }
  } else {
    if (!positionals.length || positionals.length > 2) {
      ctx.error(USAGE);
      return;
    }
    // The type may sit on either side of the name (`dig MX example.com`).
    if (positionals.length === 2) {
      const typeIndex = isType(positionals[1]) ? 1 : isType(positionals[0]) ? 0 : -1;
      if (typeIndex < 0) {
        ctx.error(
          `dig: unknown record type '${positionals[1]}' — use ${Object.keys(TYPE_CODES).join(', ')} or ANY`,
        );
        return;
      }
      type = positionals[typeIndex].toUpperCase();
      name = positionals[1 - typeIndex];
    } else {
      name = positionals[0];
    }
    // A PTR query on a plain address means its reverse name.
    if (type === 'PTR' && toArpa(name)) name = toArpa(name);
  }
  name = name.replace(/\.$/, '');
  if (!name || name.length > 253 || /[\s/?#&]/.test(name)) {
    ctx.error(`dig: '${name}' is not a valid domain name`);
    return;
  }

  // ---- transfer ----------------------------------------------------------
  // Runs `request(signal)` under a timeout. The signal also aborts on Ctrl+C
  // (ctx.signal); the body read made inside `request` is covered as well.
  const withTimeout = async (request) => {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    const timer = setTimeout(() => {
      timedOut = true;
      cancel();
    }, TIMEOUT_MS);
    if (ctx.signal && ctx.signal.aborted) cancel();
    ctx.signal?.addEventListener('abort', cancel, { once: true });
    try {
      return await request(controller.signal);
    } catch (error) {
      if (timedOut) {
        const timeout = new Error(`timed out after ${TIMEOUT_MS / 1000} s`);
        timeout.name = 'TimeoutError';
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', cancel);
    }
  };

  /** One DNS-over-HTTPS query; resolves to the resolver's JSON answer. */
  const query = (queryType, signal) => {
    const parameters = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(queryType)}`;
    return fetch(`${RESOLVER_URL}?${parameters}`, { cache: 'no-store', signal }).then((response) => {
      if (!response.ok) throw new Error(`the resolver answered HTTP ${response.status}`);
      return response.json();
    });
  };

  const queryTypes = type === 'ANY' ? ANY_TYPES : [type];
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const startedAt = clock();
  let responses = [];
  try {
    responses = await withTimeout((signal) =>
      Promise.all(queryTypes.map((queryType) => query(queryType, signal))),
    );
  } catch (error) {
    if (ctx.signal && ctx.signal.aborted) return; // Ctrl+C: stop quietly
    const reason = error && error.name === 'TypeError' ? 'network error' : error && error.message;
    ctx.error(`dig: cannot query ${RESOLVER_LABEL}: ${reason || 'lookup failed'}`);
    return;
  }
  const queryTimeMs = Math.round(clock() - startedAt);

  // ---- reading the answers -----------------------------------------------
  // Everything below comes from the network. Each field is coerced to the
  // type expected and stripped of control characters, so a hostile answer
  // can neither break the layout nor forge extra lines; ctx.raw then escapes
  // the whole report.
  const clean = (value) =>
    Array.from(String(value ?? ''))
      .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char))
      .join('');
  const typeNames = { ...EXTRA_TYPE_NAMES };
  for (const [typeName, code] of Object.entries(TYPE_CODES)) typeNames[code] = typeName;
  const typeName = (code) => typeNames[Number(code)] || `TYPE${Number(code) || 0}`;

  /** The records of one section of every response, without duplicates. */
  const collect = (section) => {
    const seen = new Set();
    const records = [];
    for (const response of responses) {
      const list = response && Array.isArray(response[section]) ? response[section] : [];
      for (const entry of list) {
        const record = {
          name: clean(entry && entry.name),
          ttl: Math.max(0, Math.floor(Number(entry && entry.TTL)) || 0),
          type: typeName(entry && entry.type),
          data: clean(entry && entry.data),
        };
        // An ANY lookup repeats a CNAME chain in each of its answers.
        const key = `${record.name}|${record.type}|${record.data}`;
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
      }
    }
    return records;
  };
  const answers = collect('Answer');
  const authority = collect('Authority');

  // One status for the whole lookup: NXDOMAIN wins, then any failure when
  // nothing was answered.
  const statusCodes = responses.map((response) => Number(response && response.Status) || 0);
  let statusCode = 0;
  if (statusCodes.includes(NXDOMAIN)) statusCode = NXDOMAIN;
  else if (!answers.length) statusCode = statusCodes.find((code) => code !== 0) || 0;
  const status = STATUS_NAMES[statusCode] || `RCODE${statusCode}`;

  // ---- +short ------------------------------------------------------------
  if (short) {
    if (answers.length) ctx.raw(answers.map((record) => record.data).join('\n'));
    // Nothing to print is not self-explanatory in a browser: name the failure.
    else if (statusCode !== 0) ctx.error(`dig: ${name}: ${status}`);
    return;
  }

  // ---- full report -------------------------------------------------------
  const first = responses[0] || {};
  const flagNames = [
    ['RD', 'rd'],
    ['RA', 'ra'],
    ['AD', 'ad'],
    ['CD', 'cd'],
    ['TC', 'tc'],
  ];
  const flags = flagNames.filter(([field]) => first[field] === true).map(([, label]) => label);
  const fqdn = `${name}.`;
  const nameWidth = Math.max(
    fqdn.length,
    ...[...answers, ...authority].map((record) => record.name.length),
  );
  const recordLine = (record) =>
    [
      record.name.padEnd(nameWidth),
      String(record.ttl).padStart(6),
      'IN',
      record.type.padEnd(6),
      record.data,
    ].join('  ');

  const report = [
    `; dig (LudOS) — ${fqdn} ${type}`,
    `;; status: ${status} · flags: ${flags.join(' ') || 'none'} · answers: ${answers.length} · authority: ${authority.length}`,
    '',
    ';; QUESTION',
    ...queryTypes.map(
      (queryType) => `;${fqdn.padEnd(nameWidth)}  ${' '.repeat(6)}  IN  ${queryType}`,
    ),
  ];
  if (answers.length) report.push('', ';; ANSWER', ...answers.map(recordLine));
  if (authority.length) report.push('', ';; AUTHORITY', ...authority.map(recordLine));
  const comment = clean(first.Comment);
  if (comment) report.push('', `;; NOTE: ${comment}`);
  report.push(
    '',
    `;; Query time: ${queryTimeMs} msec`,
    `;; SERVER: ${RESOLVER_LABEL}`,
    `;; WHEN: ${new Date().toString()}`,
  );
  ctx.raw(report.join('\n'));
---
