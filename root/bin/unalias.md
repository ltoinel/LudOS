---
name: unalias
desc: remove a command shortcut — e.g. unalias la
page: false
man: |
  # UNALIAS(1)

  ## NAME
  unalias — remove command shortcuts

  ## SYNOPSIS
  unalias name...
  unalias -a

  ## DESCRIPTION
  Removes each named alias defined with the alias command.

  ## OPTIONS
  -a   remove every alias

  ## EXAMPLES
  unalias la
  unalias -a

  ## SEE ALSO
  alias
js: |
  // Same storage as `alias`: a `{ name: command line }` map under `ltsh.aliases`.
  const STORAGE_KEY = 'ltsh.aliases';

  if (!ctx.args.length) {
    ctx.error('usage: unalias name... | unalias -a');
    return;
  }

  let aliases = {};
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (stored && typeof stored === 'object') aliases = stored;
  } catch {
    // Unreadable entry: nothing is defined, every name below is "not found".
  }

  if (ctx.args.includes('-a')) {
    aliases = {};
  } else {
    for (const name of ctx.args) {
      if (Object.hasOwn(aliases, name)) delete aliases[name];
      else ctx.error(`unalias: ${name}: not found`);
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    ctx.error('unalias: cannot save aliases (storage unavailable)');
  }
---
