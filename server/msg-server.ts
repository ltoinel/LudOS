/* ------------------------------------------------------------------------- *
 * `msg` email relay — the only server-side piece of the (otherwise static)
 * portal. The `msg <text>` command POSTs to `/api/msg`; nginx proxies that
 * path to this process, which emails the text to the owner through the local
 * MTA (`sendmail -t -i`, e.g. Postfix). Zero dependencies: run it with
 * `node server/msg-server.ts` (Node ≥ 22.18, native TS) — see
 * `deploy/msg-relay.service.template`.
 *
 * Configuration (environment):
 *   MSG_TO        recipient address (required)
 *   MSG_FROM      sender address          (default terminal@<site host>)
 *   MSG_HOST      listen address          (default 127.0.0.1 — keep it local)
 *   MSG_PORT      listen port             (default 8787)
 *   MSG_ORIGIN    allowed browser Origin  (default: the site url)
 *   MSG_LOG       optional attempt log file (tab-separated, append-only)
 *   SENDMAIL      sendmail binary         (default /usr/sbin/sendmail)
 *
 * The client IP comes from nginx's `X-Real-IP` (set from `$remote_addr`, so a
 * visitor cannot forge it) — trusted only because we listen on loopback.
 *
 * The defaults come from `src/site.config.ts` (`url`), so no domain is
 * hard-coded here.
 *
 * Response: JSON { ok: boolean, error?: string, retry_after?: number }.
 * ------------------------------------------------------------------------- */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { buildEmail, createLimiter, parseBody, sanitizeMessage } from './msg.ts';
import { site, siteHost } from '../src/site.config.ts';

const env = process.env;
const TO = env.MSG_TO ?? '';
const FROM = env.MSG_FROM || `terminal@${siteHost}`;
const HOST = env.MSG_HOST || '127.0.0.1';
const PORT = Number(env.MSG_PORT || 8787);
const ORIGIN = env.MSG_ORIGIN || site.url;
const LOG = env.MSG_LOG || '';
const SENDMAIL = env.SENDMAIL || '/usr/sbin/sendmail';

/** Largest request body read (bytes) — a message is at most a few hundred chars. */
const BODY_MAX = 4096;
/** How long `sendmail` may take before the request fails. */
const SENDMAIL_TIMEOUT_MS = 10_000;

if (!TO) {
  console.error('msg-server: MSG_TO is not set — refusing to start.');
  process.exit(1);
}

const limiter = createLimiter({ cooldown: 20, ipDaily: 15, globalDaily: 120 });

/** Writes a JSON response. */
function reply(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/** Reads the request body, rejecting anything larger than `BODY_MAX`. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > BODY_MAX) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Pipes a raw email into `sendmail -t -i` (recipients read from the headers). */
function sendmail(raw: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(SENDMAIL, ['-t', '-i', '-f', FROM], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), SENDMAIL_TIMEOUT_MS);
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`sendmail exited with ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(raw);
  });
}

/** Appends one attempt to the optional log (best-effort). */
function log(ip: string, result: string, msg: string): void {
  if (!LOG) return;
  const clean = msg.replace(/[\n\r\t]+/g, ' ').slice(0, 120);
  appendFile(LOG, `${new Date().toISOString()}\t${ip}\t${result}\t${clean}\n`).catch(() => {});
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/api/msg') return reply(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method_not_allowed' });

  // Browsers always send Origin on a cross-origin POST: refuse foreign pages.
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return reply(res, 403, { ok: false, error: 'forbidden' });

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    return reply(res, 413, { ok: false, error: 'too_large' });
  }
  const msg = sanitizeMessage(parseBody(String(req.headers['content-type'] ?? ''), raw));
  if (!msg) return reply(res, 400, { ok: false, error: 'empty_message' });

  const ip = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? '0.0.0.0');
  const refused = limiter.hit(ip);
  if (refused) {
    log(ip, `blocked:${refused.reason}`, msg);
    const body: Record<string, unknown> = { ok: false, error: 'rate_limited' };
    if (refused.retryAfter > 0) body.retry_after = refused.retryAfter;
    return reply(res, 429, body);
  }

  try {
    await sendmail(
      buildEmail({
        from: FROM,
        to: TO,
        siteName: siteHost,
        message: msg,
        ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
        country: String(req.headers['cf-ipcountry'] ?? ''),
      }),
    );
  } catch (e) {
    console.error(`msg-server: ${(e as Error).message}`);
    log(ip, 'error', msg);
    return reply(res, 502, { ok: false, error: 'mail_failed' });
  }
  log(ip, 'sent', msg);
  reply(res, 200, { ok: true });
}

const server = createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    console.error(`msg-server: ${(e as Error).message}`);
    if (!res.headersSent) reply(res, 500, { ok: false, error: 'internal' });
  });
});

server.listen(PORT, HOST, () => console.log(`msg-server listening on http://${HOST}:${PORT}`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
