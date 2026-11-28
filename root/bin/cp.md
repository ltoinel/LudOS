---
name: cp
desc: copy files and directories — e.g. cp about.md notes.md, cp -r docs backup
agent: no
page: false
man: |
  # CP(1)

  ## NAME
  cp — copy files and directories

  ## SYNOPSIS
  cp [-r] <source> <destination>
  cp [-r] <source>... <directory>

  ## DESCRIPTION
  Copies a file to a new name, or one or more sources into an existing
  directory. When the destination is an existing directory, each source is
  copied inside it under its own name; otherwise the destination is the name
  of the copy, and an existing file there is overwritten.

  A directory is only copied with -r, with everything it contains. Copying a
  directory onto an existing one merges the two. A directory cannot be copied
  into itself.

  Names are exact: unlike `cat`, cp does not guess a missing `.md` extension.
  Copies are saved in your browser (localStorage) and persist across visits;
  as a guest you may only write below your home directory.

  ## OPTIONS
  -r, -R   copy directories recursively
  --       end of options (for a name starting with a dash)

  ## EXAMPLES
  cp about.md notes.md
  cp about.md contact.md /home/guest/archive
  cp -r projects backup
  cp /etc/motd ~/motd.txt

  ## SEE ALSO
  mv, rm, mkdir, touch, ls
js: |
  // cp — copy files and directories inside the virtual filesystem, with the
  // destination rules of the Unix command (existing directory = copy into it).
  const USAGE = 'usage: cp [-r] <source>... <destination>';

  // ---- options ------------------------------------------------------------
  let recursive = false;
  const operands = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && arg.length > 1 && arg.startsWith('-')) {
      for (const flag of arg.slice(1)) {
        if (flag === 'r' || flag === 'R') {
          recursive = true;
        } else {
          ctx.error(`cp: invalid option -- ${flag}`);
          return;
        }
      }
      continue;
    }
    operands.push(arg);
  }
  if (operands.length < 2) {
    ctx.error(USAGE);
    return;
  }

  // ---- paths --------------------------------------------------------------
  // The filesystem calls take the paths as typed. Absolute paths are only
  // computed here to compare two locations (same file? inside itself?) and to
  // name a copy after its source.

  /** Home of the current user: the working directory's `~` label reveals it. */
  const homeDirectory = () => {
    const cwd = ctx.cwd();
    const label = typeof ctx.cwdLabel === 'function' ? ctx.cwdLabel() : '';
    if (label.startsWith('~')) return cwd.slice(0, cwd.length - (label.length - 1));
    return (ctx.cfg && ctx.cfg.home) || '/';
  };

  /** A typed path (relative, `~`, `.`, `..`) as an absolute, normalized one. */
  const absolute = (typed) => {
    let path = typed.trim();
    if (path === '~') path = homeDirectory();
    else if (path.startsWith('~/')) path = homeDirectory() + path.slice(1);
    const segments = path.startsWith('/') ? [] : ctx.cwd().split('/').filter(Boolean);
    for (const segment of path.split('/').filter(Boolean)) {
      if (segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment);
    }
    return '/' + segments.join('/');
  };
  const baseName = (absolutePath) => absolutePath.split('/').pop() || '';
  const join = (directory, name) =>
    directory.endsWith('/') ? directory + name : `${directory}/${name}`;
  /** Whether `path` is `ancestor` itself or lies below it (both absolute). */
  const isInside = (path, ancestor) =>
    path === ancestor || path.startsWith(ancestor === '/' ? '/' : `${ancestor}/`);

  /**
   * What a typed path points at: a file (with its content), a directory,
   * nothing, or a protected location. ctx.read is lenient — `about` finds
   * `about.md` — so a hit under another name counts as missing.
   */
  const inspect = (typed) => {
    const result = ctx.read(typed);
    if (result.error === 'Is a directory') return { kind: 'dir' };
    if (result.error === 'Permission denied') return { kind: 'denied' };
    if (result.error) return { kind: 'missing' };
    if (result.name !== baseName(absolute(typed))) return { kind: 'missing' };
    return { kind: 'file', content: result.content };
  };

  /**
   * Reads a whole directory tree into memory: `{ entries }` (directories
   * before their content) or `{ error }`. Reading everything before the first
   * write keeps the copy from ever walking into what it is creating.
   */
  const snapshot = (directory) => {
    const entries = [];
    const walk = (path, relative) => {
      const listing = ctx.list(path);
      if (listing.error) return listing.error;
      for (const entry of listing.entries) {
        const childPath = join(path, entry.name);
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.type === 'dir') {
          entries.push({ relative: childRelative, kind: 'dir' });
          const error = walk(childPath, childRelative);
          if (error) return error;
        } else {
          const file = ctx.read(childPath);
          if (file.error) return `cannot read '${childPath}': ${file.error}`;
          entries.push({ relative: childRelative, kind: 'file', content: file.content });
        }
      }
      return null;
    };
    const error = walk(directory, '');
    return error ? { error } : { entries };
  };

  // ---- copy ---------------------------------------------------------------
  const destination = operands.pop();
  const sources = operands;
  const destinationInfo = inspect(destination);
  const intoDirectory = destinationInfo.kind === 'dir';
  if (sources.length > 1 && !intoDirectory) {
    ctx.error(`cp: target '${destination}' is not a directory`);
    return;
  }

  for (const source of sources) {
    const sourceInfo = inspect(source);
    if (sourceInfo.kind === 'denied') {
      ctx.error(`cp: cannot open '${source}': Permission denied`);
      continue;
    }
    if (sourceInfo.kind === 'missing') {
      ctx.error(`cp: cannot stat '${source}': No such file or directory`);
      continue;
    }
    if (sourceInfo.kind === 'dir' && !recursive) {
      ctx.error(`cp: -r not specified; omitting directory '${source}'`);
      continue;
    }

    // An existing directory receives the source under its own name; anything
    // else is the name of the copy.
    const sourcePath = absolute(source);
    const target = intoDirectory ? join(destination, baseName(sourcePath)) : destination;
    const targetPath = absolute(target);
    const targetInfo = intoDirectory ? inspect(target) : destinationInfo;

    if (sourceInfo.kind === 'file') {
      if (targetPath === sourcePath) {
        ctx.error(`cp: '${source}' and '${target}' are the same file`);
        continue;
      }
      if (targetInfo.kind === 'dir') {
        ctx.error(`cp: cannot overwrite directory '${target}' with non-directory`);
        continue;
      }
      const error = ctx.write(target, sourceInfo.content);
      if (error) ctx.error(`cp: ${error}`);
      continue;
    }

    // A directory.
    if (isInside(targetPath, sourcePath)) {
      ctx.error(`cp: cannot copy a directory, '${source}', into itself, '${target}'`);
      continue;
    }
    if (targetInfo.kind === 'file') {
      ctx.error(`cp: cannot overwrite non-directory '${target}' with directory '${source}'`);
      continue;
    }
    const tree = snapshot(source);
    if (tree.error) {
      ctx.error(`cp: ${tree.error}`);
      continue;
    }
    let failure = targetInfo.kind === 'dir' ? null : ctx.mkdir(target, false);
    for (const entry of tree.entries) {
      if (failure) break;
      const path = join(target, entry.relative);
      // `parents` makes mkdir accept a directory that is already there, which
      // is what merging into an existing tree needs.
      failure = entry.kind === 'dir' ? ctx.mkdir(path, true) : ctx.write(path, entry.content);
    }
    if (failure) ctx.error(`cp: ${failure}`);
  }
---
