---
name: env
desc: print the shell environment — e.g. env, env HOME
agent: read
page: false
man: |
  # ENV(1)

  ## NAME
  env — print the shell environment

  ## SYNOPSIS
  env [NAME...]

  ## DESCRIPTION
  Prints the environment of this shell as KEY=value lines. Nothing is made
  up: every variable is derived from the live state of the session.

  USER, HOME      the current identity (they change after `su`)
  PWD             the working directory
  HOSTNAME        the host shown in the prompt
  SHELL, TERM     this shell and its terminal window
  PATH            where commands live
  LANG, TZ        your browser's language and time zone
  THEME           the display theme in use
  LUDOS_VERSION   the site's release

  A variable your browser does not expose is left out. With one or more
  names, only their values are printed, one per line.

  ## EXAMPLES
  env
  env HOME
  env USER HOSTNAME
  env | grep LANG

  ## SEE ALSO
  whoami, pwd, uname, theme, which
js: |
  // env — the session's state presented as environment variables.
  const cfg = ctx.cfg || {};

  // The superuser's home is the one subtree the filesystem hides from
  // everybody else: being able to list it means the session runs as root.
  const ROOT_HOME = '/root';
  const isRoot = typeof ctx.list === 'function' && !ctx.list(ROOT_HOME).error;

  /** Runs a probe that may not exist in this browser; undefined when it fails. */
  const probe = (read) => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };

  // POSIX spells a locale `en_US.UTF-8` where browsers say `en-US`.
  const language = probe(() => navigator.language);
  const locale = language ? `${language.replace('-', '_')}.UTF-8` : undefined;

  const variables = [
    ['USER', isRoot ? 'root' : cfg.user],
    ['HOME', isRoot ? ROOT_HOME : cfg.home],
    ['PWD', probe(() => ctx.cwd())],
    ['HOSTNAME', cfg.host],
    ['SHELL', '/bin/ltsh'],
    ['TERM', 'ludos'],
    ['PATH', '/bin'],
    ['LANG', locale],
    ['TZ', probe(() => Intl.DateTimeFormat().resolvedOptions().timeZone)],
    ['THEME', probe(() => ctx.currentTheme())],
    ['LUDOS_VERSION', cfg.version],
  ].filter(([, value]) => typeof value === 'string' && value !== '');

  const names = ctx.args.filter((arg) => arg !== '--');
  if (!names.length) {
    for (const [name, value] of variables) ctx.raw(`${name}=${value}`);
    return;
  }
  for (const name of names) {
    // `$HOME` and `home` are accepted for `HOME`.
    const wanted = name.replace(/^\$/, '').toUpperCase();
    const variable = variables.find(([candidate]) => candidate === wanted);
    if (variable) ctx.raw(variable[1]);
    else ctx.error(`env: ${name}: not set`);
  }
---
