/**
 * Standalone validator for `root/bin/*.md`, run via `npm run check:commands`.
 *
 * Reuses the exact parsing and validation the Astro build relies on (from
 * `src/lib/commands.ts`), but reads the files directly with `node:fs` instead of
 * `import.meta.glob`, so it runs on its own — handy in CI or a pre-commit hook,
 * without paying for a full `astro build`.
 *
 * On top of the build's checks (frontmatter, JS syntax, duplicate names), the
 * `js:` blocks are linted with ESLint's recommended rules — they are plain JS
 * run through `AsyncFunction`, so this is their only static analysis (undefined
 * variables, unreachable code, …). `ctx` is the injected parameter; browser
 * globals are allowed.
 *
 * Exit code: 0 when every command is valid, 1 when any problem is found.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import js from '@eslint/js';
import { ESLint } from 'eslint';
import globals from 'globals';
import { parseCommand, validateCommands } from '../src/lib/commands.ts';

const here = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(here, '..', 'root', 'bin');

const entries: [string, string][] = readdirSync(commandsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => [f, readFileSync(join(commandsDir, f), 'utf8')]);

const { defs, errors } = validateCommands(entries);

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    js.configs.recommended,
    {
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
        globals: { ...globals.browser },
      },
    },
  ],
});

/** 1-based line (in the .md file) of the first code line of the `js: |` block. */
function jsStartLine(raw: string): number {
  const lines = raw.split('\n');
  const at = lines.findIndex((l) => /^js:\s*\|\s*$/.test(l));
  let i = at + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  return i + 1;
}

for (const [file, raw] of entries) {
  const def = parseCommand(raw);
  if (!def.js) continue;
  // The block is an async function body (top-level await/return): lint it
  // wrapped as one, then map line numbers back onto the .md file.
  const [result] = await eslint.lintText(`(async function (ctx) {\n${def.js}\n});\n`);
  const offset = jsStartLine(raw) - 2;
  for (const m of result.messages) {
    errors.push(`${file}:${m.line + offset}:${m.column} ${m.message} (${m.ruleId ?? 'parse'})`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in ${entries.length} command file(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ ${defs.length} command(s) valid (${entries.length} file(s) checked).`);
