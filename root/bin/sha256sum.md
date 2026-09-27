---
name: sha256sum
desc: compute a SHA-256 checksum — e.g. sha256sum hello
demo: sha256sum hello
seo_title: SHA-256 hash generator — online sha256sum
man: |
  # SHA256SUM(1)

  ## NAME
  sha256sum — compute a SHA-256 checksum

  ## SYNOPSIS
  sha256sum <text...>

  ## DESCRIPTION
  Computes the SHA-256 checksum of the given text (UTF-8 encoded) via
  the Web Crypto API and prints it as lowercase hex, followed by " -"
  (as for standard input).

  ## HOW IT WORKS
  SHA-256, from the SHA-2 family, turns any input into a 256-bit digest shown
  as 64 hexadecimal characters. The page uses the browser's native Web Crypto
  API (crypto.subtle.digest), and the text is hashed as UTF-8 bytes, so the
  result matches `echo -n "text" | sha256sum` on Linux.

  ## USE CASES
  - verify the integrity of a file or a release against its SHA-256 sum;
  - compare two texts or configurations without showing them;
  - build test fixtures for APIs that sign or hash payloads.

  ## PRIVACY
  The hash is computed locally in your browser: the text never leaves the
  page.

  ## EXAMPLES
  sha256sum hello

  ## SEE ALSO
  md5sum, base64, password, jwt
js: |
  const input = ctx.args.join(' ');
  if (!input) { ctx.error('usage: sha256sum <text>'); return; }
  // Hash the UTF-8 bytes via the Web Crypto API, then render as lowercase hex.
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Mirror the real `sha256sum` layout: "<hash>  -" (the dash means stdin).
  ctx.append(`<div class="ln"><span class="accent">${hex}</span><span class="comment">  -</span></div>`);
---
