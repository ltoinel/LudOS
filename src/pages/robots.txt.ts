import type { APIRoute } from 'astro';
import { site } from '../site.config.ts';

export const prerender = true;

// Generated so the sitemap URL follows `site.url` instead of a hard-coded domain.
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
