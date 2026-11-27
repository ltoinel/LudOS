/**
 * Formats the `js:` block of every command (`root/bin/*.md`) with Prettier,
 * using the project's own style (`.prettierrc.json`) — the commands' code must
 * stay readable source (one statement per line), and Prettier itself ignores
 * `root/` because the frontmatter is parsed verbatim.
 *
 *   node scripts/format-commands.ts           rewrite the blocks in place
 *   node scripts/format-commands.ts --check   only report unformatted files
 *
 * Only the code changes: the frontmatter keys, the manual and the markdown body
 * are left untouched. A block is an async function body (top-level `await` /
 * `return`), which Prettier's Babel parser accepts as is.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as prettier from 'prettier';

const here = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(here, '..', 'root', 'bin');
const checkOnly = process.argv.includes('--check');

/** The project's Prettier options, minus what only applies to other file types. */
const projectOptions = (await prettier.resolveConfig(join(here, 'command.js'))) ?? {};
const options: prettier.Options = {
  ...projectOptions,
  plugins: [],
  overrides: undefined,
  parser: 'babel',
};

/** Line range `[start, end)` of the code inside a file's `js: |` block, if any. */
function jsBlockRange(lines: string[]): [number, number] | null {
  const key = lines.findIndex((line) => /^js:\s*\|\s*$/.test(line));
  if (key < 0) return null;
  let end = key + 1;
  // The block runs over indented and blank lines, up to the next column-0 line.
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
  return [key + 1, end];
}

/** The file with its `js:` block formatted (unchanged when it has none). */
async function formatCommand(raw: string): Promise<string> {
  const lines = raw.split('\n');
  const range = jsBlockRange(lines);
  if (!range) return raw;
  const [start, end] = range;
  // Mirror the parser (src/lib/commands.ts): each line loses its two-space indent.
  const code = lines
    .slice(start, end)
    .map((line) => line.replace(/^ {2}/, ''))
    .join('\n');
  const formatted = (await prettier.format(code, options)).replace(/\s+$/, '');
  // Re-indent every line, including the continuation lines of a multi-line
  // template literal, so the parser hands back exactly the formatted code.
  const block = formatted.split('\n').map((line) => (line === '' ? '' : `  ${line}`));
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join('\n');
}

const unformatted: string[] = [];
for (const file of readdirSync(commandsDir)
  .filter((name) => name.endsWith('.md'))
  .sort()) {
  const path = join(commandsDir, file);
  const raw = readFileSync(path, 'utf8');
  let formatted: string;
  try {
    formatted = await formatCommand(raw);
  } catch (err) {
    console.error(`✗ ${file}: ${(err as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
    continue;
  }
  if (formatted === raw) continue;
  unformatted.push(file);
  if (!checkOnly) writeFileSync(path, formatted);
}

if (checkOnly && unformatted.length) {
  console.error(`✗ ${unformatted.length} command(s) need formatting — run: npm run format`);
  for (const file of unformatted) console.error(`  - ${file}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  const verb = checkOnly ? 'checked' : `formatted (${unformatted.length} changed)`;
  console.log(`✓ command code ${verb}.`);
}
