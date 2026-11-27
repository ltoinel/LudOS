---
name: regex
desc: test a regular expression — e.g. regex "(\d+)-(\d+)" "call 555-0199 now"
demo: regex "(?<year>\d{4})-(?<month>\d{2})" i "Released 2026-11, patched 2027-02"
seo_title: Regex tester — test a regular expression online
man: |
  # REGEX(1)

  ## NAME
  regex — test a regular expression against a text

  ## SYNOPSIS
  regex <pattern> [flags] <text...>
  regex /<pattern>/<flags> <text...>
  regex <pattern> [flags]              (read the text from piped input)

  ## DESCRIPTION
  Runs a JavaScript regular expression on a text and shows what it finds:
  the text with every match highlighted, then each match with its position
  (start-end, counted from 0) and the content of its capture groups,
  numbered ($1, $2…) and named (<name>).

  Every match is listed, whether or not the g flag is given. An invalid
  pattern is reported with the engine's own error message.

  Quote the pattern and the text so the shell keeps them in one piece.

  ## OPTIONS
  flags   any of the JavaScript flags, written right after the pattern:
          i  ignore case            m  ^ and $ match at line breaks
          s  the dot matches \n     u  Unicode mode (\p{…}, code points)
          y  sticky                 g  accepted (matching is always global)
  --      put it after the pattern when the text starts with a word made of
          flag letters only: regex a -- is this a test

  A word is read as flags when it only contains flag letters and some text
  follows it (or text is piped in). The /pattern/flags form never guesses.

  ## HOW IT WORKS
  The pattern is compiled by your browser's regular expression engine, the
  same one JavaScript code uses (ECMAScript syntax: lookahead and
  lookbehind, named groups, Unicode properties). Results may differ slightly
  from PCRE (PHP, grep -P), Python or Go.

  The search runs in a background thread with a two-second budget. Some
  patterns, such as (a+)+$ on a long run of "a", make a backtracking engine
  try an exponential number of paths — "catastrophic backtracking". Here the
  thread is simply stopped and the command says so, instead of freezing the
  page. Ctrl+C stops it too. Nothing is sent anywhere.

  ## USE CASES
  - check that a pattern captures what you expect before using it in code;
  - understand someone else's regular expression on a real sample;
  - try a validation rule (e-mail, date, identifier) on good and bad inputs;
  - find out whether a slow pattern is prone to catastrophic backtracking.

  ## EXAMPLES
  regex "\d+" "order 66 shipped in 3 days"
  regex "(\w+)@(\w+)\.com" i "Mail Bob@Example.com or amy@test.com"
  regex "/(?<key>\w+)=(?<value>\w+)/g" "a=1, b=2"
  cat about.md | regex "https?://\S+"

  ## SEE ALSO
  grep, find, json, wc
js: |
  // regex — show the matches and capture groups of a regular expression.
  const E = ctx.escape;
  const USAGE = 'usage: regex <pattern> [flags] <text>';
  const args = ctx.args.slice();
  if (!args.length) {
    ctx.error(USAGE);
    return;
  }

  // ---- arguments ----------------------------------------------------------
  // Piped input may be empty: only ctx.piped tells an empty pipe from no pipe.
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  const FLAG_LETTERS = /^[dgimsuvy]+$/;
  let pattern = args.shift();
  let flags = '';
  // `/pattern/flags`, as written in JavaScript source.
  const literal = /^\/(.+)\/([dgimsuvy]*)$/s.exec(pattern);
  if (literal) {
    pattern = literal[1];
    flags = literal[2];
    if (args[0] === '--') args.shift();
  } else if (args[0] === '--') {
    args.shift();
  } else if (args.length && FLAG_LETTERS.test(args[0]) && (args.length > 1 || piped)) {
    // A word of flag letters is only read as flags when a text remains.
    flags = args.shift();
  }

  let text;
  if (args.length) {
    text = args.join(' ');
  } else if (piped) {
    text = ctx.stdin;
  } else {
    ctx.error('regex: no text to search — add it after the pattern, or pipe it in');
    return;
  }

  // Compiling never backtracks, so it is safe on the page — and it is where
  // the engine explains what is wrong with a pattern or its flags.
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    ctx.error(`regex: ${error.message}`);
    return;
  }

  // ---- matching -----------------------------------------------------------
  // The pattern is the visitor's, and a pathological one (`(a+)+$` on a long
  // line of a's) can backtrack for minutes. Run on the page, it would freeze
  // the tab with no way to interrupt it — so the search runs in a Web Worker
  // that is terminated after SEARCH_BUDGET_MS or on Ctrl+C.
  const SEARCH_BUDGET_MS = 2000;
  // Enough to study a pattern; keeps a `.` on a large file from flooding the screen.
  const MAX_MATCHES = 200;

  /**
   * Lists the matches of `pattern` in `text` as plain data (index, matched
   * text, numbered groups, named groups); null stands for a group that did
   * not take part. Self-contained on purpose: its source is what the worker runs.
   */
  function findAll(pattern, flags, text, limit) {
    const orNull = (value) => (value === undefined ? null : value);
    // Without `g`, exec would return the first match forever.
    const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
    const matches = [];
    let truncated = false;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (matches.length === limit) {
        truncated = true;
        break;
      }
      matches.push({
        index: match.index,
        text: match[0],
        groups: match.slice(1).map(orNull),
        named: Object.entries(match.groups || {}).map(([name, value]) => [name, orNull(value)]),
      });
      if (match[0] === '') re.lastIndex++; // avoid looping on empty matches
    }
    return { matches, truncated };
  }

  /** Runs `findAll` in a worker; rejects on timeout, resolves null on Ctrl+C. */
  const searchInWorker = () =>
    new Promise((resolve, reject) => {
      const source =
        `const findAll = ${findAll.toString()};\n` +
        'onmessage = (event) => postMessage(findAll(...event.data));';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = ctx.worker(url, 'regex');
      const finish = (settle, value) => {
        clearTimeout(timer);
        if (ctx.signal) ctx.signal.removeEventListener('abort', onAbort);
        worker.terminate();
        URL.revokeObjectURL(url);
        settle(value);
      };
      const onAbort = () => finish(resolve, null);
      const timer = setTimeout(() => {
        const reason = 'the pattern takes too long to match (catastrophic backtracking?)';
        finish(reject, new Error(reason));
      }, SEARCH_BUDGET_MS);
      if (ctx.signal) ctx.signal.addEventListener('abort', onAbort);
      worker.onmessage = (event) => finish(resolve, event.data);
      worker.onerror = (event) => finish(reject, new Error(event.message || 'search failed'));
      worker.postMessage([pattern, flags, text, MAX_MATCHES]);
    });

  // No Worker here (tests, exotic browsers): search on the calling thread.
  const canIsolate = typeof Worker === 'function' && typeof ctx.worker === 'function';
  let result;
  try {
    result = canIsolate ? await searchInWorker() : findAll(pattern, flags, text, MAX_MATCHES);
  } catch (error) {
    ctx.error(`regex: ${error.message}`);
    return;
  }
  if (!result) return; // interrupted by Ctrl+C

  // ---- output -------------------------------------------------------------
  const { matches, truncated } = result;
  if (!matches.length) {
    ctx.line('no match');
    return;
  }

  // The text, with each match highlighted in place.
  let highlighted = '';
  let last = 0;
  for (const match of matches) {
    highlighted += E(text.slice(last, match.index));
    highlighted += `<span class="accent text-glow">${E(match.text)}</span>`;
    last = match.index + match.text.length;
  }
  highlighted += E(text.slice(last));
  ctx.append(`<div class="ln out" style="white-space:pre-wrap">${highlighted}</div>`);
  ctx.line('');

  // JSON notation makes spaces, line breaks and empty strings visible.
  const quoted = (value) => (value === null ? '(no match)' : JSON.stringify(value));
  /** One line of the report: a dim label, an optional position, a value. */
  const row = (indent, label, position, value) => {
    const where = position ? `<span class="prompt-path">${E(position)}</span>  ` : '';
    ctx.append(
      '<div class="ln out" style="white-space:pre-wrap">' +
        `${indent}<span class="comment">${E(label)}</span>  ${where}${E(value)}</div>`,
    );
  };

  matches.forEach((match, number) => {
    const end = match.index + match.text.length;
    row('', `#${number + 1}`, `${match.index}-${end}`, quoted(match.text));
    match.groups.forEach((group, groupNumber) => {
      row('    ', `$${groupNumber + 1}`, '', quoted(group));
    });
    for (const [name, value] of match.named) row('    ', `<${name}>`, '', quoted(value));
  });

  const count = `${matches.length} match${matches.length > 1 ? 'es' : ''}`;
  const more = truncated ? ` shown — there are more (limit ${MAX_MATCHES})` : '';
  ctx.append(`<div class="ln comment">${E(count + more)}</div>`);
---
