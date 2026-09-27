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
  const row = (k, v) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:8ch">${E(k)}</span><span class="comment">: </span><span class="out">${E(v)}</span></div>`,
    );
  ctx.line('Resolving your public IP…');
  try {
    // ipapi.co: IP + geolocation, CORS-enabled.
    const r = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: ctx.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.error) throw new Error(d.reason || 'API error');
    row('IP', d.ip);
    const place = [d.city, d.region].filter(Boolean).join(', ');
    if (place) row('Location', place);
    if (d.country_name) row('Country', `${d.country_name} (${d.country_code})`);
    if (d.org) row('Network', d.org);
  } catch {
    // Fallback: ipify, very reliable, returns only the IP.
    try {
      const r = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store', signal: ctx.signal });
      const d = await r.json();
      row('IP', d.ip);
    } catch {
      ctx.error('checkip: could not fetch the IP (network unavailable?)');
    }
  }
---
