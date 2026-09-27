---
name: iframed
desc: open a URL in an in-page window — e.g. iframed https://example.com
seo_title: Iframe tester — can this website be embedded?
man: |
  # IFRAMED(1)

  ## NAME
  iframed — open a URL inside a draggable in-page window (an <iframe>)

  ## SYNOPSIS
  iframed <url>

  ## DESCRIPTION
  Opens a small browser window, embedded in the page, that frames the
  given URL in an <iframe>. The window can be dragged by its title bar,
  minimized, maximized and closed like a shell window. A bare host is
  assumed to be https.

  Many sites refuse to be embedded (they send X-Frame-Options or a
  Content-Security-Policy frame-ancestors directive) and will show up as
  a blank frame — that is the remote site's choice, not a bug. Use the
  "↗ open" link in the title bar to open such a site in a real tab.

  ## HOW IT WORKS
  The page creates an <iframe> pointing at the URL, inside a window of its
  own. Whether the site shows up is decided by the site itself, through
  two HTTP response headers: `X-Frame-Options` (DENY or SAMEORIGIN) and
  the `frame-ancestors` directive of its Content-Security-Policy. The
  browser enforces them; nothing is proxied.

  ## USE CASES
  - test whether your own site can be embedded by another one, before
    publishing an embed code or a widget;
  - check that a sensitive page (login, admin) does refuse to be framed —
    the defence against clickjacking;
  - keep a documentation page or a dashboard open next to the terminal.

  ## NOTES
  A blank frame means the site refused to be embedded — or that it blocks
  third-party cookies, so a login inside the frame may not stick. Only
  https URLs load: browsers block http content on an https page.

  ## EXAMPLES
  iframed https://example.com
  iframed example.com

  ## SEE ALSO
  open, httpstest
js: |
  const url = ctx.args[0];
  if (!url) { ctx.error('usage: iframed <url>'); return; }
  const err = ctx.iframe(url);
  if (err) ctx.error(`iframed: ${err}`);
  else ctx.line(`framing ${url} …`);
---
