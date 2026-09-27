---
name: fortune
desc: a random quote or developer joke — e.g. fortune, fortune -j
alias: quote
demo: fortune
seo_title: Random quote & programming joke — fortune
man: |
  # FORTUNE(6)

  ## NAME
  fortune — print a random inspiring quote or developer joke

  ## SYNOPSIS
  fortune [-q | -j]

  ## DESCRIPTION
  Prints a random quote (from dummyjson.com) or a programming joke
  (from JokeAPI, safe mode) — picked at random unless an option says
  which. Both are free public APIs queried directly from your browser;
  if they are unreachable, a built-in fortune is shown instead.

  ## OPTIONS
  -q, --quote   an inspiring quote
  -j, --joke    a developer joke

  ## HOW IT WORKS
  With no option, a coin flip picks between a quote and a joke. Quotes come
  from the dummyjson.com public quotes API; programming jokes from JokeAPI
  with its safe mode on, so no offensive content is returned. The request has
  a short timeout: offline or rate-limited, fortune falls back to a small
  built-in collection.

  ## USE CASES
  - a quick smile or some inspiration between two commands;
  - a random line for a presentation, a commit message or a status update;
  - chain it: fortune | say reads it aloud, fortune | asciiart -s small
    prints it big.

  ## NOTES
  The name comes from the classic Unix fortune program, which printed a
  random epigram at login.

  ## EXAMPLES
  fortune
  fortune -j
  quote -q

  ## SEE ALSO
  say, asciiart, motd
js: |
  const E = ctx.escape;
  const a = ctx.args[0];
  if (a && !['-q', '--quote', '-j', '--joke'].includes(a)) {
    ctx.error('usage: fortune [-q | -j]');
    return;
  }
  const kind = a === '-q' || a === '--quote' ? 'quote'
    : a === '-j' || a === '--joke' ? 'joke'
      : Math.random() < 0.5 ? 'quote' : 'joke';

  // Offline fallbacks, so the command always has something to say.
  const LOCAL = {
    quote: [
      ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
      ['Make it work, make it right, make it fast.', 'Kent Beck'],
      ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
      ['Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
    ],
    joke: [
      'There are 10 kinds of people: those who understand binary and those who don\'t.',
      'A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"',
      'It works on my machine. — Then we\'ll ship your machine.',
      'Why do programmers prefer dark mode? Because light attracts bugs.',
    ],
  };

  // Fetch with a short timeout, cancelled by Ctrl+C as well.
  const get = async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    ctx.signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  let text;
  let by = '';
  try {
    if (kind === 'quote') {
      const q = await get('https://dummyjson.com/quotes/random');
      text = q.quote;
      by = q.author;
    } else {
      const j = await get('https://v2.jokeapi.dev/joke/Programming?safe-mode');
      text = j.type === 'twopart' ? `${j.setup}\n${j.delivery}` : j.joke;
    }
    if (!text) throw new Error('empty answer');
  } catch {
    if (ctx.signal?.aborted) return;
    const pool = LOCAL[kind];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    [text, by] = Array.isArray(pick) ? pick : [pick, ''];
  }

  const lines = text.split('\n').map((l) => `<div class="ln"><span class="accent text-glow">${E(l)}</span></div>`);
  ctx.append(`${kind === 'quote' ? '<div class="ln comment">“</div>' : ''}${lines.join('')}` +
    (by ? `<div class="ln comment">    — ${E(by)}</div>` : ''));
---
