---
name: json
desc: format, validate and query JSON — e.g. json '{"a":[1,2]}', json -q .a[0] data.json
agent: read
demo: json '{"name":"LudOS","tags":["shell","astro"],"stable":true,"stars":42}'
seo_title: JSON formatter & validator — pretty-print JSON online
man: |
  # JSON(1)

  ## NAME
  json — format, validate and query JSON

  ## SYNOPSIS
  json [-c] [-r] [-q <path>] <json text>
  json [-c] [-r] [-q <path>] <file>
  json [-c] [-r] [-q <path>]          (read piped input)

  ## DESCRIPTION
  Reads a JSON document — typed as an argument, stored in a file, or piped
  in — checks that it is valid and prints it indented by two spaces, with
  syntax colours. Invalid JSON is reported with the line and the column of
  the first error, and the offending line is shown with a marker.

  Quote the JSON so the shell keeps it in one piece: json '{"a": 1}'.

  ## OPTIONS
  -c          compact output: one line, no spaces (minify)
  -q <path>   print only the value at <path> (see QUERY PATHS)
  -r          raw strings: print a string result without its quotes
  --          end of options

  ## QUERY PATHS
  A path walks down the document, starting with a dot:

  .name          the value of key "name"
  .a.b           nested keys
  .items[0]      an array element (negative numbers count from the end)
  .items[]       every element of an array (or every value of an object)
  .["my key"]    a key that is not a plain word

  Steps chain freely: .items[].name prints the name of every item, one
  result per line. A key that does not exist gives null.

  ## HOW IT WORKS
  The text is parsed by your browser's own JSON engine, the strict parser
  defined by the JSON standard (RFC 8259): double-quoted keys and strings, no
  trailing commas, no comments. When the engine rejects the text, a small
  scanner walks it again to find the exact line and column of the first
  mistake, since browsers do not agree on how they report it.

  Everything runs locally: the document never leaves this page, so it is
  safe to paste an API response or a configuration file that holds secrets.

  ## USE CASES
  - make a minified API response readable, or minify a document with -c;
  - find the missing comma or quote that breaks a configuration file;
  - pull one field out of a document: json -q .version package.json;
  - feed a value to another command: json -r -q .url data.json | qr.

  ## NOTES
  Numbers go through JavaScript: integers beyond 2^53 lose precision.
  Duplicate keys keep their last value.

  ## EXAMPLES
  json '{"name":"LudOS","tags":["shell","astro"]}'
  json -c '{ "a": 1, "b": [1, 2, 3] }'
  json -q .tags[0] '{"name":"LudOS","tags":["shell","astro"]}'
  json -q .items[].name data.json
  cat data.json | json -r -q .title

  ## SEE ALSO
  jwt, base64, urlencode, grep, cat, regex
js: |
  // json — pretty-print, validate and query a JSON document, locally.
  const E = ctx.escape;
  const USAGE = 'usage: json [-c] [-r] [-q <path>] <json text | file>';

  // ---- options ------------------------------------------------------------
  let compact = false;
  let rawStrings = false;
  let query = null;
  const operands = [];
  let parsingOptions = true;
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    // Letters only: `-5` is a JSON number, not a group of flags.
    if (parsingOptions && /^-[A-Za-z]+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (flag === 'c') {
          compact = true;
        } else if (flag === 'r') {
          rawStrings = true;
        } else if (flag === 'q') {
          i++;
          if (i >= ctx.args.length) {
            ctx.error('json: -q needs a path, e.g. -q .items[0].name');
            return;
          }
          query = ctx.args[i];
        } else {
          ctx.error(`json: invalid option -- ${flag}`);
          return;
        }
      }
      continue;
    }
    operands.push(arg);
  }

  // ---- input --------------------------------------------------------------
  // Piped input may be empty: only ctx.piped tells an empty pipe from no pipe.
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  let source;
  if (operands.length) {
    const typed = operands.join(' ');
    // A lone operand that does not look like JSON may name a file.
    const looksLikeJson = /^\s*[[{"]/.test(typed);
    const canRead = typeof ctx.read === 'function';
    const file = !looksLikeJson && operands.length === 1 && canRead ? ctx.read(typed) : null;
    source = file && !file.error ? file.content : typed;
  } else if (piped) {
    source = ctx.stdin;
  } else {
    ctx.error(USAGE);
    return;
  }
  if (!source.trim()) {
    ctx.error('json: empty input');
    return;
  }

  // ---- validation ---------------------------------------------------------
  /**
   * Walks the text as a strict JSON grammar and returns the first error as
   * `{ offset, message }`, or null when the text is valid. Engines word and
   * locate JSON.parse errors differently (some give no position at all), so
   * the position reported to the visitor comes from here.
   */
  const locateError = (text) => {
    let position = 0;
    const fail = (message) => {
      throw Object.assign(new Error(message), { offset: position });
    };
    const found = () => (position >= text.length ? 'end of input' : `'${text[position]}'`);
    const skipSpace = () => {
      while (position < text.length && ' \t\n\r'.includes(text[position])) position++;
    };
    const readWord = (word) => {
      if (!text.startsWith(word, position)) fail(`unexpected ${found()}`);
      position += word.length;
    };
    const readString = () => {
      position++; // the opening quote
      for (;;) {
        if (position >= text.length) fail('unterminated string');
        const char = text[position];
        if (char === '"') {
          position++;
          return;
        }
        if (char < ' ') fail('raw line break or control character inside a string');
        if (char === '\\') {
          const escaped = text[position + 1];
          if (escaped === 'u') {
            const hex = text.slice(position + 2, position + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid \\u escape (expected 4 hex digits)');
            position += 6;
            continue;
          }
          if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) {
            fail('invalid escape sequence');
          }
          position += 2;
          continue;
        }
        position++;
      }
    };
    const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const readNumber = () => {
      NUMBER.lastIndex = position;
      const match = NUMBER.exec(text);
      if (!match) fail('invalid number');
      position += match[0].length;
    };
    const readValue = () => {
      skipSpace();
      const char = text[position];
      if (char === '{') readObject();
      else if (char === '[') readArray();
      else if (char === '"') readString();
      else if (char === 't') readWord('true');
      else if (char === 'f') readWord('false');
      else if (char === 'n') readWord('null');
      else if (char === '-' || (char >= '0' && char <= '9')) readNumber();
      else fail(`unexpected ${found()}`);
    };
    const readObject = () => {
      position++; // the opening brace
      skipSpace();
      if (text[position] === '}') {
        position++;
        return;
      }
      for (;;) {
        skipSpace();
        if (text[position] !== '"') {
          fail(`expected a double-quoted property name, found ${found()}`);
        }
        readString();
        skipSpace();
        if (text[position] !== ':') fail(`expected ':' after a property name, found ${found()}`);
        position++;
        readValue();
        skipSpace();
        if (text[position] === '}') {
          position++;
          return;
        }
        if (text[position] !== ',') fail(`expected ',' or '}', found ${found()}`);
        position++;
      }
    };
    const readArray = () => {
      position++; // the opening bracket
      skipSpace();
      if (text[position] === ']') {
        position++;
        return;
      }
      for (;;) {
        readValue();
        skipSpace();
        if (text[position] === ']') {
          position++;
          return;
        }
        if (text[position] !== ',') fail(`expected ',' or ']', found ${found()}`);
        position++;
      }
    };
    try {
      readValue();
      skipSpace();
      if (position < text.length) fail(`unexpected ${found()} after the end of the document`);
      return null;
    } catch (error) {
      if (typeof error.offset !== 'number') throw error;
      return { offset: error.offset, message: error.message };
    }
  };

  let data;
  try {
    data = JSON.parse(source);
  } catch (parseError) {
    let located = null;
    try {
      located = locateError(source);
    } catch {
      // Nested too deep for the scanner: fall back on the engine's message.
    }
    if (!located) {
      ctx.error(`json: invalid JSON — ${parseError.message}`);
      return;
    }
    const before = source.slice(0, located.offset);
    const lineNumber = before.split('\n').length;
    const lineStart = before.lastIndexOf('\n') + 1;
    const column = located.offset - lineStart + 1;
    ctx.error(`json: invalid JSON at line ${lineNumber}, column ${column}: ${located.message}`);
    // Show the offending line with a marker, unless it is too long to help.
    const MAX_EXCERPT = 120;
    const lineEnd = source.indexOf('\n', lineStart);
    const lineText = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    if (lineText.length <= MAX_EXCERPT) {
      ctx.error(`  ${lineText.replace(/\t/g, ' ')}`);
      ctx.error(`  ${' '.repeat(column - 1)}^`);
    }
    return;
  }

  // ---- query --------------------------------------------------------------
  /** Splits a path such as `.items[0].name` into steps; `{ steps }` or `{ error }`. */
  const parsePath = (typedPath) => {
    // `items[0]` is accepted for `.items[0]`.
    const path = /^[.[]/.test(typedPath) ? typedPath : `.${typedPath}`;
    if (path === '.') return { steps: [] };
    const KEY = /\.([A-Za-z_$][\w$-]*)/y;
    const QUOTED_KEY = /\.?\["([^"]*)"\]/y;
    const INDEX = /\.?\[(-?\d+)\]/y;
    const EACH = /\.?\[\]/y;
    const steps = [];
    let position = 0;
    while (position < path.length) {
      let step = null;
      let match = null;
      for (const [pattern, kind] of [
        [KEY, 'key'],
        [QUOTED_KEY, 'key'],
        [INDEX, 'index'],
        [EACH, 'each'],
      ]) {
        pattern.lastIndex = position;
        match = pattern.exec(path);
        if (match) {
          step = { kind, key: match[1], index: Number(match[1]) };
          break;
        }
      }
      if (!step) return { error: `cannot read the path at "${path.slice(position)}"` };
      steps.push(step);
      position += match[0].length;
    }
    return { steps };
  };

  const typeName = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
  };
  const hasKey = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  /** Applies the steps to the document; `[]` fans one value out into several. */
  const select = (root, steps) => {
    let current = [root];
    for (const step of steps) {
      const next = [];
      for (const value of current) {
        const isArray = Array.isArray(value);
        const isObject = value !== null && typeof value === 'object' && !isArray;
        if (step.kind === 'each') {
          if (!isArray && !isObject) throw new Error(`cannot iterate over ${typeName(value)}`);
          for (const item of isArray ? value : Object.values(value)) next.push(item);
        } else if (value === null) {
          // Like jq: looking inside null gives null rather than an error.
          next.push(null);
        } else if (step.kind === 'key') {
          if (!isObject) throw new Error(`cannot read key "${step.key}" of ${typeName(value)}`);
          next.push(hasKey(value, step.key) ? value[step.key] : null);
        } else {
          if (!isArray) throw new Error(`cannot read index ${step.index} of ${typeName(value)}`);
          const index = step.index < 0 ? value.length + step.index : step.index;
          next.push(index >= 0 && index < value.length ? value[index] : null);
        }
      }
      current = next;
    }
    return current;
  };

  let results = [data];
  if (query !== null) {
    const parsed = parsePath(query);
    if (parsed.error) {
      ctx.error(`json: ${parsed.error}`);
      return;
    }
    try {
      results = select(data, parsed.steps);
    } catch (error) {
      ctx.error(`json: ${error.message}`);
      return;
    }
  }

  // ---- output -------------------------------------------------------------
  /** JSON text as HTML: keys, strings, numbers and literals in their colour. */
  const highlight = (text) => {
    const TOKEN =
      /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let html = '';
    let last = 0;
    for (const match of text.matchAll(TOKEN)) {
      html += E(text.slice(last, match.index));
      if (match[1] && match[2]) {
        html += `<span class="accent">${E(match[1])}</span>${E(match[2])}`;
      } else if (match[1]) {
        html += `<span class="cmd">${E(match[1])}</span>`;
      } else if (match[3]) {
        html += `<span class="prompt-user">${E(match[0])}</span>`;
      } else {
        html += `<span class="prompt-path">${E(match[0])}</span>`;
      }
      last = match.index + match[0].length;
    }
    return html + E(text.slice(last));
  };

  for (const result of results) {
    if (rawStrings && typeof result === 'string') {
      ctx.raw(result);
      continue;
    }
    const text = JSON.stringify(result, null, compact ? undefined : 2);
    // Colours are markup only: a pipe or a redirection receives the plain text.
    ctx.append(`<div class="ln out" style="white-space:pre-wrap">${highlight(text)}</div>`);
  }
---
