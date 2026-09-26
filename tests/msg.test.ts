import { describe, expect, it } from 'vitest';
import {
  buildEmail,
  createLimiter,
  encodeHeader,
  parseBody,
  sanitizeMessage,
} from '../server/msg.ts';

describe('sanitizeMessage', () => {
  it('trims and keeps line breaks', () => {
    expect(sanitizeMessage('  hello\r\nworld  ')).toBe('hello\nworld');
  });
  it('strips control characters', () => {
    expect(sanitizeMessage('a\u0000b\u001bc\u007f')).toBe('abc');
  });
  it('truncates long messages with an ellipsis, without splitting code points', () => {
    const out = sanitizeMessage('😀'.repeat(10), 5);
    expect([...out]).toHaveLength(5);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('😀😀😀😀')).toBe(true);
  });
  it('rejects non-strings and blanks', () => {
    expect(sanitizeMessage(undefined)).toBe('');
    expect(sanitizeMessage(42)).toBe('');
    expect(sanitizeMessage('   ')).toBe('');
  });
});

describe('createLimiter', () => {
  const setup = () => {
    let t = Date.UTC(2026, 0, 1, 12);
    const limiter = createLimiter({ cooldown: 20, ipDaily: 3, globalDaily: 5, now: () => t });
    return { limiter, advance: (s: number) => (t += s * 1000) };
  };

  it('enforces the per-IP cooldown', () => {
    const { limiter, advance } = setup();
    expect(limiter.hit('1.1.1.1')).toBeNull();
    advance(5);
    expect(limiter.hit('1.1.1.1')).toEqual({ reason: 'cooldown', retryAfter: 15 });
    advance(15);
    expect(limiter.hit('1.1.1.1')).toBeNull();
  });

  it('enforces the per-IP and global daily quotas', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) {
      expect(limiter.hit('a')).toBeNull();
      advance(30);
    }
    expect(limiter.hit('a')?.reason).toBe('ip_daily_limit');
    expect(limiter.hit('b')).toBeNull();
    expect(limiter.hit('c')).toBeNull();
    expect(limiter.hit('d')?.reason).toBe('global_daily_limit');
  });

  it('resets at UTC midnight', () => {
    const { limiter, advance } = setup();
    for (const ip of ['a', 'b', 'c', 'd', 'e']) limiter.hit(ip);
    expect(limiter.hit('f')?.reason).toBe('global_daily_limit');
    advance(24 * 3600);
    expect(limiter.hit('f')).toBeNull();
  });
});

describe('encodeHeader', () => {
  it('leaves ASCII untouched and encodes UTF-8', () => {
    expect(encodeHeader('hello')).toBe('hello');
    expect(encodeHeader('é')).toBe(`=?UTF-8?B?${Buffer.from('é').toString('base64')}?=`);
  });
});

describe('buildEmail', () => {
  const base = {
    siteName: 'example.com',
    from: 'terminal@example.com',
    to: 'me@example.com',
    ip: '203.0.113.7',
    date: new Date(Date.UTC(2026, 0, 1)),
  };

  it('puts the visitor text in the body only', () => {
    const raw = buildEmail({ ...base, message: 'hi\nBcc: evil@example.com' });
    const [head, body] = raw.split('\n\n');
    expect(head).not.toContain('evil');
    expect(head).toContain('To: me@example.com');
    expect(body).toContain('Bcc: evil@example.com');
  });

  it('strips CR/LF from header-bound metadata', () => {
    const raw = buildEmail({ ...base, message: 'x', country: 'FR\r\nBcc: evil@example.com' });
    const head = raw.split('\n\n')[0];
    expect(head.split('\n').some((l) => l.startsWith('Bcc:'))).toBe(false);
  });
});

describe('parseBody', () => {
  it('reads JSON and form bodies', () => {
    expect(parseBody('application/json', '{"msg":"yo"}')).toBe('yo');
    expect(parseBody('application/x-www-form-urlencoded', 'msg=a%20b')).toBe('a b');
  });
  it('tolerates bad JSON', () => {
    expect(parseBody('application/json', '{nope')).toBeUndefined();
    expect(parseBody('application/json', 'null')).toBeUndefined();
  });
});
