---
name: urldecode
desc: decode percent-encoded text — e.g. urldecode caf%C3%A9%20au%20lait
agent: read
page: false
man: |
  # URLDECODE(1)

  ## NAME
  urldecode — decode percent-encoded (URL-encoded) text

  ## SYNOPSIS
  urldecode [-f] <text...>
  urldecode [-f]            (read piped input, line by line)

  ## DESCRIPTION
  Turns every %XX escape of its argument back into the character it stands
  for, reading the bytes as UTF-8: %20 becomes a space, %C3%A9 becomes é.
  It is the reverse of `urlencode`, and the same as `urlencode -d`. Piped
  input is decoded one line at a time.

  Malformed text — a % that is not followed by two hexadecimal digits, or
  bytes that are not valid UTF-8 — is reported as an error, with its
  position, instead of being decoded approximately. Everything happens in
  your browser.

  ## OPTIONS
  -f   form mode (application/x-www-form-urlencoded): a plus sign is read as
       a space
  --   end of options (for a text starting with a dash)

  ## EXAMPLES
  urldecode hello%20world%20%26%20more
  urldecode -f "a+b%2Bc"
  echo "q%3Dterminal%26lang%3Den" | urldecode

  ## SEE ALSO
  urlencode, base64, json
js: |
  // urldecode — decode a percent-encoded URL component, locally. Carries its
  // own code (commands are self-contained); `urlencode -d` behaves the same.
  const USAGE = 'usage: urldecode [-f] <text>';

  // ---- options ------------------------------------------------------------
  let formMode = false;
  const operands = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && (arg === '-f' || arg === '--form')) {
      formMode = true;
      continue;
    }
    if (parsingOptions && /^-[A-Za-z]+$/.test(arg)) {
      ctx.error(`urldecode: invalid option -- ${arg.slice(1)}`);
      return;
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
    const result = decode(value);
    if (result.error) ctx.error(`urldecode: ${result.error}`);
    else ctx.raw(result.text);
  }
---
