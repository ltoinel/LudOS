/**
 * Renders the deployment configs from their templates (`deploy/*.template`)
 * into `deploy/generated/` — nginx server block, systemd unit of the `msg`
 * relay and its environment file — so no domain or path is hard-coded:
 *
 *   {{HOST}}      the host name of `site.url` (src/site.config.ts)
 *   {{APP_DIR}}   this checkout's absolute path (where `dist/` is built)
 *   {{BASE_DIR}}  its parent directory (secrets, certs, runtime data)
 *
 * Run it on the server, from the checkout that is served: `npm run deploy:config`.
 */
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteHost } from '../src/site.config.ts';

const realAppDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Prefer the path as typed (the shell's PWD) over the resolved
// one: with a symlinked tree (/var/www → /data/www) the configs should keep
// the familiar logical path, as long as it points to this same checkout.
const sameDir = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};
const typedDir = process.env.PWD || process.env.INIT_CWD || '';
const appDir = typedDir && sameDir(typedDir, realAppDir) ? typedDir : realAppDir;
const deployDir = join(realAppDir, 'deploy');
const outDir = join(deployDir, 'generated');

const vars: Record<string, string> = {
  HOST: siteHost,
  APP_DIR: appDir,
  BASE_DIR: dirname(appDir),
};

mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(deployDir).filter((f) => f.endsWith('.template'))) {
  const rendered = readFileSync(join(deployDir, file), 'utf8').replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => vars[key] ?? match,
  );
  const target = join(outDir, file.replace(/\.template$/, ''));
  writeFileSync(target, rendered);
  console.log(`✓ ${target}`);
}
