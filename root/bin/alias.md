---
name: alias
desc: define a shortcut for a command — e.g. alias la='ls -la'
agent: no
page: false
man: |
  # ALIAS(1)

  ## NAME
  alias — define or display command shortcuts

  ## SYNOPSIS
  alias [name[=command]]...

  ## DESCRIPTION
  Without arguments, lists every alias. With a name, shows that alias.
  With name=command, defines it: typing the name then runs the command,
  followed by whatever arguments were typed after it.

  An alias stands for a single command and its first arguments — not a
  pipeline or a redirection. It is expanded once, so an alias may reuse
  the name of the command it wraps (alias ls='ls -a'). Aliases are
  remembered across visits (stored locally in the browser) and shared
  by every terminal window.

  ## EXAMPLES
  alias la='ls -la'
  alias h=history
  alias la
  alias

  ## SEE ALSO
  unalias, which, history
js: |
  // Aliases live in localStorage under `ltsh.aliases`, as a `{ name: command
  // line }` map. The shell reads that key before running each command (see
  // `expandAlias` in src/lib/shell-parse.ts); `unalias` edits the same key.
  const STORAGE_KEY = 'ltsh.aliases';

  /** The stored aliases; an unreadable or corrupt entry counts as none. */
  const loadAliases = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const aliases = {};
      for (const [name, command] of Object.entries(stored || {})) {
        if (typeof command === 'string') aliases[name] = command;
      }
      return aliases;
    } catch {
      return {};
    }
  };

  /** One alias in the form it can be typed back: name='command'. */
  const show = (name, command) => ctx.raw(`alias ${name}='${command}'`);

  const aliases = loadAliases();

  // No argument: list everything, sorted.
  if (!ctx.args.length) {
    for (const name of Object.keys(aliases).sort()) show(name, aliases[name]);
    return;
  }

  let changed = false;
  for (const arg of ctx.args) {
    const equals = arg.indexOf('=');

    // A bare name: display that alias.
    if (equals < 0) {
      if (Object.hasOwn(aliases, arg)) show(arg, aliases[arg]);
      else ctx.error(`alias: ${arg}: not found`);
      continue;
    }

    const name = arg.slice(0, equals);
    const command = arg.slice(equals + 1).trim();
    if (!/^[A-Za-z_][\w.-]*$/.test(name)) {
      ctx.error(`alias: '${name}': invalid alias name`);
      continue;
    }
    if (!command) {
      ctx.error(`alias: ${name}: empty command — use: unalias ${name}`);
      continue;
    }
    // The shell expands an alias into one command: a pipeline or a
    // redirection in the value would silently be ignored, so refuse it here.
    if (/[|>]/.test(command)) {
      ctx.error(`alias: ${name}: pipes and redirections are not supported in an alias`);
      continue;
    }
    aliases[name] = command;
    changed = true;
  }

  if (!changed) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    ctx.error('alias: cannot save aliases (storage unavailable)');
  }
---
