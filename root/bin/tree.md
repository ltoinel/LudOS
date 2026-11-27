---
name: tree
desc: list the filesystem as a tree — e.g. tree, tree /
index: false
man: |
  # TREE(1)

  ## NAME
  tree — show the filesystem as a tree

  ## SYNOPSIS
  tree [-a] [path]

  ## DESCRIPTION
  Shows the contents of the given directory (the current one by
  default) as a tree, then a count of directories and files. The /root
  directory stays hidden outside a root session (see su).

  ## OPTIONS
  -a   also show hidden files

  ## EXAMPLES
  tree
  tree /

  ## SEE ALSO
  ls, find, cd
js: |
  const root = ctx.args.find((arg) => !arg.startsWith('-')) || '.';
  const all = ctx.args.some((arg) => /^-[a-z]*a/.test(arg)); // -a shows dotfiles
  let dirs = 0;
  let files = 0;
  const lines = [];
  // Depth-first walk; `ctx.list` returns an error for missing/denied paths,
  // which we simply skip (so /root stays hidden until you `su`).
  // `prefix` is the drawing inherited from the ancestors: a `│` under each one
  // that still has siblings to come, blanks under the others.
  const walk = (path, prefix) => {
    const res = ctx.list(path);
    if (res.error || !res.entries) return;
    let entries = res.entries;
    if (!all) entries = entries.filter((entry) => !entry.name.startsWith('.'));
    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      const branch = last ? '└── ' : '├── ';
      const cell =
        entry.type === 'dir'
          ? `<span class="accent">${ctx.escape(entry.name)}/</span>`
          : `<span class="prompt-path">${ctx.escape(entry.name)}</span>`;
      lines.push(`<div class="ln"><span class="comment">${prefix}${branch}</span>${cell}</div>`);
      if (entry.type === 'dir') {
        dirs++;
        walk(`${path}/${entry.name}`, prefix + (last ? '    ' : '│   '));
      } else {
        files++;
      }
    });
  };
  walk(root, '');
  // One append per row: a pipe or a redirection records each append as one
  // line (`tree | grep md`, `tree | wc -l`).
  ctx.append(`<div class="ln"><span class="accent">${ctx.escape(root)}</span></div>`);
  for (const line of lines) ctx.append(line);
  ctx.append(`<div class="ln comment">${dirs} directories, ${files} files</div>`);
---
