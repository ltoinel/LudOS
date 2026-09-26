---
name: whoami
desc: who am I
demo: whoami
man: |
  # WHOAMI(1)

  ## NAME
  whoami — who am I

  ## SYNOPSIS
  whoami

  ## DESCRIPTION
  Prints a short introduction to the owner of this terminal, built from
  the site identity (name, role, company, interests) declared in the
  configuration — a single source of truth shared with the page metadata.

  ## ABOUT THIS SITE
  This site is a personal portal disguised as a Unix terminal: instead of
  menus, you explore it with commands. Try `cat about.md` for the full story,
  `cat projects.md` for the projects, `open github` to jump to a profile, or
  `help` for every available command — from network tools (ping, nslookup,
  whois) to a local AI assistant running in your browser (miaougpt, denree).

  ## NOTES
  On a real Unix system, whoami prints the name of the current user. Here it
  introduces the person behind the terminal.

  ## EXAMPLES
  whoami

  ## SEE ALSO
  open
js: |
  // Identity comes from site.config.ts, injected into the shell cfg as `profile`.
  const p = ctx.cfg.profile;
  if (!p) { ctx.error('whoami: identity unavailable'); return; }
  const lines = [
    `# ${p.name}`,
    `## ${p.role}${p.company ? ` @ ${p.company}` : ''}`,
    '',
  ];
  if (p.knowsAbout && p.knowsAbout.length) lines.push(`> ${p.knowsAbout.join(' · ')}`);
  const home = [p.nationality ? `Based in ${p.nationality}` : '', p.url ? `[${ctx.cfg.host}](${p.url})` : '']
    .filter(Boolean)
    .join(' · ');
  if (home) lines.push(`> ${home}`);
  ctx.print(lines.join('\n'));
---
