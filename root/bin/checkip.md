---
name: checkip
desc: show your public IP address
demo: checkip
seo_title: What is my IP address? Public IP & location
man: |
  # CHECKIP(1)

  ## NAME
  checkip — show your public IP address

  ## SYNOPSIS
  checkip

  ## DESCRIPTION
  Fetches and displays your public IP address along with its
  approximate geolocation (city, country, network operator) via an
  online API. If that fails, a fallback service returns at least the IP
  address.

  ## HOW IT WORKS
  The page asks ipapi.co for the address your requests come from, together
  with its geolocation: city, region, country and the network
  operator. If that service is unreachable or rate-limited, it falls back to
  ipify, which only returns the bare address. Both are called directly from
  your browser over HTTPS.

  ## USE CASES
  - check which public IP address a VPN, proxy or mobile hotspot gives you;
  - confirm the country a website sees you in (geo-blocking, pricing);
  - grab your address quickly to allow it in a firewall or a server ACL.

  ## NOTES
  Geolocation of an IP address is approximate: it usually points to your
  provider's network hub, not to your exact location. Behind a VPN, the
  address and place shown are those of the VPN exit server.

  ## EXAMPLES
  checkip

  ## SEE ALSO
  geoip, nslookup, whois, ping, useragent, httpstest
js: |
  const E = ctx.escape;
  // One `Label: value` line, labels aligned in an 8-character column.
  const row = (label, value) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:8ch">${E(label)}</span><span class="comment">: </span><span class="out">${E(value)}</span></div>`,
    );
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
  // GET a JSON document within the timeout; a non-2xx status is an error.
  const getJson = (url) =>
    withTimeout(async (signal) => {
      const response = await fetch(url, { cache: 'no-store', signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });

  ctx.line('Resolving your public IP…');
  try {
    // ipapi.co: IP + geolocation, CORS-enabled.
    const info = await getJson('https://ipapi.co/json/');
    // ipapi.co reports its own failures (rate limit…) in a 200 answer.
    if (info.error) throw new Error(info.reason || 'API error');
    row('IP', info.ip);
    const place = [info.city, info.region].filter(Boolean).join(', ');
    if (place) row('Location', place);
    if (info.country_name) row('Country', `${info.country_name} (${info.country_code})`);
    if (info.org) row('Network', info.org);
  } catch {
    // Ctrl+C is not a network failure: stop without trying the fallback.
    if (ctx.signal && ctx.signal.aborted) return;
    // Fallback: ipify, very reliable, returns only the IP.
    try {
      const fallback = await getJson('https://api64.ipify.org?format=json');
      row('IP', fallback.ip);
    } catch {
      if (ctx.signal && ctx.signal.aborted) return;
      ctx.error('checkip: could not fetch the IP (network unavailable?)');
    }
  }
---
