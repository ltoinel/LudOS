---
name: find
desc: find files by name — e.g. find . -name '*.md'
agent: read
page: false
man: |
  # FIND(1)

  ## NAME
  find — find files by name

  ## SYNOPSIS
  find [path] [-name <pattern>] [-type f|d]

  ## DESCRIPTION
  Recursively walks the tree starting from [path] (the current
  directory by default) and prints the entries it encounters. The /root
  directory stays hidden until you are the superuser (see su).

  ## OPTIONS
  -name <pattern>   keep only names matching the pattern
                    (wildcards * and ? allowed)
  -type f           keep only files
  -type d           keep only directories

  ## EXAMPLES
  find
  find . -name '*.md'
  find / -type d

  ## SEE ALSO
  grep, ls, tree
js: |
  const E = ctx.escape;
  const args = ctx.args;
  let start = '.';
  let namePattern = null; // -name <glob>
  let typeFilter = null; // -type f|d
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // A test consumes the next argument as its value (hence the ++i).
    if (arg === '-name') namePattern = args[++i];
    else if (arg === '-type') typeFilter = args[++i];
    else if (!arg.startsWith('-')) start = arg;
  }
  if (typeFilter && typeFilter !== 'f' && typeFilter !== 'd') {
    ctx.error(`find: '${typeFilter}': unknown type (use f or d)`);
    return;
  }
  // Translate a shell glob (* and ?) into an anchored regex on the basename:
  // regex metacharacters are escaped first, then the two wildcards converted.
  const globToRegex = (glob) =>
    new RegExp(
      '^' +
        glob
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
    );
  const nameRegex = namePattern != null ? globToRegex(namePattern) : null;
  const wantType = (type) =>
    !typeFilter || (typeFilter === 'f' && type === 'file') || (typeFilter === 'd' && type === 'dir');

  const probe = ctx.list(start);
  if (probe.error) {
    ctx.error(`find: '${start}': ${probe.error}`);
    return;
  }

  // Depth-first walk; denied/missing paths simply yield nothing (so /root stays
  // hidden until you `su`), matching `tree`'s behaviour.
  const hits = [];
  const walk = (path) => {
    const res = ctx.list(path);
    if (res.error || !res.entries) return;
    for (const entry of res.entries) {
      const child = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
      const nameMatches = !nameRegex || nameRegex.test(entry.name);
      if (wantType(entry.type) && nameMatches) hits.push({ path: child, type: entry.type });
      // A directory is always entered, even when it is not itself a match.
      if (entry.type === 'dir') walk(child);
    }
  };
  walk(start);

  for (const hit of hits) {
    const cell =
      hit.type === 'dir'
        ? `<span class="accent">${E(hit.path)}/</span>`
        : `<span class="prompt-path">${E(hit.path)}</span>`;
    ctx.append(`<div class="ln">${cell}</div>`);
  }
---
