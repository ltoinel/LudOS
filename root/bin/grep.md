---
name: grep
desc: search text in files — e.g. grep -rn ssh .
page: false
man: |
  # GREP(1)

  ## NAME
  grep — search for text in files

  ## SYNOPSIS
  grep [-i] [-n] [-r] <pattern> <file...>

  ## DESCRIPTION
  Prints the lines matching <pattern> (a regular expression) in the
  given files. Matches are highlighted. With -r, directories are
  searched recursively.

  ## OPTIONS
  -i   ignore case
  -n   prefix each line with its number
  -r   search directories recursively

  ## EXAMPLES
  grep -rn ssh .
  grep -i error bin/boot

  ## SEE ALSO
  find, cat
js: |
  const E = ctx.escape;
  // Parse short flags (bundled like -rn), keep the rest as pattern + targets.
  let ci = false;
  let num = false;
  let rec = false;
  const rest = [];
  for (const a of ctx.args) {
    if (a.length > 1 && a.startsWith('-') && !a.startsWith('--')) {
      for (const ch of a.slice(1)) {
        if (ch === 'i') ci = true;
        else if (ch === 'n') num = true;
        else if (ch === 'r' || ch === 'R') rec = true;
      }
    } else {
      rest.push(a);
    }
  }
  const pattern = rest.shift();
  if (pattern == null) {
    ctx.error('usage: grep [-inr] <pattern> <file...>');
    return;
  }
  // File targets; when none are given we may instead read piped stdin (below).
  let targets = rest;
  if (!targets.length) targets = rec ? ['.'] : null;

  // ---- matching ---------------------------------------------------------
  // The pattern is the visitor's regular expression, and a pathological one
  // (`(a+)+$` on a long line of a's) can backtrack for minutes. Run on the
  // page, it would freeze the tab with no way to interrupt it — so the search
  // runs in a Web Worker that is terminated after SEARCH_BUDGET_MS or on Ctrl+C.
  const SEARCH_BUDGET_MS = 2000;

  /**
   * Finds the matches of `pattern` in each text. Returns, per text, its
   * matching lines as `{ index, spans }` (spans are [start, end) offsets).
   * Self-contained on purpose: its source is what the worker runs.
   */
  function findMatches(pattern, ignoreCase, texts) {
    const flags = ignoreCase ? 'gi' : 'g';
    let re;
    try {
      re = new RegExp(pattern, flags);
    } catch {
      // Not a valid regex: search for the text literally.
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }
    return texts.map((text) => {
      const hits = [];
      text.split('\n').forEach((line, index) => {
        const spans = [];
        let match;
        re.lastIndex = 0;
        while ((match = re.exec(line)) !== null) {
          spans.push([match.index, match.index + match[0].length]);
          if (match[0] === '') re.lastIndex++; // avoid looping on empty matches
        }
        if (spans.length) hits.push({ index, spans });
      });
      return hits;
    });
  }

  /** Runs `findMatches` in a worker; rejects on timeout, resolves null on Ctrl+C. */
  const searchInWorker = (texts) =>
    new Promise((resolve, reject) => {
      const source =
        `const findMatches = ${findMatches.toString()};\n` +
        'onmessage = (event) => postMessage(findMatches(...event.data));';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = ctx.worker(url, 'grep');
      const finish = (settle, value) => {
        clearTimeout(timer);
        if (ctx.signal) ctx.signal.removeEventListener('abort', onAbort);
        worker.terminate();
        URL.revokeObjectURL(url);
        settle(value);
      };
      const onAbort = () => finish(resolve, null);
      const timer = setTimeout(() => {
        finish(reject, new Error('the pattern takes too long to match — simplify it'));
      }, SEARCH_BUDGET_MS);
      if (ctx.signal) ctx.signal.addEventListener('abort', onAbort);
      worker.onmessage = (event) => finish(resolve, event.data);
      worker.onerror = (event) => finish(reject, new Error(event.message || 'search failed'));
      worker.postMessage([pattern, ci, texts]);
    });

  /** Matches for every text, or null when the search was interrupted. */
  const search = async (texts) => {
    // No Worker here (tests, exotic browsers): search on the calling thread.
    const canIsolate = typeof Worker === 'function' && typeof ctx.worker === 'function';
    return canIsolate ? searchInWorker(texts) : findMatches(pattern, ci, texts);
  };

  // ---- output -----------------------------------------------------------
  /** Prints the matching lines of one text, each match highlighted. */
  const printHits = (text, hits, name) => {
    const lines = text.split('\n');
    for (const hit of hits) {
      const line = lines[hit.index];
      let html = '';
      let last = 0;
      for (const [start, end] of hit.spans) {
        html += E(line.slice(last, start));
        html += `<span class="accent text-glow">${E(line.slice(start, end))}</span>`;
        last = end;
      }
      html += E(line.slice(last));
      // Optional `name:` (file) prefix and line number.
      const prefix =
        (name ? `<span class="prompt-path">${E(name)}</span><span class="comment">:</span>` : '') +
        (num ? `<span class="comment">${hit.index + 1}:</span>` : '');
      ctx.append(`<div class="ln">${prefix}${html}</div>`);
    }
  };

  /** Searches the given `{ name, text }` sources and prints what matches. */
  const grep = async (sources) => {
    let results;
    try {
      results = await search(sources.map((source) => source.text));
    } catch (err) {
      ctx.error(`grep: ${err.message}`);
      return;
    }
    if (!results) return; // interrupted by Ctrl+C
    sources.forEach((source, i) => printHits(source.text, results[i], source.name));
  };

  // ---- input ------------------------------------------------------------
  // No file given: read from piped stdin (`… | grep pattern`). The pipe may be
  // empty (`grep nomatch file | grep x`): only ctx.piped tells an empty pipe
  // from no pipe at all. Older engines lack it: fall back on "some text came in".
  const piped = typeof ctx.piped === 'boolean' ? ctx.piped : Boolean(ctx.stdin);
  if (!targets && piped) {
    if (ctx.stdin) await grep([{ name: null, text: ctx.stdin }]);
    return;
  }
  if (!targets) {
    ctx.error('grep: no file given (add -r to search recursively)');
    return;
  }

  // Resolve targets into a flat list of file paths (expanding dirs under -r).
  const paths = [];
  const walk = (path) => {
    const res = ctx.list(path);
    if (res.error || !res.entries) return;
    for (const e of res.entries) {
      const child = path === '/' ? `/${e.name}` : `${path}/${e.name}`;
      if (e.type === 'dir') {
        if (rec) walk(child);
      } else {
        paths.push(child);
      }
    }
  };
  for (const t of targets) {
    const rd = ctx.read(t);
    if (rd.error === 'Is a directory') {
      if (rec) walk(t);
      else ctx.error(`grep: ${t}: is a directory (add -r)`);
    } else if (rd.error) {
      ctx.error(`grep: ${t}: ${rd.error}`);
    } else {
      paths.push(t);
    }
  }

  // Like grep, name the file as soon as several operands were given — even if
  // only one of them could be read.
  const showName = rec || targets.length > 1 || paths.length > 1;
  const sources = [];
  for (const p of paths) {
    const rd = ctx.read(p);
    if (rd.error) continue;
    sources.push({ name: showName ? p : null, text: rd.content });
  }
  await grep(sources);
---
