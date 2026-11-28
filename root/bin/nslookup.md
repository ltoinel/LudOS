---
name: nslookup
desc: DNS lookup — e.g. nslookup toinel.com
agent: network
demo: nslookup %HOST%
seo_title: DNS lookup online — A, AAAA, MX, TXT, NS records
man: |
  # NSLOOKUP(1)

  ## NAME
  nslookup — query the DNS

  ## SYNOPSIS
  nslookup <domain> [type]

  ## DESCRIPTION
  Resolves a domain name over DNS-over-HTTPS (Google Public DNS). The
  record type defaults to A; the A, AAAA, NS, CNAME, MX and TXT types
  are recognized. Each answer shows its value and TTL.

  ## HOW IT WORKS
  Browsers cannot send raw DNS packets, so the lookup goes through
  DNS-over-HTTPS: an HTTPS request to Google Public DNS (dns.google), which
  resolves the name and returns the answer as JSON. The result is what a
  public resolver sees, not your local or corporate resolver.

  ## USE CASES
  - check where a domain points (A / AAAA) after a DNS change;
  - find the mail servers of a domain (MX) and their priorities;
  - read TXT records: SPF, DKIM, DMARC, domain-verification tokens;
  - see the authoritative name servers (NS) or a CNAME alias chain.

  ## NOTES
  The TTL tells how long resolvers may cache the answer: after changing a
  record, expect up to that many seconds before everyone sees the new value.

  ## EXAMPLES
  nslookup toinel.com
  nslookup toinel.com MX

  ## SEE ALSO
  whois, ping, checkip, geoip, httpstest
js: |
  // Real DNS is unreachable from the browser, so we resolve over DNS-over-HTTPS
  // (Google Public DNS, https://dns.google/resolve) which is CORS-enabled.
  const name = ctx.args[0];
  if (!name) {
    ctx.error('usage: nslookup <name> [type]');
    return;
  }
  const type = (ctx.args[1] || 'A').toUpperCase();

  // Numeric RR types -> readable names for the answers we print.
  const TYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 15: 'MX', 16: 'TXT', 28: 'AAAA' };

  // Runs `request(signal)` under a timeout. The signal also aborts on Ctrl+C
  // (ctx.signal); a body read made inside `request` is covered as well.
  const TIMEOUT_MS = 8000;
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

  ctx.line('Server:  dns.google (DNS-over-HTTPS)');
  ctx.line('');
  try {
    const query = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const data = await withTimeout(async (signal) => {
      const res = await fetch(`https://dns.google/resolve?${query}`, { cache: 'no-store', signal });
      return res.json();
    });
    if (data.Status !== 0 || !data.Answer || !data.Answer.length) {
      ctx.error(
        `** server can't find ${name}: ${data.Status === 3 ? 'NXDOMAIN' : 'no ' + type + ' record'}`,
      );
      return;
    }
    ctx.line(`Name:    ${name}`);
    for (const answer of data.Answer) {
      const typeName = TYPES[answer.type] || `type ${answer.type}`;
      // append() takes raw HTML, so the data is escaped and the ttl — which
      // comes from the resolver too — is forced to a number before styling.
      const ttl = Number(answer.TTL) || 0;
      ctx.append(
        `<div class="ln out">${ctx.escape(typeName.padEnd(6))}${ctx.escape(String(answer.data))}  <span class="comment">(ttl ${ttl}s)</span></div>`,
      );
    }
  } catch (e) {
    if (ctx.signal && ctx.signal.aborted) return; // Ctrl+C: stop quietly
    ctx.error(`nslookup: ${e.message || 'lookup failed'}`);
  }
---
