---
name: du
desc: disk usage of files and directories — e.g. du -h, du -sh ~, du -a /etc
index: false
man: |
  # DU(1)

  ## NAME
  du — estimate file space usage

  ## SYNOPSIS
  du [-a] [-s] [-h | -b] [-c] [-d depth] [path ...]

  ## DESCRIPTION
  Summarizes the space used by each directory of the shell's filesystem,
  recursively, like the Unix du: every directory is listed after its
  contents, with its total size, and the path given on the command line
  comes last. With no path, the current directory is measured.

  Sizes are apparent sizes — the files' contents encoded as UTF-8 (this
  filesystem has no disk blocks), summed per directory. By default they are
  shown in 1024-byte units rounded up, as du does; -h prints human-readable
  sizes and -b exact byte counts. Your own changes — files created with
  touch, echo … >, mkdir — are counted. Directories you may not read (e.g.
  /root without su) are reported and skipped.

  ## OPTIONS
  -a            also list every file, not only directories
  -s            only the total of each path given
  -h            human-readable sizes (e.g. 1.2K, 3.4M)
  -b            exact sizes in bytes
  -c            add a grand total line
  -d <depth>    list directories at most <depth> levels deep

  ## EXAMPLES
  du
  du -h
  du -sh ~
  du -ah /etc
  du -c -d 1 /
  du -ah ~ | grep md

  ## SEE ALSO
  ls, tree, wc, dl, top
js: |
  // Self-contained: walks the virtual filesystem through ctx.list / ctx.read.

  // ---- options ----
  let showFiles = false;
  let summarize = false;
  let unit = 'blocks'; // 'blocks' (1K, rounded up) | 'human' | 'bytes'
  let grandTotal = false;
  let maxDepth = Infinity;
  const paths = [];
  const args = ctx.args.slice();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--max-depth') {
      const depth = parseInt(args[++i], 10);
      if (!(depth >= 0)) {
        ctx.error('du: -d needs a depth (0 or more)');
        return;
      }
      maxDepth = depth;
    } else if (/^-[ashbc]+$/.test(arg)) {
      // Grouped short flags, e.g. -sh or -ahc.
      for (const flag of arg.slice(1)) {
        if (flag === 'a') showFiles = true;
        else if (flag === 's') summarize = true;
        else if (flag === 'h') unit = 'human';
        else if (flag === 'b') unit = 'bytes';
        else if (flag === 'c') grandTotal = true;
      }
    } else if (arg.startsWith('-')) {
      ctx.error(`du: unknown option ${arg} — see man du`);
      return;
    } else {
      paths.push(arg);
    }
  }
  if (showFiles && summarize) {
    ctx.error('du: cannot both summarize (-s) and show all entries (-a)');
    return;
  }
  if (!paths.length) {
    paths.push('.');
  }

  // ---- size formatting ----
  const format = (bytes) => {
    if (unit === 'bytes') return String(bytes);
    if (unit === 'blocks') return String(Math.ceil(bytes / 1024));
    const units = ['', 'K', 'M', 'G'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index++;
    }
    if (index === 0) return String(value);
    // One decimal below 10 (like du -h: 1.2K), none above.
    return (value < 10 ? (Math.ceil(value * 10) / 10).toFixed(1) : String(Math.ceil(value))) + units[index];
  };

  const encoder = new TextEncoder();
  const rows = []; // [size, path] in output order
  const report = (bytes, path) => rows.push([format(bytes), path]);

  // ---- recursive walk ----
  // `absolute` is resolved by ctx.list / ctx.read; `shown` is the path as the
  // user typed it, extended with the names below it (as du prints them).
  const join = (base, name) => (base.endsWith('/') ? base + name : `${base}/${name}`);

  const measure = (absolute, shown, depth) => {
    const listing = ctx.list(absolute);
    if (listing.error) {
      ctx.error(`du: cannot read directory '${shown}': ${listing.error.replace(/^.*: /, '')}`);
      return 0;
    }
    let total = 0;
    for (const entry of listing.entries) {
      const childAbsolute = join(absolute, entry.name);
      const childShown = join(shown, entry.name);
      if (entry.type === 'dir') {
        total += measure(childAbsolute, childShown, depth + 1);
      } else {
        const file = ctx.read(childAbsolute);
        const bytes = file.error ? 0 : encoder.encode(file.content).length;
        total += bytes;
        if (showFiles && depth + 1 <= maxDepth) report(bytes, childShown);
      }
    }
    // Sub-directories are listed after their contents; the top one is always
    // listed (by the caller) unless it is filtered out by -s or -d.
    if (depth > 0 && !summarize && depth <= maxDepth) report(total, shown);
    return total;
  };

  // ---- run ----
  let sum = 0;
  for (const path of paths) {
    const target = ctx.list(path);
    if (target.error) {
      ctx.error(`du: cannot access '${path}': ${target.error.replace(/^.*: /, '')}`);
      continue;
    }
    // A file given directly: its own size.
    const isFile = target.entries.length === 1 && target.entries[0].type === 'file' && !ctx.read(path).error;
    let size;
    if (isFile) {
      size = encoder.encode(ctx.read(path).content).length;
    } else {
      const previous = ctx.cwd();
      ctx.cd(path); // resolve `path` (~, .., relative) to an absolute directory
      const absolute = ctx.cwd();
      ctx.cd(previous);
      size = measure(absolute, path, 0);
    }
    report(size, path);
    sum += size;
  }
  if (grandTotal) {
    report(sum, 'total');
  }

  // Aligned columns, printed as plain text so `du | sort` or `du > file` work.
  const width = Math.max(...rows.map(([size]) => size.length), 1);
  for (const [size, path] of rows) {
    ctx.raw(`${size.padEnd(width)}\t${path}`);
  }
---
