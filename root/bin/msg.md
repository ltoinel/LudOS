---
name: msg
desc: email me a message — e.g. msg hi!
page: false
man: |
  # MSG(1)

  ## NAME
  msg — send me a message by email

  ## SYNOPSIS
  msg <message>

  ## DESCRIPTION
  Sends a short message (up to 300 characters) straight to my inbox.
  No sign-up is needed; a rate limit applies to prevent abuse. Leave
  an email address or a handle in the text if you want an answer.

  ## EXAMPLES
  msg hi, I love your terminal!
  msg "let's talk — me@example.com"

  ## SEE ALSO
  whoami, open
js: |
  // Relayed by server/msg-server.ts (nginx proxies /api/msg to it), which
  // emails the text to the owner through the local MTA.
  const text = ctx.args.join(' ').trim();
  if (!text) { ctx.error('usage: msg <message>'); return; }
  ctx.line('sending message …');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  if (ctx.signal) ctx.signal.addEventListener('abort', () => ctrl.abort()); // Ctrl+C
  try {
    const res = await fetch('/api/msg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: text }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      ctx.append('<div class="ln"><span class="accent text-glow">✓ message sent to Ludovic</span></div>');
    } else if (res.status === 429) {
      ctx.error(data.retry_after
        ? `msg: slow down — try again in ${data.retry_after} s`
        : 'msg: daily limit reached — try again tomorrow');
    } else {
      ctx.error(`msg: failed — ${data.error || 'HTTP ' + res.status}`);
    }
  } catch (e) {
    ctx.error(`msg: service unavailable (${e.message || e.name})`);
  } finally {
    clearTimeout(timer);
  }
---
