---
name: jwt
desc: decode a JSON Web Token — e.g. jwt <token>
seo_title: JWT decoder — read JSON Web Token claims
man: |
  # JWT(1)

  ## NAME
  jwt — decode a JSON Web Token

  ## SYNOPSIS
  jwt <token>

  ## DESCRIPTION
  Decodes a JWT and prints its header and payload as formatted JSON,
  then a readable view of the standard time claims (iat, nbf, exp) and
  whether the token has expired.

  Decoding happens entirely in your browser: the signature is NOT
  verified and nothing is sent anywhere.

  ## HOW IT WORKS
  A JSON Web Token is three base64url segments separated by dots: a header
  (the signing algorithm, the key id), a payload (the claims) and a signature.
  The command decodes the first two and pretty-prints them, then converts the
  standard time claims — issued at (iat), not before (nbf), expiration (exp) —
  to readable dates and tells whether the token is still valid.

  ## USE CASES
  - inspect an access or ID token from an OAuth 2.0 / OpenID Connect flow;
  - debug why an API rejects a token (expired, wrong audience or issuer);
  - check which scopes, roles or tenant a token carries.

  ## SECURITY
  A JWT is signed, not encrypted: anyone holding it can read its claims. Since
  this decoder never verifies the signature, do not trust a token's content
  just because it decodes. Tokens are secrets while they are valid — this page
  never sends them anywhere, but avoid pasting production tokens in tools that
  do.

  ## EXAMPLES
  jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.xxxxx

  ## SEE ALSO
  base64, sha256sum, uuid
js: |
  const token = (ctx.args[0] || '').trim();
  if (!token) {
    ctx.error('usage: jwt <token>');
    return;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    ctx.error('jwt: not a valid token (expected header.payload.signature)');
    return;
  }

  // base64url segment -> parsed JSON (UTF-8 safe via TextDecoder).
  const decode = (segment) => {
    // base64url → standard base64: restore the two swapped characters and the
    // `=` padding that JWTs strip (up to the next multiple of 4).
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedLength = Math.ceil(base64.length / 4) * 4;
    const binary = atob(base64.padEnd(paddedLength, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  // A titled, pretty-printed JSON section (one appended line per JSON line).
  const show = (label, value) => {
    ctx.append(`<div class="ln"><span class="accent">${ctx.escape(label)}</span></div>`);
    for (const line of JSON.stringify(value, null, 2).split('\n')) {
      ctx.append(`<div class="ln out" style="white-space:pre-wrap">${ctx.escape(line)}</div>`);
    }
  };

  try {
    show('HEADER', decode(parts[0]));
    ctx.line('');
    const payload = decode(parts[1]);
    show('PAYLOAD', payload);

    // Standard time claims (seconds since the epoch) -> readable UTC.
    // `2026-01-02T03:04:05.000Z` → `2026-01-02 03:04:05 UTC`.
    const DATE_TIME_LENGTH = 19;
    const formatClaimTime = (epochSeconds) =>
      new Date(epochSeconds * 1000).toISOString().replace('T', ' ').slice(0, DATE_TIME_LENGTH) +
      ' UTC';
    const claims = [];
    if (payload.iat) claims.push(`issued     ${formatClaimTime(payload.iat)}`);
    if (payload.nbf) claims.push(`not before ${formatClaimTime(payload.nbf)}`);
    if (payload.exp) claims.push(`expires    ${formatClaimTime(payload.exp)}`);
    if (claims.length) {
      ctx.line('');
      for (const claim of claims) ctx.line(claim);
    }
    // Time window only: this command decodes, it cannot verify the signature,
    // so it never calls a token "valid".
    const now = Date.now() / 1000;
    const verdict = (color, message) =>
      ctx.append(`<div class="ln"><span style="color:${color}">${ctx.escape(message)}</span></div>`);
    const hasExp = typeof payload.exp === 'number';
    const hasNbf = typeof payload.nbf === 'number';
    if (hasExp && now > payload.exp) {
      verdict('#ff6b6b', '✗ token expired');
    } else if (hasNbf && now < payload.nbf) {
      verdict('#ff6b6b', '✗ token not yet valid (nbf is in the future)');
    } else if (hasExp || hasNbf) {
      verdict('#2bbf6a', hasExp ? '✓ token not expired' : '✓ token past its not-before time');
    }
    ctx.append(
      '<div class="ln comment">signature NOT verified — the claims above are unauthenticated</div>',
    );
  } catch (e) {
    ctx.error(`jwt: could not decode (${e.message || 'malformed token'})`);
  }
---
