---
name: httperf
desc: HTTP performance benchmark — e.g. httperf -n 20 -c 4 toinel.com
agent: no
man: |
  # HTTPERF(1)

  ## NAME
  httperf — benchmark a host's HTTP performance

  ## SYNOPSIS
  httperf [-n num] [-c concurrency] <host>

  ## DESCRIPTION
  Fires a batch of HTTP (no-cors) requests at a host and reports the
  latency distribution (min, avg, p50, p90, p95, max) and the achieved
  throughput in requests per second.

  Like ping, it can only time opaque cross-origin fetches end to end —
  the browser cannot expose the TLS / time-to-first-byte phases of a
  third-party host without a Timing-Allow-Origin header. Press Ctrl+C
  to stop early.

  ## OPTIONS
  -n num          total requests (1 to 50, default 10)
  -c concurrency  requests in flight at once (1 to 10, default 1)

  ## USE CASES
  - compare the response time of two hosts or two CDNs from your network;
  - get a feel for the latency distribution: p90 and p95 show the slow
    requests that the average hides;
  - see how a site behaves with a few concurrent requests (-c).

  ## NOTES
  Be gentle: this is a quick benchmark from one browser, not a load-testing
  tool, and it must only target sites you are allowed to test.

  ## EXAMPLES
  httperf toinel.com
  httperf -n 20 -c 4 geeek.org

  ## SEE ALSO
  ping, httpstest, top
js: |
  // HTTP performance benchmark: send `num` requests (`conc` at a time) and
  // report the latency percentiles and throughput. Only opaque (no-cors) round
  // trips can be timed, exactly like ping.
  // Both are capped: this is a courtesy benchmark, not a load generator.
  const DEFAULT_REQUESTS = 10;
  const MAX_REQUESTS = 50;
  const DEFAULT_CONCURRENCY = 1;
  const MAX_CONCURRENCY = 10;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let num = DEFAULT_REQUESTS;
  let conc = DEFAULT_CONCURRENCY;
  const positional = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    // A valued option consumes the next argument (hence the ++i).
    if (arg === '-n' && ctx.args[i + 1]) {
      num = clamp(parseInt(ctx.args[++i], 10) || DEFAULT_REQUESTS, 1, MAX_REQUESTS);
    } else if (arg === '-c' && ctx.args[i + 1]) {
      conc = clamp(parseInt(ctx.args[++i], 10) || DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
    } else positional.push(arg);
  }

  const target = positional[0];
  if (!target) {
    ctx.error('usage: httperf [-n num] [-c concurrency] <host>');
    return;
  }
  const url = /^https?:\/\//.test(target) ? target : `https://${target}`;
  let host;
  try {
    host = new URL(url).host;
  } catch {
    ctx.error(`httperf: ${target}: invalid host`);
    return;
  }

  ctx.line(`httperf ${ctx.escape(host)} — ${num} requests, concurrency ${conc}`);

  // Runs `request(signal)` under a timeout. The signal also aborts on Ctrl+C
  // (ctx.signal); a body read made inside `request` is covered as well.
  const TIMEOUT_MS = 15000;
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

  const latencies = []; // ms, one per successful request
  let ok = 0;
  let failed = 0;
  const sendOne = async () => {
    const sentAt = performance.now();
    try {
      await withTimeout((signal) =>
        fetch(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal }),
      );
      latencies.push(performance.now() - sentAt);
      ok++;
    } catch {
      // A request cut by Ctrl+C is not a failure of the server.
      if (!(ctx.signal && ctx.signal.aborted)) failed++;
    }
  };

  // Worker pool: `conc` workers pull from a shared counter until `num` are sent.
  let started = 0;
  const worker = async () => {
    while (started < num) {
      if (ctx.signal && ctx.signal.aborted) return;
      started++;
      await sendOne();
    }
  };
  const benchStart = performance.now();
  await Promise.all(Array.from({ length: Math.min(conc, num) }, worker));
  const wallSeconds = (performance.now() - benchStart) / 1000;

  ctx.line('');
  ctx.line(`--- ${host} httperf statistics ---`);
  // After Ctrl+C fewer than `num` were sent: report what really went out.
  const sent = ok + failed;
  const interrupted = Boolean(ctx.signal && ctx.signal.aborted);
  ctx.line(
    `${sent} requests${interrupted ? ` (interrupted, ${num} planned)` : ''}, ` +
      `${ok} ok, ${failed} failed, ${wallSeconds.toFixed(2)} s total`,
  );
  if (ok) {
    ctx.line(`throughput: ${(ok / wallSeconds).toFixed(1)} req/s`);
    const sorted = latencies.slice().sort((a, b) => a - b);
    // Nearest-rank percentile: the value below which `percent` % of the samples fall.
    const percentile = (percent) =>
      sorted[Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length))];
    const average = sorted.reduce((sum, latency) => sum + latency, 0) / sorted.length;
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    ctx.line(
      `latency ms: min ${fastest.toFixed(1)}  avg ${average.toFixed(1)}  ` +
        `p50 ${percentile(50).toFixed(1)}  p90 ${percentile(90).toFixed(1)}  ` +
        `p95 ${percentile(95).toFixed(1)}  max ${slowest.toFixed(1)}`,
    );
  }
---
