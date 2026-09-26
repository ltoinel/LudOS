/**
 * Keeps the hashed assets of previous builds alive across `npm run build`.
 *
 * `astro build` empties `dist/`, so the `/_astro/*` files of the previous build
 * disappear. But a page cached by a browser or a CDN still references them,
 * and would load with no CSS and no JS until its cache expires. So:
 *
 *   prebuild  (`stash`)   copy the current dist/_astro files into an archive;
 *   postbuild (`restore`) put back every archived file the new build lacks,
 *                         and forget files unused for more than MAX_AGE_DAYS
 *                         (the longest a page may stay cached).
 *
 * Asset names are content hashes, so an old file never collides with a new one.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_AGE_DAYS = 31;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'dist', '_astro');
const archiveDir = join(root, '.assets-archive');

const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []);
const mode = process.argv[2];

if (mode === 'stash') {
  // The archive copy's mtime records the last build that used the file.
  mkdirSync(archiveDir, { recursive: true });
  for (const name of files(assetsDir)) {
    copyFileSync(join(assetsDir, name), join(archiveDir, name));
  }
} else if (mode === 'restore') {
  const current = new Set(files(assetsDir));
  const oldest = Date.now() - MAX_AGE_DAYS * 86_400_000;
  let restored = 0;
  let expired = 0;
  for (const name of files(archiveDir)) {
    const archived = join(archiveDir, name);
    if (current.has(name)) continue;
    if (statSync(archived).mtimeMs < oldest) {
      rmSync(archived);
      expired++;
    } else {
      copyFileSync(archived, join(assetsDir, name));
      restored++;
    }
  }
  console.log(`keep-assets: ${restored} previous asset(s) kept, ${expired} expired`);
} else {
  console.error('usage: node scripts/keep-assets.ts stash|restore');
  process.exit(1);
}
