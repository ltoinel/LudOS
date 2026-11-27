---
name: which
desc: locate a command — e.g. which ls, which calendar
page: false
man: |
  # WHICH(1)

  ## NAME
  which — locate a command

  ## SYNOPSIS
  which <name>...

  ## DESCRIPTION
  Prints where each given command lives. Every command of this shell is a
  file in /bin, so a command name resolves to /bin/<name>. An alias is
  resolved to the command it stands for and shown as `alias → /bin/command`.
  A name that is neither is reported as an error.

  ## EXAMPLES
  which ls
  which calendar
  which cp mv rm

  ## SEE ALSO
  help, man, ls, env
js: |
  // which — resolve command names (and their aliases) to their file in /bin.
  const names = ctx.args.filter((arg) => arg !== '--');
  if (!names.length) {
    ctx.error('usage: which <name>...');
    return;
  }
  const commands = ctx.commands || [];
  for (const name of names) {
    const command = commands.find((candidate) => candidate.name === name);
    if (command) {
      ctx.raw(`/bin/${command.name}`);
      continue;
    }
    const aliased = commands.find((candidate) => (candidate.alias || []).includes(name));
    if (aliased) {
      ctx.raw(`${name} → /bin/${aliased.name}`);
      continue;
    }
    ctx.error(`which: no ${name} in (/bin)`);
  }
---
