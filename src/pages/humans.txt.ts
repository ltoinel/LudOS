import type { APIRoute } from 'astro';
import { openLinks, site } from '../site.config.ts';

export const prerender = true;

// humans.txt (humanstxt.org), generated from the site config — no identity or
// domain is hard-coded here. Profile lines appear only when the link exists.
const optional = (label: string, url?: string): string[] => (url ? [`  ${label}: ${url}`] : []);

const text = [
  '/* TEAM */',
  `  Name: ${site.name}`,
  `  Role: ${site.role} @ ${site.company}`,
  `  Site: ${site.url}`,
  ...optional('Blog', openLinks.blog),
  ...optional('GitHub', openLinks.github),
  `  Location: ${site.nationality}`,
  '',
  '/* SITE */',
  '  Standards: HTML5, CSS3, JavaScript, JSON-LD',
  '  Components: Astro, Tailwind CSS',
  '',
].join('\n');

export const GET: APIRoute = () =>
  new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
