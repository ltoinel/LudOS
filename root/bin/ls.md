---
name: ls
desc: list directory contents
agent: read
index: false
man: |
  # LS(1)

  ## NAME
  ls — list directory contents

  ## SYNOPSIS
  ls [-a] [-l] [path]

  ## DESCRIPTION
  Lists the entries of the given directory (the current one by
  default). Directories are highlighted and suffixed with a /. Hidden
  files are omitted unless -a is given.

  ## OPTIONS
  -a   also show hidden files (starting with .)
  -l   long format: permissions, size, date

  ## EXAMPLES
  ls
  ls -la /etc

  ## SEE ALSO
  ll, tree, find, cd
js: |
  // Every dash argument is a bundle of flags (-la, -a -l …): pool their letters.
  const flags = ctx.args.filter((arg) => arg.startsWith('-')).join('');
  const all = /[aA]/.test(flags); // -a / -A / -la …
  const long = /l/.test(flags);
  const path = ctx.args.find((arg) => !arg.startsWith('-'));
  const res = ctx.list(path);
  if (res.error) {
    ctx.error(`ls: ${res.error}`);
    return;
  }
  let entries = res.entries;
  if (!all) entries = entries.filter((entry) => !entry.name.startsWith('.')); // hide dotfiles
  // Directories are highlighted and suffixed with a slash.
  const cell = (entry) =>
    entry.type === 'dir'
      ? `<span class="accent">${ctx.escape(entry.name)}/</span>`
      : `<span class="prompt-path">${ctx.escape(entry.name)}</span>`;
  // One append per entry: a pipe or a redirection records each append as one
  // line, so `ls | wc -l` and `ls -l | grep md` see one entry per line.
  if (long) {
    // The virtual files carry no date: they are all stamped with today's ("Nov  8").
    const today = new Date();
    const month = today.toLocaleString('en-US', { month: 'short' });
    const stamp = `${month} ${String(today.getDate()).padStart(2, ' ')}`;
    const owner = ctx.escape((ctx.cfg && ctx.cfg.user) || 'guest'); // owner and group
    ctx.append(`<div class="ln comment">total ${entries.length}</div>`);
    for (const entry of entries) {
      const perms = entry.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
      const size = String(entry.size).padStart(5, ' ');
      ctx.append(
        `<div class="ln"><span class="comment">${perms} 1 ${owner} ${owner} ${size} ${stamp} </span>${cell(entry)}</div>`,
      );
    }
  } else {
    for (const entry of entries) {
      const block = ctx.append(`<div class="ln">${cell(entry)}</div>`);
      // On screen the names stay on one row, as before: each appended block
      // flows inline, two characters apart. (Captured output has no layout.)
      if (block && block.style) {
        block.style.display = 'inline-block';
        block.style.marginRight = '2ch';
      }
    }
  }
---
