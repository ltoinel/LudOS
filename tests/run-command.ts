/**
 * Test harness for the self-contained commands: runs the `js:` block of a
 * `root/bin/<name>.md` file exactly as the shell does (`AsyncFunction('ctx')`),
 * with a fake `ctx` that records output as plain text. Only the members the
 * tested commands use are provided.
 */
import { readFileSync } from 'node:fs';
import { parseCommand } from '../src/lib/commands.ts';
import { escapeHtml } from '../src/lib/html.ts';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  arg: string,
  body: string,
) => (ctx: unknown) => Promise<void>;

/** HTML -> the text a user would see (tags dropped, entities decoded). */
const toText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** An in-memory Web Storage stand-in, installed as `globalThis.localStorage`. */
export function installMemoryStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = String(v)),
    removeItem: (k: string) => void delete data[k],
  };
  return data;
}

export interface CommandResult {
  /** stdout, one entry per printed block (plain text). */
  out: string[];
  /** stderr lines. */
  err: string[];
}

export async function runCommand(
  name: string,
  args: string[] = [],
  opts: { stdin?: string; ctx?: Record<string, unknown> } = {},
): Promise<CommandResult> {
  const raw = readFileSync(new URL(`../root/bin/${name}.md`, import.meta.url), 'utf8');
  const def = parseCommand(raw);
  if (!def.js) throw new Error(`${name} has no js block`);
  const out: string[] = [];
  const err: string[] = [];
  const ctx = {
    args,
    body: def.body,
    stdin: opts.stdin ?? '',
    escape: escapeHtml,
    line: (t: string) => out.push(t),
    raw: (t: string) => out.push(t),
    print: (t: string) => out.push(t),
    sysLine: (t: string) => out.push(t),
    error: (t: string) => err.push(t),
    append: (html: string) => {
      out.push(toText(html));
      return { firstElementChild: null };
    },
    ...opts.ctx, // extra members a test needs (e.g. VFS accessors)
  };
  await new AsyncFunction('ctx', def.js)(ctx);
  return { out, err };
}
