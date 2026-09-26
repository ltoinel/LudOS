/**
 * Refreshes the dynamic badges at the top of README.md — test coverage (from
 * `coverage/coverage-summary.json`, written by `vitest run --coverage`) and
 * the number of shell commands (files in `root/bin/`). Run via
 * `npm run coverage`. Badges are static shields.io images, so the README needs
 * no third-party coverage service.
 *
 * Only the text between the `<!-- badges:dynamic -->` markers is rewritten.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Summary {
  total: { lines: { pct: number } };
}
const summary = JSON.parse(
  readFileSync(join(root, 'coverage', 'coverage-summary.json'), 'utf8'),
) as Summary;
const coverage = summary.total.lines.pct;
const commands = readdirSync(join(root, 'root', 'bin')).filter((f) => f.endsWith('.md')).length;

const color =
  coverage >= 90 ? 'brightgreen' : coverage >= 75 ? 'green' : coverage >= 60 ? 'yellow' : 'red';
const badge = (label: string, message: string, badgeColor: string, alt: string): string =>
  `![${alt}](https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-${badgeColor})`;

const dynamic = [
  badge('coverage', `${coverage.toFixed(1)}%`, color, 'Test coverage'),
  badge('shell commands', String(commands), 'blueviolet', 'Shell commands'),
].join('\n');

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const markers = /(<!-- badges:dynamic -->)[\s\S]*?(<!-- \/badges:dynamic -->)/;
if (!markers.test(readme)) {
  console.error('update-badges: markers <!-- badges:dynamic --> not found in README.md');
  process.exit(1);
}
// The blank line after the opening marker is what Prettier expects there.
writeFileSync(readmePath, readme.replace(markers, `$1\n\n${dynamic}\n$2`));
console.log(`✓ badges: coverage ${coverage.toFixed(1)}%, ${commands} commands`);
