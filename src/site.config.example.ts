/**
 * Single source of truth for everything identity-related: SEO / meta tags,
 * schema.org structured data, and the interactive shell.
 *
 * To reuse this portal, this is the main file to edit — the rest of the code
 * (Layout, JsonLd, Terminal, sitemap, astro.config) derives from it. The browsed
 * content itself lives in the `root/` directory tree.
 *
 * Copy this file to `site.config.ts` and fill it with your own identity.
 * `site.config.ts` is gitignored so your personal config stays out of the repo.
 */

/** A profile / link, surfaced in the `open` command and/or schema.org `sameAs`. */
export interface SiteLink {
  /** Target URL. */
  url: string;
  /** Key for the `open` command (kebab-case). Omit to keep it out of `open`. */
  open?: string;
  /** Extra `open` aliases (e.g. `htb`). */
  aliases?: string[];
  /** Include in schema.org `sameAs` (SEO entity disambiguation). */
  sameAs?: boolean;
}

export const site = {
  /* ----------------------------- identity ----------------------------- */
  name: 'John Doe',
  firstName: 'John',
  lastName: 'Doe',
  gender: 'Male',
  role: 'Fullstack Architect',
  company: 'Example Corp',
  companyUrl: 'https://www.example.com/',
  nationality: 'France',
  birthPlace: 'Paris',
  /** Languages spoken (BCP-47 tags) — schema.org Person `knowsLanguage`. */
  knowsLanguage: ['fr', 'en'],
  /** Short tagline — meta description / Open Graph default. */
  tagline: 'Fullstack Architect. Tech blogger, ethical hacker, photographer.',
  /** Long bio — used as the schema.org Person `description`. */
  bio: 'A short description of who you are, what you do, and what you are passionate about. Used as the schema.org Person description.',
  knowsAbout: [
    'Software architecture',
    'Fullstack development',
    'Innovation',
    'Cybersecurity',
    'Web',
  ],

  /* ----------------------------- site & SEO --------------------------- */
  /** Canonical origin (no trailing slash) — the one place the domain is set. */
  url: 'https://example.com',
  /** Source repository of this portal — the dock's "fork me on GitHub" button
   *  (empty string to hide it). */
  sourceUrl: 'https://github.com/ltoinel/Terminal.com',
  /** Short name of the installable web app (PWA manifest `short_name`). */
  shortName: 'johndoe',
  locale: 'en_US',
  lang: 'en',
  /** Absolute-from-root path of the portrait / Open Graph image. */
  ogImage: '/portrait.jpg',
  /** Twitter / X handle (with `@`). */
  twitter: '@johndoe',
  /** Google Search Console verification token (empty to omit the meta tag). */
  googleSiteVerification: '',

  /* --------------------------- interactive shell ---------------------- */
  shell: {
    // The host shown in the prompt is not configured: it is the host name of
    // `url` (see `siteHost` below), or at runtime the domain actually serving
    // the page.
    /** User shown in the prompt. */
    user: 'guest',
    /** Absolute home directory — must match the `root/home/...` tree. */
    home: '/home/guest',
  },

  /* --------------------------- profiles & links ----------------------- */
  // Each entry can feed the `open` command, the schema.org `sameAs`, or both.
  links: [
    { url: 'https://www.example.com/blog', open: 'blog', sameAs: true },
    { url: 'https://github.com/johndoe', open: 'github', sameAs: true },
    { url: 'https://www.linkedin.com/in/johndoe', open: 'linkedin', sameAs: true },
    { url: 'https://x.com/johndoe', open: 'x', sameAs: true },
  ] as SiteLink[],
};

/** `open` command registry — `key -> URL`, including aliases. */
export const openLinks: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const l of site.links) {
    if (l.open) out[l.open] = l.url;
    for (const a of l.aliases ?? []) out[a] = l.url;
  }
  return out;
})();

/**
 * Public host name, derived from `url` (e.g. `example.com`): the shell prompt,
 * the fake `/etc/hostname`, the email relay defaults and the deploy configs
 * all use it, so changing the domain only means changing `url`.
 */
export const siteHost: string = new URL(site.url).hostname;

/** schema.org `sameAs` list: every profile flagged `sameAs` in the link list. */
export const sameAs: string[] = site.links.filter((l) => l.sameAs).map((l) => l.url);
