import { describe, expect, it } from 'vitest';
import { escapeHtml, isSafeHref } from '../src/lib/html.ts';

describe('html helpers', () => {
  it('escapes the HTML-sensitive characters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('accepts http(s), mailto and same-site links only', () => {
    for (const ok of ['https://a.b', 'http://a.b', 'mailto:me@x.y', '/whoami/', '#top']) {
      expect(isSafeHref(ok), ok).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'JaVaScRiPt:x']) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
  });
});
