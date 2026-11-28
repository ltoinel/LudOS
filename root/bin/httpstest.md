---
name: httpstest
desc: check a host's HTTPS security grade — e.g. httpstest toinel.com
agent: no
seo_title: HTTPS security test — security headers grade
man: |
  # HTTPSTEST(1)

  ## NAME
  httpstest — check a host's HTTPS / TLS security posture

  ## SYNOPSIS
  httpstest [host]

  ## DESCRIPTION
  Assesses the HTTPS security of a host. With no argument, checks the
  current terminal host.

  Two things are measured:

  - a browser-observable check — whether the TLS handshake succeeds over
    HTTPS (a failed handshake or connection rejects the request), with the
    round-trip time;
  - a security grade from the Mozilla HTTP Observatory (A+ … F), which
    grades the HTTP security headers (HSTS, CSP, cookies, …).

  The browser sandbox cannot inspect the negotiated TLS version, cipher
  suites or certificate chain — that needs a server-side scanner. For that
  full audit, httpstest prints an SSL Labs link.

  ## USE CASES
  - check your own site's security headers after a deployment;
  - compare the HTTPS configuration of several sites;
  - get a quick grade and the link to a full server-side SSL test.

  ## NOTES
  A fresh Observatory scan can take several seconds; the grade reflects the
  HTTP headers only, not the TLS setup (use the SSL Labs link for that).

  ## EXAMPLES
  httpstest
  httpstest toinel.com
  httpstest geeek.org

  ## SEE ALSO
  httperf, whois, nslookup, ping
js: |
  const E = ctx.escape;
  // Target: the given host (any pasted URL is reduced to its hostname), or the
  // current terminal host by default.
  let host = (
    ctx.args.find((arg) => !arg.startsWith('-')) ||
    ctx.cfg.host ||
    location.hostname ||
    ''
  ).trim();
  host = host
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
  if (!host) {
    ctx.error('usage: httpstest <host>');
    return;
  }

  // One `Label: value` line. The value is trusted HTML (see `plain` for text).
  const row = (label, valueHtml) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:10ch">${E(label)}</span><span class="comment">: </span>${valueHtml}</div>`,
    );
  const plain = (value) => `<span class="out">${E(String(value))}</span>`;
  const COLOR_BAD = '#ff6b6b';

  ctx.line(`checking HTTPS for ${E(host)} …`);

  // 1) Browser-observable: does the TLS handshake succeed? `no-cors` means we
  //    cannot read the response, but a failed handshake/connection rejects.
  const HANDSHAKE_TIMEOUT_MS = 8000;
  let reachable;
  let roundTripMs = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HANDSHAKE_TIMEOUT_MS);
    if (ctx.signal) ctx.signal.addEventListener('abort', () => controller.abort()); // Ctrl+C
    const sentAt = performance.now();
    await fetch(`https://${host}/`, {
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    roundTripMs = performance.now() - sentAt;
    reachable = true;
  } catch {
    reachable = false;
  }

  // 2) Security grade via Mozilla HTTP Observatory (CORS-enabled). Grades the
  //    HTTP security headers; a live scan can take a few seconds.
  const SCAN_TIMEOUT_MS = 25000;
  let scan = null;
  let scanError = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
    if (ctx.signal) ctx.signal.addEventListener('abort', () => controller.abort()); // Ctrl+C
    const res = await fetch(
      `https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(host)}`,
      { method: 'POST', cache: 'no-store', signal: controller.signal },
    );
    clearTimeout(timer);
    // An error answer may still be JSON carrying its own message: prefer it
    // over the bare HTTP status.
    scan = await res.json().catch(() => null);
    if (scan && scan.error) scanError = String(scan.error);
    else if (!res.ok) scanError = 'HTTP ' + res.status;
  } catch (e) {
    scanError = e.name === 'AbortError' ? 'timed out' : e.message || 'request failed';
  }

  row('Host', plain(host));
  row(
    'HTTPS',
    reachable
      ? `<span class="accent text-glow">reachable</span> <span class="comment">(TLS handshake OK · ${roundTripMs.toFixed(0)} ms)</span>`
      : `<span style="color:${COLOR_BAD}">unreachable over HTTPS</span>`,
  );

  if (scan && scan.grade) {
    // Grades run from A+ to F: the letter alone picks the colour.
    const grade = String(scan.grade);
    const letter = grade[0];
    let gradeStyle = `style="color:${COLOR_BAD}"`;
    if (letter === 'A') gradeStyle = 'class="accent text-glow"';
    else if (letter === 'B' || letter === 'C') gradeStyle = 'style="color:var(--amber)"';
    row(
      'Grade',
      `<span ${gradeStyle}>${E(grade)}</span> <span class="comment">(score ${E(String(scan.score))})</span>`,
    );
    if (scan.tests_quantity != null) {
      const failed = scan.tests_failed ? ` · ${scan.tests_failed} failed` : '';
      row('Checks', plain(`${scan.tests_passed}/${scan.tests_quantity} passed${failed}`));
    }
    if (scan.scanned_at) {
      const scannedAt = new Date(scan.scanned_at).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      row('Scanned', plain(scannedAt));
    }
    if (scan.details_url) ctx.line(`→ [full header report](${scan.details_url})`);
  } else {
    ctx.error(`httpstest: security grade unavailable${scanError ? ' (' + scanError + ')' : ''}`);
  }

  ctx.line('');
  ctx.append(
    '<div class="ln comment"># the grade covers HTTP security headers (Mozilla Observatory); the browser</div>',
  );
  ctx.append(
    '<div class="ln comment"># cannot read TLS versions/ciphers. For the full TLS audit:</div>',
  );
  ctx.line(
    `→ [SSL Labs full TLS audit](https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(host)})`,
  );
---
