/* ------------------------------------------------------------------------- *
 * HTML helpers shared by the client shell (`terminal.ts`) and the build-time
 * renderer (`content.ts`), so both escape and filter links the same way.
 * ------------------------------------------------------------------------- */

/** Escapes the HTML-sensitive characters before injecting into the DOM. */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

/**
 * Whether a markdown link target is safe to emit as an `href`: http(s),
 * `mailto:`, or a same-site path/anchor. Anything else (`javascript:`,
 * `data:`, …) is rendered as plain text by the callers.
 */
export const isSafeHref = (url: string): boolean =>
  /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url);
