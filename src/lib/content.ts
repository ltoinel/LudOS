/**
 * Build-time content loader, shared by `Terminal.astro`, the per-command pages
 * (`[command].astro`) and the sitemap.
 *
 * The fake filesystem is modeled by the on-disk `root/` directory tree: it is
 * the single source of truth for both the browsable filesystem (the whole tree)
 * and the executable commands (everything under `root/bin/`). This module walks
 * `root/` once and derives the nested VFS tree + the command registry from it.
 *
 * NOTE: build-time only (uses `import.meta.glob`); never imported by the client
 * `terminal.ts`, which reads the data back from injected JSON.
 */

import { statSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { validateCommands } from './commands.ts';
import type { CmdDef } from './commands.ts';
import { escapeHtml, isSafeHref } from './html.ts';
import type { VDir, VFile, VNode } from './vfs.ts';
import { site, siteHost } from '../site.config.ts';
import pkg from '../../package.json';

export type { CmdDef, VDir, VFile, VNode };

// Walk the whole `root/` tree once. `exhaustive` includes dotfiles (.bashrc, …);
// `?raw` gives each file's text content.
const rawEntries = Object.entries(
  import.meta.glob('../../root/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
    exhaustive: true,
  }),
  // Strip everything up to the FIRST `root/` (lazy: the project root dir, even when
  // a child is itself named `root`, e.g. `/root/`).
).map(([path, raw]) => [path.replace(/^.*?\/root\//, ''), raw as string] as [string, string]);

/**
 * Build-time variables usable in any `root/` file, so decor files never
 * hard-code site-specific values: `%HOST%` (e.g. `example.com`), `%URL%`
 * (`https://example.com`) and `%VERSION%` (the package.json release).
 */
const TEMPLATE_VARS: Record<string, string> = {
  '%HOST%': siteHost,
  '%URL%': site.url,
  '%VERSION%': pkg.version,
};
const fillTemplate = (text: string): string =>
  text.replace(/%(HOST|URL|VERSION)%/g, (key) => TEMPLATE_VARS[key]);

/** The whole fake filesystem as a nested tree (injected as `#shell-fs`). */
export const tree: VDir = (() => {
  const root: VDir = { type: 'dir', children: {} };
  for (const [rel, content] of rawEntries) {
    const parts = rel.split('/');
    // Create the intermediate directories.
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const next = dir.children[seg];
      if (next && next.type === 'dir') dir = next;
      else {
        const made: VDir = { type: 'dir', children: {} };
        dir.children[seg] = made;
        dir = made;
      }
    }
    let name = parts[parts.length - 1];
    if (name === '.keep') continue; // placeholder: only materializes its parent dir
    // Commands live in `bin/` as `*.md`; surface them as bare binary names. Their
    // source is NOT embedded in the browsable filesystem — it already ships,
    // parsed, in the command registry (`commandDefs`). Keeping it here too would
    // duplicate ~50 KB of man+js per page, so `/bin` files carry only a tiny stub
    // (enough for a friendly `cat`, while `ls`/`tree`/completion still work).
    const isBin = parts.length >= 2 && parts[parts.length - 2] === 'bin';
    if (isBin) name = name.replace(/\.md$/, '');
    dir.children[name] = {
      type: 'file',
      content: isBin ? `${name} — shell command. See: man ${name}\n` : fillTemplate(content),
    };
  }
  return root;
})();

/**
 * Minify a command's `js` block before it ships in `/shell-commands.json`.
 *
 * The block is an *async function body* (top-level `await`/`return`), invalid on
 * its own — so we wrap it in `async function (ctx){…}`, minify, then slice the
 * body back out. Identifiers are kept (`minifyIdentifiers:false`): `ctx` is the
 * runtime-injected parameter and locals can be referenced via the AsyncFunction
 * scope, so renaming them would be unsafe; only whitespace, comments and syntax
 * are compacted (~30 % smaller). This is size/tidiness, NOT real protection —
 * client JS is always recoverable. On any failure, fall back to the source.
 */
function minifyJs(js: string): string {
  try {
    const out = transformSync(`async function __cmd(ctx){\n${js}\n}`, {
      loader: 'js',
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: false,
    }).code.trim();
    const open = out.indexOf('{');
    const close = out.lastIndexOf('}');
    return open >= 0 && close > open ? out.slice(open + 1, close).trim() : js;
  } catch {
    return js; // never let a minify hiccup break the build
  }
}

/** Commands (one per `root/bin/*.md`), parsed and validated at build time. */
export const commandDefs: CmdDef[] = (() => {
  const binEntries: [string, string][] = rawEntries
    .filter(([rel]) => /^bin\/[^/]+\.md$/.test(rel))
    .map(([rel, raw]) => [rel.split('/').pop() as string, raw]);
  const { defs, errors } = validateCommands(binEntries);
  if (errors.length)
    throw new Error(`Invalid command definition(s):\n  - ${errors.join('\n  - ')}`);
  // Ship a minified `js` block (the validator already parsed the source above).
  return defs.map((d) => (d.js ? { ...d, js: minifyJs(d.js) } : d));
})();

/** Home documents (`~`) eligible for a landing page: the `.md` files in HOME. */
// Resolve HOME from the configured path (e.g. `/home/guest`) instead of a
// hardcoded name, so renaming the home dir can't silently drop these pages.
const homeNode = site.shell.home
  .replace(/^\/+|\/+$/g, '')
  .split('/')
  .reduce<VNode | undefined>(
    (node, seg) => (node && node.type === 'dir' ? node.children[seg] : undefined),
    tree as VNode,
  );
const homeDir = homeNode?.type === 'dir' ? homeNode : undefined;
const homeDocs: { name: string; content: string }[] =
  homeDir?.type === 'dir'
    ? Object.entries(homeDir.children)
        .filter(([n, node]) => n.endsWith('.md') && node.type === 'file')
        .map(([name, node]) => ({ name, content: (node as VFile).content }))
    : [];

/** Longest meta description we emit (search engines truncate well-formed snippets near here). */
const META_DESC_MAX = 155;

/**
 * Derive SEO meta (title + description) from a markdown document: the first ATX
 * heading becomes the title; the text that follows, stripped of markdown and
 * flattened to one line, becomes the description. Falls back to the slug.
 */
function metaFromMarkdown(md: string, slug: string): { title: string; desc: string } {
  const lines = md.split('\n').map((l) => l.trim());
  const heading = lines.find((l) => /^#{1,6}\s+/.test(l));
  const title = heading ? heading.replace(/^#{1,6}\s+/, '').trim() : slug;
  const text = lines
    .filter((l) => l && !/^#{1,6}\s+/.test(l)) // drop blank lines and headings
    .map((l) => l.replace(/^[-*]\s+/, '')) // de-list bullet items
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/[*_`>#]/g, '') // strip emphasis / code / quote markers
    .replace(/\s+/g, ' ')
    .trim();
  const desc =
    text.length > META_DESC_MAX ? `${text.slice(0, META_DESC_MAX - 1).trimEnd()}…` : text;
  return { title, desc: desc || `document ${slug}` };
}

// Inline markdown -> HTML, applied to already-escaped text. Links first so a `*`
// or backtick inside a URL can't be mistaken for emphasis/code; then code, then
// bold before italic (so `**x**` isn't eaten by the single-`*` rule). A link
// with an unsafe scheme (`javascript:`, …) keeps only its text.
const inlineMd = (s: string): string =>
  escapeHtml(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
      isSafeHref(url) ? `<a href="${url}" rel="noopener">${text}</a>` : text,
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

/**
 * Render a command's `man` markdown to semantic HTML for server-side SEO: ATX
 * headings become <h1>/<h2>, and consecutive non-blank lines are joined into a
 * <p>. The terminal still renders the rich, interactive version on the client;
 * this is the crawlable mirror, emitted inside a visually-hidden block.
 */
export function manToHtml(md: string, isLinkable: (name: string) => boolean = () => false): string {
  let html = '';
  let para: string[] = [];
  let list: string[] = [];
  let inSeeAlso = false;
  const flushPara = () => {
    if (para.length) {
      const joined = para.join(' ');
      // In "SEE ALSO", turn each command name that owns a page into a link to it.
      const inner = inSeeAlso
        ? escapeHtml(joined).replace(/[\w-]+/g, (tok) =>
            isLinkable(tok) ? `<a href="/${tok}/">${tok}</a>` : tok,
          )
        : inlineMd(joined);
      html += `<p>${inner}</p>`;
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html += `<ul>${list.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</ul>`;
      list = [];
    }
  };
  const flush = () => {
    flushPara();
    flushList();
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    const bq = line.match(/^>\s?(.*)$/);
    if (h2) {
      flush();
      inSeeAlso = h2[1].trim() === 'SEE ALSO';
      html += `<h2>${inlineMd(h2[1])}</h2>`;
    } else if (h1) {
      flush();
      inSeeAlso = false;
      html += `<h1>${inlineMd(h1[1])}</h1>`;
    } else if (li) {
      flushPara();
      list.push(li[1]); // open / extend a list
    } else if (bq) {
      flush();
      html += `<blockquote><p>${inlineMd(bq[1])}</p></blockquote>`;
    } else if (line === '') {
      flush();
      inSeeAlso = false; // a blank line ends the block
    } else if (list.length) {
      list[list.length - 1] += ` ${line}`; // wrapped continuation of a list item
    } else {
      para.push(line);
    }
  }
  flush();
  return html;
}

/** Extract the `## DESCRIPTION` section of a man page as a clamped meta description. */
export function manMetaDescription(md: string): string {
  // Capture from the DESCRIPTION heading up to the next `## ` section or the end.
  // (No `m` flag: with it, `$` would match the first line break and truncate.)
  const m = md.match(/##\s+DESCRIPTION\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!m) return '';
  const text = m[1]
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > META_DESC_MAX ? `${text.slice(0, META_DESC_MAX - 1).trimEnd()}…` : text;
}

export interface Route {
  /** URL slug, also the command/document run on load (e.g. `whoami`, `about`). */
  slug: string;
  /** Page `<title>` seed. */
  title: string;
  /** Page meta description. */
  desc: string;
  /**
   * Server-rendered, crawlable HTML for home documents (markdown). Commands have
   * no `body` — their crawlable mirror is derived from the `man` page instead.
   */
  body?: string;
  /** Kept out of search engines (`noindex`, not in the sitemap). */
  noindex?: boolean;
  /** Page `<title>` for search engines, when it should differ from `title`. */
  seoTitle?: string;
}

/**
 * The short form of a command's `desc`: the part before its examples
 * ("generate a password — e.g. password 24" → "generate a password").
 */
export const shortDesc = (desc: string): string =>
  desc.split(/ — e\.g\.| \(e\.g\.|, e\.g\./)[0].trim();

/**
 * Rewrites a man page for its crawlable mirror: the page heading becomes the
 * NAME line ("sha256sum — compute SHA-256 checksums"), a far better <h1> than
 * the Unix-style "SHA256SUM(1)", and the now redundant NAME section is dropped.
 */
export function manForPage(man: string): string {
  // The NAME paragraph may wrap over several lines: join them.
  const section = man.match(/^##\s+NAME\s*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/m);
  const name = section?.[1]
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ');
  if (!name) return man;
  return man
    .replace(/^##\s+NAME\s*\n[\s\S]*?(?=\n##\s|(?![\s\S]))/m, '')
    .replace(/^#\s+.*$/m, `# ${name}`);
}

/** Deep-linkable routes: content commands + home documents (one page each). */
export const routes: Route[] = [
  ...commandDefs
    .filter((c) => c.page !== false) // opted out via `page: false` in the frontmatter
    .map((c) => ({
      slug: c.name,
      title: c.name,
      desc: c.desc || `command ${c.name}`,
      noindex: c.index === false, // thin page: reachable, but not indexed
      // Worded like a search ("QR code generator — …"), else "qr — render …".
      seoTitle: c.seoTitle || (c.desc ? `${c.name} — ${shortDesc(c.desc)}` : undefined),
    })),
  ...homeDocs.map(({ name, content }) => {
    const slug = name.replace(/\.md$/, '');
    return { slug, ...metaFromMarkdown(content, slug), body: manToHtml(content) };
  }),
];

/** `root/` mirror of the configured HOME (e.g. `/home/guest` -> `root/home/guest`). */
const HOME_DIR = `root${site.shell.home.replace(/\/+$/, '')}`;

/**
 * W3C date (YYYY-MM-DD) of a route's source file: commands live in `root/bin/`,
 * home documents in HOME. Returns null if neither exists. Build-time only — used
 * by the sitemap (`<lastmod>`) and the JSON-LD (`dateModified`).
 */
export function lastmod(slug: string): string | null {
  for (const path of [`root/bin/${slug}.md`, `${HOME_DIR}/${slug}.md`]) {
    try {
      return statSync(path).mtime.toISOString().slice(0, 10);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** The routes search engines should see (sitemap, internal link mesh). */
export const indexedRoutes: Route[] = routes.filter((r) => !r.noindex);

/** Most recent `lastmod` across every route — the home page's effective date. */
export function latestLastmod(): string | null {
  return (
    routes
      .map((r) => lastmod(r.slug))
      .filter((d): d is string => d !== null)
      .sort()
      .pop() ?? null
  );
}
