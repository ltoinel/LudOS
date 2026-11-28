---
name: urlencode
desc: percent-encode text for a URL — e.g. urlencode "a b&c", urlencode -d a%20b
agent: read
demo: urlencode "name=Zoé & Léa?"
seo_title: URL encoder / decoder — percent-encoding online
man: |
  # URLENCODE(1)

  ## NAME
  urlencode — percent-encode text for a URL, or decode it

  ## SYNOPSIS
  urlencode [-d] [-f] <text...>
  urlencode [-d] [-f]            (read piped input, line by line)

  ## DESCRIPTION
  Encodes its argument so it can travel safely inside a URL: every character
  that is not a letter, a digit or one of - _ . ~ is replaced by a percent
  sign and the hexadecimal value of its UTF-8 bytes. With -d it does the
  reverse. Piped input is processed one line at a time, so a list stays a
  list.

  Decoding malformed text (a lone %, an invalid UTF-8 sequence) reports
  where the problem is instead of guessing.

  ## OPTIONS
  -d   decode instead of encoding (same as the urldecode command)
  -f   form mode (application/x-www-form-urlencoded): a space is written,
       and read back, as a plus sign
  --   end of options (for a text starting with a dash)

  ## HOW IT WORKS
  A URL may only contain a small set of ASCII characters, and several of them
  have a job: ? starts the query string, & separates parameters, = splits a
  name from its value, # starts the fragment, / separates path segments.
  Percent-encoding (RFC 3986) lets a value carry those characters, spaces
  and non-ASCII text without being mistaken for URL syntax: the text is
  converted to UTF-8 and each unsafe byte becomes %XX. A space is %20, & is
  %26, é is %C3%A9.

  This command encodes a component — a parameter value, a path segment — so
  it also escapes : / ? & = and the sub-delimiters ! ' ( ) *. Do not run it
  on a whole URL: encode each value, then assemble the URL.

  HTML forms use a variant in which a space becomes + (and a real plus sign
  becomes %2B): that is the -f mode. Everything happens in your browser.

  ## USE CASES
  - build a query string by hand: ?q= followed by the encoded search terms;
  - read a redirect or callback URL found in a log, with urlencode -d;
  - pass a URL as a parameter of another URL (OAuth redirect_uri);
  - encode a list of values in one go: cat names.txt | urlencode.

  ## EXAMPLES
  urlencode "hello world & more"
  urlencode -f "a b+c"
  urlencode -d caf%C3%A9%20%26%20th%C3%A9
  echo "a/b?c=d" | urlencode

  ## SEE ALSO
  urldecode, base64, json, qr
js: |
  // urlencode — percent-encode (or decode with -d) a URL component, locally.
  const USAGE = 'usage: urlencode [-d] [-f] <text>';

  // ---- options ------------------------------------------------------------
  let decoding = false;
  let formMode = false;
  const operands = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && (arg === '--decode' || arg === '--form')) {
      if (arg === '--decode') decoding = true;
      else formMode = true;
      continue;
    }
    if (parsingOptions && /^-[A-Za-z]+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (flag === 'd') {
          decoding = true;
        } else if (flag === 'f') {
          formMode = true;
        } else {
          ctx.error(`urlencode: invalid option -- ${flag}`);
          return;
        }
      }
      continue;
    }
    operands.push(arg);
  }

  // ---- input --------------------------------------------------------------
  // An argument is one value; piped text is a list, one value per line. Piped
  // input may be empty: only ctx.piped tells an empty pipe from no pipe.
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  let values;
  if (operands.length) {
    values = [operands.join(' ')];
  } else if (piped) {
    values = ctx.stdin ? ctx.stdin.replace(/\n$/, '').split('\n') : [];
  } else {
    ctx.error(USAGE);
    return;
  }

  // ---- conversion ---------------------------------------------------------
  /** Encodes one value; `{ text }` or `{ error }`. */
  const encode = (value) => {
    let encoded;
    try {
      encoded = encodeURIComponent(value);
    } catch {
      // The only failure: half of a surrogate pair, which has no UTF-8 form.
      return { error: 'the text contains an invalid Unicode character (lone surrogate)' };
    }
    // encodeURIComponent predates RFC 3986 and leaves ! ' ( ) * as they are.
    encoded = encoded.replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    if (formMode) encoded = encoded.replace(/%20/g, '+');
    return { text: encoded };
  };

  /** Decodes one value; `{ text }` or `{ error }` naming what is malformed. */
  const decode = (value) => {
    const prepared = formMode ? value.replace(/\+/g, ' ') : value;
    try {
      return { text: decodeURIComponent(prepared) };
    } catch {
      // A percent sign that is not followed by two hex digits…
      const broken = /%(?![0-9a-fA-F]{2})/.exec(prepared);
      if (broken) {
        const excerpt = prepared.slice(broken.index, broken.index + 3);
        return {
          error: `malformed input: "${excerpt}" at position ${broken.index + 1} is not a %XX escape`,
        };
      }
      // …or well-formed escapes whose bytes are not valid UTF-8.
      return { error: 'malformed input: the escaped bytes are not valid UTF-8' };
    }
  };

  for (const value of values) {
    const result = decoding ? decode(value) : encode(value);
    if (result.error) ctx.error(`urlencode: ${result.error}`);
    else ctx.raw(result.text);
  }
---
