/* ------------------------------------------------------------------------- *
 * Shell command-line parsing.
 *
 * Pure, DOM-free splitting of a typed line into a pipeline of stages plus an
 * optional trailing output redirection — the syntax layer behind `|`, `>` and
 * `>>`. Extracted from `terminal.ts` so the parsing rules can be unit-tested
 * without a running shell. Execution (dispatch, capture, file writes) stays in
 * `executor.ts` / `terminal.ts`.
 * ------------------------------------------------------------------------- */

/** One pipeline stage: a command name and its arguments (tokens after it). */
export interface Stage {
  /** The command name (first token); '' for an empty stage. */
  name: string;
  /** Arguments — the whitespace-separated tokens after the name. */
  args: string[];
  /** The trimmed stage text, as typed (without any redirection). */
  raw: string;
}

/** A trailing output redirection: `> path` (truncate) or `>> path` (append). */
export interface Redirect {
  path: string;
  append: boolean;
}

/** The result of parsing a line: stages, an optional redirect, or an error. */
export interface ParsedLine {
  stages: Stage[];
  redirect: Redirect | null;
  /** A user-facing syntax error (e.g. an empty pipe stage); stages is then empty. */
  error?: string;
}

/** A lexical token: a word (quotes already removed) or an operator. */
type Token =
  | { kind: 'word'; value: string; start: number }
  | { kind: 'pipe'; start: number }
  | { kind: 'redirect'; append: boolean; start: number };

/**
 * Splits a line into words and operators in a single pass, honoring single and
 * double quotes: inside quotes, whitespace, `|` and `>` are literal, and the
 * quotes themselves are stripped (`grep "a | b"` searches for `a | b`).
 * Adjacent quoted and unquoted runs concatenate, as in a shell
 * (`--re="a b"` -> `--re=a b`). An unterminated quote runs to end of input.
 */
function lex(line: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let start = -1; // index where the current word began; -1 = no word open
  let quote = ''; // '', '"' or "'" — the open quote, if any
  const flush = (): void => {
    if (start >= 0) tokens.push({ kind: 'word', value: cur, start });
    cur = '';
    start = -1;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      if (start < 0) start = i;
      quote = ch;
    } else if (ch === '|') {
      flush();
      tokens.push({ kind: 'pipe', start: i });
    } else if (ch === '>') {
      flush();
      const append = line[i + 1] === '>';
      tokens.push({ kind: 'redirect', append, start: i });
      if (append) i++;
    } else if (/\s/.test(ch)) {
      flush();
    } else {
      if (start < 0) start = i;
      cur += ch;
    }
  }
  flush();
  return tokens;
}

/**
 * Parses a typed command line into a pipeline of stages plus an optional
 * trailing redirection. Mirrors a minimal shell:
 *  - `a | b | c` becomes three stages; each stage's stdout feeds the next.
 *  - `> file` / `>> file` in the final stage redirects its output (the last
 *    redirection wins, as in a shell).
 *  - an empty stage (`a |`, `| b`, `a || b`) is a syntax error.
 *  - operators inside quotes are literal text.
 *
 * Pure: it never touches the DOM or filesystem — the caller dispatches stages.
 */
export function parseCommandLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed === '') return { stages: [], redirect: null };

  // Group tokens into stages at each pipe.
  const groups: Token[][] = [[]];
  for (const t of lex(trimmed)) {
    if (t.kind === 'pipe') groups.push([]);
    else groups[groups.length - 1].push(t);
  }

  let redirect: Redirect | null = null;
  const stages: Stage[] = [];
  let from = 0; // start of the current stage's text in `trimmed`
  for (let g = 0; g < groups.length; g++) {
    const toks = groups[g];
    const last = g === groups.length - 1;
    const words: string[] = [];
    let rawEnd = -1; // where the stage text stops (first redirection), if any
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const next = toks[i + 1];
      // A redirection needs a command before it and a target after it; a
      // leading `>` (no command) falls through as a normal (unknown) word.
      if (t.kind === 'redirect' && last && words.length && next?.kind === 'word') {
        redirect = { path: next.value, append: t.append };
        if (rawEnd < 0) rawEnd = t.start;
        i++; // consume the target
      } else if (t.kind === 'redirect') {
        words.push(t.append ? '>>' : '>');
      } else if (t.kind === 'word') {
        words.push(t.value);
      }
    }
    // The stage's raw text runs up to the next pipe (or the redirection).
    const pipeAt = last ? trimmed.length : nextPipe(trimmed, from);
    const raw = trimmed.slice(from, rawEnd >= 0 ? rawEnd : pipeAt).trim();
    from = pipeAt + 1;
    if (!words.length) return { stages: [], redirect, error: 'syntax error near `|`' };
    stages.push({ name: words[0], args: words.slice(1), raw });
  }
  return { stages, redirect };
}

/** Index of the next unquoted `|` at or after `from` (or the line length). */
function nextPipe(line: string, from: number): number {
  let quote = '';
  for (let i = from; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '|') return i;
  }
  return line.length;
}
