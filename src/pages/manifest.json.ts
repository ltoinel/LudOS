import type { APIRoute } from 'astro';
import { site } from '../site.config.ts';

export const prerender = true;

// Web app manifest, generated from the site config (name, description,
// language) so nothing identity-specific is duplicated in public/.
const manifest = {
  name: site.name,
  short_name: site.shortName,
  description: site.tagline,
  lang: site.lang,
  dir: 'ltr',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#080b09',
  theme_color: '#080b09',
  categories: ['personal', 'portfolio', 'productivity'],
  icons: [
    { src: '/icons/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8' },
  });
