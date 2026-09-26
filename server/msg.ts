/* ------------------------------------------------------------------------- *
 * Pure logic of the `msg` email relay (see `msg-server.ts`).
 *
 * Everything here is free of I/O so it can be unit-tested: message
 * sanitation, the abuse limiter and the RFC 5322 email builder. The HTTP
 * server and the `sendmail` hand-off live in `msg-server.ts`.
 * ------------------------------------------------------------------------- */

/** Longest message accepted, in characters (longer ones are truncated). */
export const MSG_MAX_LEN = 300;

/**
 * Normalizes a visitor's message: strips control characters (keeping line
 * breaks and tabs), trims, and truncates to `MSG_MAX_LEN` characters with an
 * ellipsis. Returns '' for an empty/blank message.
 */
export function sanitizeMessage(raw: unknown, max = MSG_MAX_LEN): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  const trimmed = text.trim();
  const chars = [...trimmed]; // code points, so an emoji is never split in half
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : trimmed;
}

/** Why a message was refused by the limiter. */
export type LimitReason = 'cooldown' | 'ip_daily_limit' | 'global_daily_limit';

export interface LimiterOptions {
  /** Minimum seconds between two messages from the same IP. */
  cooldown: number;
  /** Maximum messages per IP per UTC day. */
  ipDaily: number;
  /** Maximum messages overall per UTC day (hard cap protecting the inbox). */
  globalDaily: number;
  /** Clock, in milliseconds (injectable for tests). */
  now?: () => number;
}

/** A refusal: the reason, plus how long to wait (seconds; 0 = until tomorrow). */
export interface Refusal {
  reason: LimitReason;
  retryAfter: number;
}

/**
 * In-memory abuse limiter: per-IP cooldown, per-IP daily quota and a global
 * daily quota, all reset at UTC midnight. The relay is a single process, so
 * memory is enough; a restart merely resets the counters.
 */
export function createLimiter(opts: LimiterOptions) {
  const now = opts.now ?? Date.now;
  let day = '';
  let global = 0;
  const ips = new Map<string, { last: number; count: number }>();

  /** Resets every counter when the UTC day changes. */
  const roll = (t: number): void => {
    const today = new Date(t).toISOString().slice(0, 10);
    if (today === day) return;
    day = today;
    global = 0;
    ips.clear();
  };

  return {
    /** Records an attempt from `ip`; returns null when allowed, else the refusal. */
    hit(ip: string): Refusal | null {
      const t = now();
      roll(t);
      const rec = ips.get(ip) ?? { last: 0, count: 0 };
      const since = Math.floor((t - rec.last) / 1000);
      if (rec.last && since < opts.cooldown)
        return { reason: 'cooldown', retryAfter: opts.cooldown - since };
      if (rec.count >= opts.ipDaily) return { reason: 'ip_daily_limit', retryAfter: 0 };
      if (global >= opts.globalDaily) return { reason: 'global_daily_limit', retryAfter: 0 };
      ips.set(ip, { last: t, count: rec.count + 1 });
      global += 1;
      return null;
    },
  };
}

/**
 * Encodes a header value as an RFC 2047 UTF-8 "encoded word" when it is not
 * plain ASCII, so accents and emoji survive in the subject line.
 */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Strips anything that could break out of a header line (CR / LF). */
const headerSafe = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

export interface EmailInput {
  /** Site shown in the sender's display name (`Terminal <siteName>`). */
  siteName: string;
  from: string;
  to: string;
  message: string;
  ip: string;
  userAgent?: string;
  /** Country hint from a CDN, if any. */
  country?: string;
  date?: Date;
}

/**
 * Builds the raw email handed to `sendmail -t -i`. Only fixed or sanitized
 * values reach the headers — the visitor's text lives in the body alone, so it
 * cannot inject headers or recipients.
 */
export function buildEmail(input: EmailInput): string {
  const date = input.date ?? new Date();
  const country = input.country && input.country !== 'XX' ? ` (${headerSafe(input.country)})` : '';
  const firstLine = input.message.split('\n')[0];
  const preview =
    [...firstLine].length > 60 ? `${[...firstLine].slice(0, 59).join('')}…` : firstLine;
  const headers = [
    `From: ${encodeHeader(`Terminal ${headerSafe(input.siteName)}`)} <${headerSafe(input.from)}>`,
    `To: ${headerSafe(input.to)}`,
    `Subject: ${encodeHeader(`💬 msg${country} · ${preview}`)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    'Auto-Submitted: auto-generated',
  ];
  const body = [
    input.message,
    '',
    '-- ',
    `IP      : ${headerSafe(input.ip)}${country}`,
    `Agent   : ${headerSafe(input.userAgent ?? '-') || '-'}`,
    `Date    : ${date.toISOString()}`,
  ];
  return `${headers.join('\n')}\n\n${body.join('\n')}\n`;
}

/**
 * Extracts the message from a request body: JSON `{ "msg": "…" }` or a form
 * (`msg=…`). Returns undefined when neither yields a string.
 */
export function parseBody(contentType: string, raw: string): unknown {
  if (contentType.includes('application/json')) {
    try {
      const data: unknown = JSON.parse(raw);
      return data && typeof data === 'object' ? (data as Record<string, unknown>).msg : undefined;
    } catch {
      return undefined;
    }
  }
  return new URLSearchParams(raw).get('msg') ?? undefined;
}
