# AGENTS.md

Guide for AI coding agents (and humans) working in this repository. Read this
before making changes. For an in-depth, feature-by-feature tour, see
[`README.md`](./README.md) — this file focuses on _how to work here_.

## What this project is

**LudOS**, the personal portal **`ludovic.toinel.com`** — a static site with a **terminal /
phosphor aesthetic**, built with **[Astro](https://astro.build) 5 +
[Tailwind CSS](https://tailwindcss.com) v4**. Zero framework JS (no React/Vue):
the interactivity is a hand-written shell engine. Two themes (CRT green with a
Matrix rain background, and amber monochrome), self-hosted fonts (VT323 +
IBM Plex Mono), CRT effects (scanlines, grain, vignette, glow).

The home page is a single, draggable/resizable terminal window that simulates an
SSH session; visitors type commands to explore content. Deep links
(`/[command]`) render one static, crawlable page per command for SEO.

## Golden rules

- **`src/site.config.ts` is the single source of truth** for identity, SEO,
  links/profiles and shell settings. It is **gitignored** (personal data) and
  auto-created from `src/site.config.example.ts` on install. When adding a
  config field, add it to **both** the real file (if present) and the
  `*.example.ts` template, and update the `SiteConfig` types.
- **Content lives in the `root/` tree**, not in code. `root/home/<user>/*.md`
  are browsable documents; `root/bin/*.md` are commands (one file = one command,
  discovered at build time). Don't hardcode content in components.
- **Everything in English**: code comments, docs, and all user-facing text —
  shell output, labels, `aria-label`s, command `desc`/`man`, the documents in
  `root/home/`, and the site config texts (`site.lang` is `en`).
- **No hard-coded domain**: the site's domain is `site.url` in
  `src/site.config.ts`, exported as `siteHost`. Everything else derives from it
  — the shell prompt (which also adapts to the serving host at runtime),
  `root/` decor files (`%HOST%`, `%URL%`, `%VERSION%` placeholders), robots /
  humans / manifest endpoints, relay defaults, and the deploy templates.
- **`dist/` is generated output** (the web root). Never edit it by hand — it is
  overwritten by `npm run build` and is gitignored.
- Keep it **framework-free and dependency-light**. Prefer plain TS + CSS custom
  properties over new dependencies; discuss before adding one.
- **Each command carries its own code.** A `root/bin/<name>.md` is
  self-contained: all of its logic lives in its `js:` block — no
  command-specific module in `src/lib/`, no third-party library in
  `package.json`. Commands sharing data do it through a documented storage key
  (e.g. `todo` / `kanban` both use localStorage `ltsh.todo`), not through a
  shared module.
- **`src/lib/` is the transverse core engine only**: shell session, parser,
  executor, VFS, windows, themes, the `ctx` contract, the Web Worker registry
  and the central LLM manager. The WebLLM engine (`@mlc-ai/web-llm`, loaded
  lazily by `llm.ts`) is the one third-party runtime library.
- **Command code is readable source**: one statement per line, descriptive
  names, comments on the _why_ — never minified or compressed in the `.md`.

## Setup & commands

Requires **Node ≥ 22.18** (native TS execution). The site itself is fully
static; the only server-side piece is the `msg` email relay (`server/`, plain
Node, zero dependencies, mails through the local `sendmail`).

```bash
npm install        # also bootstraps src/site.config.ts from the example
npm run dev        # HMR dev server -> http://localhost:4321
```

Run these before considering a change done — the same set runs in CI on every
push/PR (`.github/workflows/ci.yml` on GitHub, `azure-pipelines.yml` on Azure
DevOps, which also publishes JUnit test results and Cobertura coverage via
`npm run test:ci`):

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run check:commands # validate root/bin/*.md (frontmatter, JS syntax, dupes)
npm run check          # astro check (types / diagnostics)
npm test               # Vitest
npm run build          # static build -> dist/
```

Releases: `npm version <patch|minor|major> && git push --follow-tags`. The
`v*.*.*` tag triggers `.github/workflows/release.yml`, which re-runs the checks,
builds `dist/` from the example config and publishes a GitHub release with
auto-generated notes and `ludos-vX.Y.Z.{tar.gz,zip,sha256}` assets. The tag
must match the `package.json` version.

`npm run format` auto-fixes formatting. Prefer the narrow command while
iterating (e.g. `npm test`) and the full sweep before finishing.

## Where things live

| Area                               | Path                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| Identity / SEO / shell config      | `src/site.config.ts` (+ `.example.ts` template)                 |
| Home page (terminal)               | `src/pages/index.astro`                                         |
| Per-command static pages           | `src/pages/[command].astro`                                     |
| Generated endpoints                | `src/pages/{sitemap.xml,sw.js,shell-*.json}.ts`                 |
| `<head>` / SEO / fonts / SW        | `src/layouts/Layout.astro`                                      |
| UI components                      | `src/components/*.astro`                                        |
| Shell session (I/O, prompt, `ctx`) | `src/lib/terminal.ts`                                           |
| `ctx` API contract (typed)         | `src/lib/shell-ctx.ts`                                          |
| Pipelines / redirections / capture | `src/lib/executor.ts`                                           |
| Virtual filesystem                 | `src/lib/vfs.ts`                                                |
| Local LLM (only WebLLM loader)     | `src/lib/llm.ts`                                                |
| Build-time content walker          | `src/lib/content.ts`                                            |
| Command parsing / validation       | `src/lib/commands.ts`, `src/lib/shell-parse.ts`                 |
| `msg` email relay (Node)           | `server/msg.ts` (pure logic), `server/msg-server.ts`            |
| Deployment (nginx, systemd)        | `deploy/*.template` → `npm run deploy:config`                   |
| Themes                             | `src/lib/themes.ts`, `src/styles/global.css`                    |
| Fake filesystem (content)          | `root/` (`bin/`, `home/guest/`, `etc/`, `var/`, …)              |
| Static assets                      | `public/` (icons, fonts, manifest, OG image, `vendor/` bundles) |
| Tests                              | `tests/*.test.ts` (Vitest)                                      |

## Conventions

- **Formatting** (Prettier, enforced): single quotes, semicolons, 2-space
  indent, `printWidth` 100, trailing commas. LF line endings, final newline
  (see `.editorconfig`). Don't fight the formatter — run `npm run format`.
- **TypeScript**: strict (`astro/tsconfigs/strict`). Keep it typed; avoid `any`.
- **Astro components**: scoped `<style>` blocks; use the CSS custom properties
  from `global.css` (`--fg`, `--green`, `--bg-bar`, `--glow`, …) so both themes
  work. Icons come from [astro-icon](https://www.astroicon.dev/) with the
  `lucide` set (e.g. `<Icon name="lucide:github" />`).
- **Comments** explain the _why_, in English, at the density of the surrounding
  code. Match existing style rather than introducing your own.

## Adding a command

Create `root/bin/<name>.md` with frontmatter:

```markdown
---
name: date
desc: date and time # shown by `help` (user-facing)
alias: dt # optional, comma/space-separated
page: false # optional: no /<name> landing page (control / needs args / side effect)
index: false # optional: landing page kept out of search engines (thin content)
demo: date # optional: run on the landing page instead of the manual (%HOST% / %URL%)
man: | # optional manual page (shown by `man`)
  ...
js: | # optional; omit for a static command
  ctx.line(new Date().toString());
---
```

- **Static** command (no `js`): the markdown body is printed as-is.
- **Dynamic** command: the `js` runs with a `ctx` helper object — its typed
  contract is `src/lib/shell-ctx.ts` (keep it and the README in sync when you
  extend `ctx`). Use `ctx.llm` for anything WebLLM; never import the engine
  directly. See existing `root/bin/*.md` for patterns.
- **Self-contained** (see Golden rules): write the logic in the `js` block
  itself — no third-party library, no helper module in `src/lib/`. Extend
  `ctx` only for genuinely transverse engine features.
- Tests for command logic run the `.md` itself through `tests/run-command.ts`
  (a fake `ctx`) — see `tests/commands-runtime.test.ts`.
- Validate with `npm run check:commands` (syntax + ESLint on the `js` block) and
  add/adjust a test if it has logic.

> ⚠️ Dynamic commands run via `AsyncFunction` (eval). Only add **trusted**
> commands — never wire in untrusted/remote code.

## Testing

Unit tests use **Vitest** (`tests/*.test.ts`) and cover the pure logic: parsing,
pipeline execution, the VFS, validation, rendering and the `msg` relay. When you
change shell parsing/execution, command validation, content walking or the
relay, add or update a test. There is no browser E2E
layer — verify interactive behaviour with `npm run dev`.

## Safety & gotchas

- Never commit secrets. `msg.env` (relay config), `src/site.config.ts`, `data/`
  and `dist/` are gitignored on purpose — keep them out of commits.
- The deployed **CSP** (`deploy/nginx.conf.template`) allows `unsafe-eval` (command
  engine) and `blob:` workers (`hashcat`); it's a hardening layer, not a sandbox.
- **Deployment**: `DocumentRoot` points at `dist/`; build with
  `npm install && npm run build`. The `msg` relay runs as the
  `msg-relay` systemd service behind nginx's `/api/msg` proxy; its configs are
  rendered from `deploy/*.template` by `npm run deploy:config` (see the README). **On the production host the working copy _is_
  the served site**: `npm run build` there publishes immediately.
- Commit messages: imperative, in English (see `git log`). Only commit or push
  when the user asks; branch off `main` first if needed.
