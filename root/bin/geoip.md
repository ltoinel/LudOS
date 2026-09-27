---
name: geoip
desc: locate an IP address or hostname — e.g. geoip 8.8.8.8, geoip github.com
demo: geoip 8.8.8.8
seo_title: IP geolocation lookup — country, city, ISP & ASN
man: |
  # GEOIP(1)

  ## NAME
  geoip — geolocate an IP address or a hostname

  ## SYNOPSIS
  geoip [ip | hostname]

  ## DESCRIPTION
  Prints the approximate location of an IPv4 or IPv6 address: city,
  region, country, continent, coordinates (with a map link) and time
  zone, plus the network that owns it (ISP, organization, AS number).
  A hostname is first resolved to its IP address. Without an argument,
  geoip locates your own public IP address.

  ## HOW IT WORKS
  A hostname is resolved over DNS-over-HTTPS (dns.google), A record
  first, then AAAA. The address is then looked up on ipwho.is; if that
  service is unreachable, ipapi.co is tried instead. Both are called
  directly from your browser over HTTPS. Private and reserved addresses
  (192.168.x.x, 10.x.x.x, 127.0.0.1, fe80::…) are recognized locally:
  they have no public location, so nothing is sent.

  ## USE CASES
  - find where a server is hosted, and by which provider;
  - check the country and network behind an IP address seen in a log;
  - see the time zone of a remote host before scheduling maintenance.

  ## NOTES
  IP geolocation is approximate: it usually points to the provider's
  network hub, not to a street address, and two services may disagree
  on the city. Behind a CDN (Cloudflare, Fastly…), a hostname resolves
  to the CDN's nearest edge, not to the origin server.

  ## EXAMPLES
  geoip
  geoip 8.8.8.8
  geoip 2606:4700:4700::1111
  geoip github.com

  ## SEE ALSO
  checkip, nslookup, whois, ping
js: |
  const E = ctx.escape;
  const row = (key, value) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:12ch">${E(key)}</span>` +
        `<span class="comment">: </span><span class="out">${value}</span></div>`,
    );
  const text = (value) => E(String(value));

  // Normalize the argument: drop a scheme, a path and a port, keep the host.
  const target = (ctx.args[0] || '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^\[(.*)\]$/, '$1'); // [ipv6] as written in URLs
  const isIPv4 = (value) =>
    /^(\d{1,3})(\.\d{1,3}){3}$/.test(value) && value.split('.').every((part) => Number(part) <= 255);
  const isIPv6 = (value) => value.includes(':') && /^[0-9a-f:.]+$/i.test(value);

  // Private and reserved ranges have no public location: answer locally
  // instead of sending the address to a third-party service.
  const reservedRange = (ip) => {
    if (isIPv4(ip)) {
      const [a, b] = ip.split('.').map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private network (RFC 1918)';
      if (a === 127) return 'loopback';
      if (a === 169 && b === 254) return 'link-local';
      if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT (RFC 6598)';
      if (a === 0 || a >= 224) return 'reserved / multicast';
      return '';
    }
    const lower = ip.toLowerCase();
    if (lower === '::1') return 'loopback';
    if (/^fe[89ab]/.test(lower)) return 'link-local';
    if (/^f[cd]/.test(lower)) return 'unique local address (private)';
    return '';
  };

  // Hostname → IP over DNS-over-HTTPS (A first, then AAAA).
  const resolve = async (host) => {
    for (const type of ['A', 'AAAA']) {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`,
        { cache: 'no-store', signal: ctx.signal },
      );
      const data = await response.json();
      const answer = (data.Answer || []).find((record) => record.type === (type === 'A' ? 1 : 28));
      if (answer) return answer.data;
    }
    return null;
  };

  // Both services, mapped to the same shape. An empty IP means "the caller".
  const viaIpwhois = async (ip) => {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { cache: 'no-store', signal: ctx.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const d = await response.json();
    if (!d.success) throw new Error(d.message || 'lookup failed');
    const connection = d.connection || {};
    return {
      source: 'ipwho.is',
      ip: d.ip,
      type: d.type,
      city: d.city,
      region: d.region,
      postal: d.postal,
      country: d.country,
      countryCode: d.country_code,
      flag: d.flag && d.flag.emoji,
      continent: d.continent,
      latitude: d.latitude,
      longitude: d.longitude,
      timezone: d.timezone && d.timezone.id ? `${d.timezone.id} (UTC${d.timezone.utc})` : '',
      isp: connection.isp,
      org: connection.org,
      asn: connection.asn ? `AS${connection.asn}` : '',
      domain: connection.domain,
    };
  };
  const viaIpapi = async (ip) => {
    const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/';
    const response = await fetch(url, { cache: 'no-store', signal: ctx.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const d = await response.json();
    if (d.error) throw new Error(d.reason || 'lookup failed');
    return {
      source: 'ipapi.co',
      ip: d.ip,
      type: d.version,
      city: d.city,
      region: d.region,
      postal: d.postal,
      country: d.country_name,
      countryCode: d.country_code,
      flag: '',
      continent: d.continent_code,
      latitude: d.latitude,
      longitude: d.longitude,
      // utc_offset comes as "-0700".
      timezone: d.timezone
        ? d.timezone + (d.utc_offset ? ` (UTC${d.utc_offset.slice(0, 3)}:${d.utc_offset.slice(3)})` : '')
        : '',
      isp: d.org,
      org: '',
      asn: d.asn || '',
      domain: '',
    };
  };

  let ip = target;
  if (target && !isIPv4(target) && !isIPv6(target)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target)) {
      ctx.error(`geoip: "${target}" is neither an IP address nor a hostname — usage: geoip [ip | hostname]`);
      return;
    }
    ctx.line(`Resolving ${target}…`);
    try {
      ip = await resolve(target);
    } catch (e) {
      ctx.error(`geoip: DNS lookup failed (${e.message || 'network unavailable?'})`);
      return;
    }
    if (!ip) {
      ctx.error(`geoip: ${target} has no A or AAAA record`);
      return;
    }
  }

  const reserved = ip ? reservedRange(ip) : '';
  if (reserved) {
    row('IP', text(ip));
    row('Range', text(reserved));
    ctx.line('No public location: this address is not routed on the Internet.');
    return;
  }

  ctx.line(ip ? `Locating ${ip}…` : 'Locating your public IP…');
  let info = null;
  let firstError = null;
  for (const lookup of [viaIpwhois, viaIpapi]) {
    try {
      info = await lookup(ip);
      break;
    } catch (e) {
      if (ctx.signal && ctx.signal.aborted) return;
      firstError = firstError || e;
    }
  }
  if (!info) {
    ctx.error(`geoip: ${(firstError && firstError.message) || 'lookup failed'} (network unavailable?)`);
    return;
  }

  ctx.line('');
  row('IP', text(info.ip) + (info.type ? ` <span class="comment">(${text(info.type)})</span>` : ''));
  if (target && target !== ip) row('Host', text(target));
  const place = [info.city, info.region].filter(Boolean).join(', ');
  if (place) row('Location', text(place + (info.postal ? ` ${info.postal}` : '')));
  if (info.country) {
    row('Country', text(`${info.flag ? info.flag + ' ' : ''}${info.country}${info.countryCode ? ` (${info.countryCode})` : ''}`));
  }
  if (info.continent) row('Continent', text(info.continent));
  if (typeof info.latitude === 'number' && typeof info.longitude === 'number') {
    const lat = info.latitude.toFixed(4);
    const lon = info.longitude.toFixed(4);
    const map = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}`;
    row(
      'Coordinates',
      `${text(`${lat}, ${lon}`)} <a class="tlink" href="${E(map)}" target="_blank" rel="noopener">[map]</a>`,
    );
  }
  if (info.timezone) row('Time zone', text(info.timezone));
  if (info.isp) row('ISP', text(info.isp));
  if (info.org && info.org !== info.isp) row('Organization', text(info.org));
  if (info.asn) row('ASN', text(info.asn + (info.domain ? ` · ${info.domain}` : '')));
  ctx.line('');
  ctx.append(`<div class="ln comment">approximate location · source: ${E(info.source)}</div>`);
---
