---
name: help
desc: show this help
index: false
man: |
  # HELP(1)

  ## NAME
  help — show help

  ## SYNOPSIS
  help

  ## DESCRIPTION
  Lists every available command with its description, then the files in
  the current directory. For details on a command, use man <command>.

  ## EXAMPLES
  help

  ## SEE ALSO
  man
js: |
  const E = ctx.escape;
  // Command names and file names are clickable: a command opens its manual
  // (`data-cmd`), a file is printed (`data-run`) — so the list works as a
  // palette for visitors who would rather click than type.
  const commandLink = (name) =>
    `<a class="tlink accent" role="link" tabindex="0" data-cmd="${E(name)}" ` +
    `style="display:inline-block;min-width:7.5rem">${E(name)}</a>`;
  const fileLink = (file) =>
    `<a class="tlink prompt-path" role="link" tabindex="0" data-run="cat ${E(file)}">${E(file)}</a>`;

  const rows = ctx.commands
    .map((c) => `<div class="ln">${commandLink(c.name)}<span class="comment">${E(c.desc || '')}</span></div>`)
    .join('');
  ctx.append(
    '<div class="ssh-out"><div class="ln"><span class="prompt-path"># commands</span> ' +
      '<span class="comment">(click one for its manual)</span></div>' + rows + '</div>',
  );
  ctx.line('');
  ctx.append(
    '<div class="ln comment"># files (click one, or type <span class="cmd">cat &lt;file&gt;</span>):</div>' +
      `<div class="ln">${ctx.fileList().map(fileLink).join('  ')}</div>`,
  );
  ctx.line('');
  ctx.append('<div class="ln comment"># run <span class="cmd">man &lt;command&gt;</span> for more on a command</div>');
---
