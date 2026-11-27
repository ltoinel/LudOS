---
name: whois
desc: domain registration lookup — e.g. whois toinel.com
seo_title: Whois domain lookup (RDAP) — registrar & expiry
man: |
  # WHOIS(1)

  ## NAME
  whois — look up a domain's registration record

  ## SYNOPSIS
  whois <domain>

  ## DESCRIPTION
  Queries a domain's RDAP record — the modern, structured successor to
  legacy WHOIS — over HTTPS via rdap.org (CORS-enabled), and prints the
  registrar, the key dates (registration, expiration, last update), the
  status flags, the name servers and the DNSSEC state.

  ## HOW IT WORKS
  RDAP (Registration Data Access Protocol) is the IETF standard that replaces
  the old text-based WHOIS with structured JSON over HTTPS. rdap.org
  redirects each query to the authoritative registry of the domain's TLD, so
  the data comes straight from the source; the command then extracts the
  useful fields.

  ## USE CASES
  - check when a domain expires, or when it was registered;
  - find the registrar to contact about a domain;
  - verify a domain's name servers or DNSSEC status after a migration;
  - spot freshly registered domains, often a phishing signal.

  ## NOTES
  Personal contact details are usually redacted (GDPR). Query the registered
  domain (example.com), not a subdomain (www.example.com). A few ccTLDs do not
  offer RDAP yet.

  ## EXAMPLES
  whois toinel.com
  whois github.com

  ## SEE ALSO
  nslookup, checkip, httpstest
js: |
  const E = ctx.escape;
  // One `Label: value` line, labels aligned in a 12-character column.
  const row = (label, value) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:12ch">${E(label)}</span><span class="comment">: </span><span class="out">${E(value)}</span></div>`,
    );

  // Normalize: drop any scheme/path, keep the bare hostname.
  const domain = (ctx.args[0] || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '');
  if (!domain) {
    ctx.error('usage: whois <domain>');
    return;
  }

  // Runs `request(signal)` under a timeout. The signal also aborts on Ctrl+C
  // (ctx.signal); a body read made inside `request` is covered as well.
  const TIMEOUT_MS = 10000;
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

  ctx.line(`Querying RDAP for ${domain}…`);
  try {
    // `null` stands for "no such domain" (HTTP 404).
    const record = await withTimeout(async (signal) => {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        cache: 'no-store',
        signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return (await res.json()) || {};
    });
    if (record === null) {
      ctx.error(`whois: no record found for ${domain}`);
      return;
    }
    ctx.line('');

    // ldhName: the domain in its ASCII "letters-digits-hyphen" form.
    row('Domain', record.ldhName || domain);

    // Registrar: the entity whose roles include "registrar"; its display name
    // lives in the vCard `fn` field.
    // RDAP servers vary: every level of the structure is checked before use.
    const entities = Array.isArray(record.entities) ? record.entities : [];
    const registrar = entities.find(
      (entity) => entity && Array.isArray(entity.roles) && entity.roles.includes('registrar'),
    );
    // A vCard is ['vcard', [field, …]], each field being [name, params, type, value].
    const vcardFields =
      registrar && Array.isArray(registrar.vcardArray) && Array.isArray(registrar.vcardArray[1])
        ? registrar.vcardArray[1]
        : [];
    const fullNameField = vcardFields.find((field) => Array.isArray(field) && field[0] === 'fn');
    const registrarName =
      fullNameField && typeof fullNameField[3] === 'string' ? fullNameField[3] : '';
    if (registrarName) row('Registrar', registrarName);

    // Standard lifecycle events (ISO dates, clamped to the day).
    const events = Array.isArray(record.events) ? record.events : [];
    const ISO_DAY_LENGTH = 10; // 'YYYY-MM-DD'
    const eventDay = (action) => {
      const event = events.find((candidate) => candidate && candidate.eventAction === action);
      return event && typeof event.eventDate === 'string'
        ? event.eventDate.slice(0, ISO_DAY_LENGTH)
        : '';
    };
    if (eventDay('registration')) row('Registered', eventDay('registration'));
    if (eventDay('expiration')) row('Expires', eventDay('expiration'));
    if (eventDay('last changed')) row('Updated', eventDay('last changed'));

    if (Array.isArray(record.status) && record.status.length) {
      row('Status', record.status.join(', '));
    }

    const nameservers = Array.isArray(record.nameservers) ? record.nameservers : [];
    const nameserverNames = nameservers.map((server) => server && server.ldhName).filter(Boolean);
    if (nameserverNames.length) row('Nameservers', nameserverNames.join(', '));

    if (record.secureDNS) {
      row('DNSSEC', record.secureDNS.delegationSigned ? 'signed' : 'unsigned');
    }
  } catch (e) {
    if (ctx.signal && ctx.signal.aborted) return; // Ctrl+C: stop quietly
    ctx.error(`whois: ${e.message || 'lookup failed'}`);
  }
---
