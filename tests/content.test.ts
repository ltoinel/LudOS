import { describe, expect, it } from 'vitest';
import { manForPage, shortDesc } from '../src/lib/content.ts';

describe('shortDesc', () => {
  it('drops the examples from a command description', () => {
    expect(shortDesc('generate a password — e.g. password 24')).toBe('generate a password');
    expect(shortDesc('who am I')).toBe('who am I');
  });
});

describe('manForPage', () => {
  it('turns the NAME line into the page heading and drops the NAME section', () => {
    const man = '# QR(1)\n\n## NAME\nqr — render text as a QR code\n\n## SYNOPSIS\nqr <text>';
    const page = manForPage(man);
    expect(page.split('\n')[0]).toBe('# qr — render text as a QR code');
    expect(page).not.toContain('## NAME');
    expect(page).toContain('## SYNOPSIS\nqr <text>');
  });
  it('joins a NAME line that wraps', () => {
    const man = '# M(1)\n\n## NAME\nm — a long line that\n  wraps here\n\n## DESCRIPTION\nx';
    expect(manForPage(man).split('\n')[0]).toBe('# m — a long line that wraps here');
  });
  it('leaves a man page without NAME untouched', () => {
    expect(manForPage('# X(1)\n\nbody')).toBe('# X(1)\n\nbody');
  });
});
