---
name: mv
desc: move or rename files and directories — e.g. mv draft.txt notes.txt, mv notes.txt docs
agent: no
page: false
man: |
  # MV(1)

  ## NAME
  mv — move or rename files and directories

  ## SYNOPSIS
  mv <source> <destination>
  mv <source>... <directory>

  ## DESCRIPTION
  Renames a file or a directory, or moves one or more sources into an
  existing directory. When the destination is an existing directory, each
  source is moved inside it under its own name; otherwise the destination is
  the new name, and an existing file there is replaced.

  A move is a copy followed by the removal of the source. The source is only
  removed once every write has succeeded, so a refused move (no permission,
  missing parent directory) never loses data. A directory cannot be moved
  into itself, onto a non-empty directory, or while you are standing in it.

  Names are exact: unlike `cat`, mv does not guess a missing `.md` extension.
  Changes are saved in your browser (localStorage) and persist across visits;
  as a guest you may only write below your home directory.

  ## OPTIONS
  --   end of options (for a name starting with a dash)

  ## EXAMPLES
  mv draft.txt notes.txt
  mv notes.txt todo.txt /home/guest/archive
  mv projects work

  ## SEE ALSO
  cp, rm, mkdir, touch, ls
js: |
  // mv — move or rename inside the virtual filesystem. The filesystem has no
  // rename primitive, so a move is "copy, then remove the source" — in that
  // order, and the removal only happens when the whole copy succeeded.
  const USAGE = 'usage: mv <source>... <destination>';

  // ---- options ------------------------------------------------------------
  const operands = [];
  let parsingOptions = true;
  for (const arg of ctx.args) {
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && arg.length > 1 && arg.startsWith('-')) {
      ctx.error(`mv: invalid option -- ${arg.slice(1)}`);
      return;
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
  // name a moved entry after its source.

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
   * before their content) or `{ error }`. Everything is read before the first
   * write, so a failure while reading leaves the filesystem untouched.
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

  /** Removes the source once its copy is complete; reports a leftover source. */
  const removeSource = (source, target, isDirectory) => {
    const error = ctx.rm(source, isDirectory, false);
    if (error) ctx.error(`mv: '${source}' was copied to '${target}' but not removed: ${error}`);
  };

  // ---- move ---------------------------------------------------------------
  const destination = operands.pop();
  const sources = operands;
  const destinationInfo = inspect(destination);
  const intoDirectory = destinationInfo.kind === 'dir';
  if (sources.length > 1 && !intoDirectory) {
    ctx.error(`mv: target '${destination}' is not a directory`);
    return;
  }

  for (const source of sources) {
    const sourceInfo = inspect(source);
    if (sourceInfo.kind === 'denied') {
      ctx.error(`mv: cannot open '${source}': Permission denied`);
      continue;
    }
    if (sourceInfo.kind === 'missing') {
      ctx.error(`mv: cannot stat '${source}': No such file or directory`);
      continue;
    }

    // An existing directory receives the source under its own name; anything
    // else is the new name.
    const sourcePath = absolute(source);
    const target = intoDirectory ? join(destination, baseName(sourcePath)) : destination;
    const targetPath = absolute(target);
    const targetInfo = intoDirectory ? inspect(target) : destinationInfo;

    if (sourceInfo.kind === 'file') {
      // Checked first: writing a file over itself and then removing "the
      // source" would delete the only copy.
      if (targetPath === sourcePath) {
        ctx.error(`mv: '${source}' and '${target}' are the same file`);
        continue;
      }
      if (targetInfo.kind === 'dir') {
        ctx.error(`mv: cannot overwrite directory '${target}' with non-directory`);
        continue;
      }
      const error = ctx.write(target, sourceInfo.content);
      if (error) {
        ctx.error(`mv: ${error}`);
        continue;
      }
      removeSource(source, target, false);
      continue;
    }

    // A directory. Moving it below itself would copy it into the tree that is
    // removed right after — refuse before touching anything.
    if (isInside(targetPath, sourcePath)) {
      ctx.error(`mv: cannot move '${source}' to a subdirectory of itself, '${target}'`);
      continue;
    }
    // The filesystem refuses to remove the directory the shell stands in:
    // find out now rather than after a copy that could not be completed.
    if (isInside(absolute(ctx.cwd()), sourcePath)) {
      ctx.error(`mv: cannot move '${source}': directory in use`);
      continue;
    }
    if (targetInfo.kind === 'file') {
      ctx.error(`mv: cannot overwrite non-directory '${target}' with directory '${source}'`);
      continue;
    }
    if (targetInfo.kind === 'dir') {
      const existing = ctx.list(target);
      if (existing.error || existing.entries.length) {
        ctx.error(`mv: cannot move '${source}' to '${target}': Directory not empty`);
        continue;
      }
    }
    const tree = snapshot(source);
    if (tree.error) {
      ctx.error(`mv: ${tree.error}`);
      continue;
    }
    const createdTarget = targetInfo.kind !== 'dir';
    let failure = createdTarget ? ctx.mkdir(target, false) : null;
    const targetExists = !failure;
    for (const entry of tree.entries) {
      if (failure) break;
      const path = join(target, entry.relative);
      failure = entry.kind === 'dir' ? ctx.mkdir(path, false) : ctx.write(path, entry.content);
    }
    if (failure) {
      // The source is intact. Drop the partial copy, but only a directory
      // this very command created.
      if (createdTarget && targetExists) ctx.rm(target, true, true);
      ctx.error(`mv: ${failure}`);
      continue;
    }
    removeSource(source, target, true);
  }
---
