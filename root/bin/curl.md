---
name: curl
desc: fetch a URL from your browser — e.g. curl -I example.com
agent: no
demo: curl -I %URL%
seo_title: curl online — fetch a URL & headers in your browser
man: |
  # CURL(1)

  ## NAME
  curl — transfer a URL, from the browser

  ## SYNOPSIS
  curl [-I] [-i] [-s] [-L] <url>

  ## DESCRIPTION
  Requests the URL with the browser's own fetch() and prints the body
  as text. A JSON body is pretty-printed. A bare host gets https://
  (curl example.com fetches https://example.com/). Only http and https
  are accepted.

  At most 65536 bytes (64 KiB) of the body are read and printed; beyond
  that the transfer is cut and a note says so. Binary content (images,
  archives, PDF...) is not printed. The request is abandoned after
  10 seconds, or at once with Ctrl+C.

  ## OPTIONS
  -I, --head      headers only (sends a HEAD request)
  -i, --include   response status and headers, then the body
  -s, --silent    no error message and no truncation note
  -L, --location  accepted for compatibility: a browser always follows
                  redirects

  Short options combine (curl -sI example.com).

  ## CORS — WHY MANY SITES FAIL
  This curl runs inside a web page, so the browser's same-origin policy
  applies: a page may read the response of another site only when that
  site explicitly allows it, by answering with an
  Access-Control-Allow-Origin header (CORS). Most websites do not; public
  APIs usually do.

  When the read is refused, the browser tells the page nothing more than
  "the request failed" — the same thing it reports for an unknown host,
  a refused connection or no network. curl therefore cannot say which
  one happened, and lists the likely causes. The browser's developer
  console shows the real reason.

  Two more browser rules apply:

  - a page served over https may not fetch an http:// URL (mixed
    content);
  - for another site, only a few response headers are readable
    (Content-Type, Cache-Control, Content-Language, Expires,
    Last-Modified, Pragma, sometimes Content-Length) unless the server
    exposes more with Access-Control-Expose-Headers. The HTTP version is
    never exposed, so the status line shows no version.

  ## EXAMPLES
  curl -I example.com
  curl https://dns.google/resolve?name=example.com
  curl -i https://api.github.com/zen
  curl -s https://api.github.com/zen | wc -c

  ## SEE ALSO
  ping, httpstest, httperf, dig, nslookup
js: |
  const USAGE = 'usage: curl [-I] [-i] [-s] [-L] <url>';
  const TIMEOUT_MS = 10000;
  // What is read and printed of a body; the rest of the transfer is cut.
  const BODY_LIMIT_BYTES = 65536;
  // Content that would only print garbage in a terminal.
  const BINARY_TYPE =
    /^(image|audio|video|font)\/|^application\/(octet-stream|pdf|zip|gzip|wasm|x-tar)/i;
  // Schemes that are plainly not web addresses (`host:port` is one, though).
  const OTHER_SCHEME = /^(mailto|data|javascript|file|blob|about|tel|sms|ftp|ws|wss):/i;

  // ---- options -----------------------------------------------------------
  const LONG_OPTIONS = { '--head': 'I', '--include': 'i', '--silent': 's', '--location': 'L' };
  const flags = new Set();
  let target = '';
  for (const arg of ctx.args) {
    if (Object.hasOwn(LONG_OPTIONS, arg)) {
      flags.add(LONG_OPTIONS[arg]);
    } else if (/^-[a-zA-Z]+$/.test(arg)) {
      // Short options combine: -sI is -s -I.
      for (const letter of arg.slice(1)) {
        if (!'IisL'.includes(letter)) {
          ctx.error(`curl: unknown option -${letter} — ${USAGE}`);
          return;
        }
        flags.add(letter);
      }
    } else if (arg.startsWith('--')) {
      ctx.error(`curl: unknown option ${arg} — ${USAGE}`);
      return;
    } else if (target) {
      ctx.error(`curl: only one URL at a time — ${USAGE}`);
      return;
    } else {
      target = arg;
    }
  }
  const headOnly = flags.has('I');
  const includeHeaders = flags.has('i');
  const silent = flags.has('s');
  if (!target) {
    ctx.error(`curl: no URL specified — ${USAGE}`);
    return;
  }

  // ---- the URL -----------------------------------------------------------
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
  if (!hasScheme && OTHER_SCHEME.test(target)) {
    ctx.error(`curl: unsupported scheme in '${target}' — only http and https can be fetched`);
    return;
  }
  let url = null;
  try {
    // A bare host (or host:port/path) is taken as an https address.
    url = new URL(hasScheme ? target : `https://${target}`);
  } catch {
    ctx.error(`curl: malformed URL '${target}'`);
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    ctx.error(`curl: unsupported scheme '${url.protocol}' — only http and https can be fetched`);
    return;
  }
  if (url.username || url.password) {
    ctx.error('curl: credentials in the URL are not supported by the browser');
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

  /** Reads at most BODY_LIMIT_BYTES of the body as text, then cuts the transfer. */
  const readBody = async (response) => {
    if (!response.body || typeof response.body.getReader !== 'function') {
      // No streaming support: read everything, keep the beginning.
      const whole = await response.text();
      return {
        text: whole.slice(0, BODY_LIMIT_BYTES),
        truncated: whole.length > BODY_LIMIT_BYTES,
      };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let received = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = BODY_LIMIT_BYTES - received;
      if (value.byteLength > room) {
        text += decoder.decode(value.subarray(0, room), { stream: true });
        truncated = true;
        await reader.cancel();
        break;
      }
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, truncated };
  };

  /** Status line and readable headers. The browser hides the HTTP version. */
  const headerBlock = (response) => {
    const lines = [`HTTP ${response.status} ${response.statusText}`.trimEnd()];
    for (const [name, value] of response.headers.entries()) lines.push(`${name}: ${value}`);
    return lines.join('\n');
  };

  let result;
  try {
    result = await withTimeout(async (signal) => {
      const response = await fetch(url.href, {
        method: headOnly ? 'HEAD' : 'GET',
        cache: 'no-store',
        redirect: 'follow',
        signal,
      });
      const headers = headerBlock(response);
      if (headOnly) return { headers, body: '', note: '' };
      const contentType = response.headers.get('content-type') || '';
      if (BINARY_TYPE.test(contentType)) {
        // Do not download what cannot be shown.
        if (response.body) await response.body.cancel();
        return { headers, body: '', note: `binary content (${contentType}) is not printed` };
      }
      const { text, truncated } = await readBody(response);
      let body = text;
      // A complete JSON document is easier to read indented.
      if (!truncated && /json/i.test(contentType)) {
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          body = text; // announced as JSON but is not: print it as received
        }
      }
      const note = truncated ? `body truncated to the first ${BODY_LIMIT_BYTES} bytes` : '';
      return { headers, body, note };
    });
  } catch (error) {
    if (ctx.signal && ctx.signal.aborted) return; // Ctrl+C: stop quietly
    if (silent) return;
    if (error && error.name === 'TimeoutError') {
      ctx.error(`curl: ${url.host}: ${error.message}`);
      return;
    }
    // fetch() rejects with the same opaque error whether the server is
    // unreachable or the browser refused to hand over the response: say so.
    ctx.error(`curl: could not read ${url.href} — the browser reported a failed request`);
    const pageIsSecure = typeof location !== 'undefined' && location.protocol === 'https:';
    if (url.protocol === 'http:' && pageIsSecure) {
      ctx.error(
        'curl: likely cause: mixed content — a page served over https may not fetch an http:// URL',
      );
      return;
    }
    ctx.error(
      'curl: most likely cause: CORS — a web page may only read another site when that site allows it with an Access-Control-Allow-Origin header',
    );
    ctx.error(
      'curl: other causes: unknown host, refused connection, no network (see man curl; the browser console has the details)',
    );
    return;
  }

  // ---- output ------------------------------------------------------------
  // ctx.raw escapes the text: remote content is shown verbatim, never as HTML.
  if (headOnly) {
    ctx.raw(result.headers);
    return;
  }
  const parts = [];
  if (includeHeaders) parts.push(result.headers, '');
  if (result.body) parts.push(result.body);
  if (parts.length) ctx.raw(parts.join('\n'));
  // Notes go to stderr, so a pipe only receives the body.
  if (result.note && !silent) ctx.error(`curl: ${result.note}`);
---
