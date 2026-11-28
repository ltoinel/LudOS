---
name: ping
desc: HTTP ping a host — e.g. ping toinel.com
agent: no
demo: ping %HOST%
seo_title: Online ping — HTTP latency test from your browser
man: |
  # PING(1)

  ## NAME
  ping — measure a host's HTTP response time

  ## SYNOPSIS
  ping [-c count] <host>

  ## DESCRIPTION
  Since the browser cannot send ICMP, ping measures the round-trip time
  of HTTP (no-cors) requests to the host. It prints per-request detail
  then statistics (min/avg/max, loss). Four requests by default.

  ## OPTIONS
  -c count   number of requests (1 to 20)

  ## HOW IT WORKS
  A real ping sends ICMP echo packets, which a web page is not allowed to do.
  Instead, each probe is an HTTP request to the host in no-cors mode: the
  browser cannot read the answer, but it can time how long the full round trip
  takes. That includes DNS, TCP and TLS setup on the first probe, so the first
  time is usually the highest.

  ## USE CASES
  - check that a website answers at all, and how fast, from your connection;
  - compare the latency of several hosts or CDNs;
  - spot an unstable network: failed probes, or a wide min/max spread.

  ## NOTES
  Times are HTTP round trips, higher than ICMP ping times for the same host.
  For a load test with percentiles, see httperf.

  ## EXAMPLES
  ping toinel.com
  ping -c 8 geeek.org

  ## SEE ALSO
  httperf, nslookup, checkip
js: |
  // Browsers can't send ICMP, so this is an "HTTP ping": it measures the
  // round-trip time of opaque (no-cors) fetches to the target URL.
  const DEFAULT_COUNT = 4;
  const MAX_COUNT = 20; // a courtesy cap: these are real requests to someone's server
  const PAUSE_BETWEEN_PINGS_MS = 500;
  let count = DEFAULT_COUNT;
  const positional = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    if (arg === '-c' && ctx.args[i + 1]) {
      // -c consumes the next argument as its value (hence the ++i).
      const requested = parseInt(ctx.args[++i], 10) || DEFAULT_COUNT;
      count = Math.max(1, Math.min(MAX_COUNT, requested));
    } else {
      positional.push(arg);
    }
  }
  const target = positional[0];
  if (!target) {
    ctx.error('usage: ping [-c count] <host>');
    return;
  }

  // Normalise to an absolute https URL and extract the host for display.
  const url = /^https?:\/\//.test(target) ? target : `https://${target}`;
  let host;
  try {
    host = new URL(url).host;
  } catch {
    ctx.error(`ping: ${target}: invalid host`);
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

  ctx.line(`PING ${ctx.escape(host)} (HTTP) — ${count} requests`);
  const times = []; // round-trip times of the answered requests, in ms
  let sent = 0; // requests really issued: Ctrl+C may stop before `count`
  for (let seq = 1; seq <= count; seq++) {
    if (ctx.signal && ctx.signal.aborted) break; // Ctrl+C
    const sentAt = performance.now();
    sent++;
    try {
      await withTimeout((signal) =>
        fetch(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal }),
      );
      const roundTrip = performance.now() - sentAt;
      times.push(roundTrip);
      ctx.line(`response from ${ctx.escape(host)}: seq=${seq} time=${roundTrip.toFixed(1)} ms`);
    } catch (e) {
      if (ctx.signal && ctx.signal.aborted) break; // aborted mid-flight — stop quietly
      ctx.error(`request to ${host}: seq=${seq} failed (${e.name || 'error'})`);
    }
    if (seq < count) await ctx.sleep(PAUSE_BETWEEN_PINGS_MS);
  }

  ctx.line('');
  const lost = sent - times.length;
  const lossPercent = sent ? Math.round((lost / sent) * 100) : 0;
  ctx.line(`--- ${host} HTTP ping statistics ---`);
  ctx.line(`${sent} requests sent, ${times.length} received, ${lossPercent}% loss`);
  if (times.length) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    ctx.line(`rtt min/avg/max = ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)} ms`);
  }
---
