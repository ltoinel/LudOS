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
  help -k <keyword>

  ## DESCRIPTION
  Lists every available command with its description, then the files in
  the current directory. For details on a command, use man <command>.

  ## OPTIONS
  -k, --keyword <keyword>   list only the commands whose name, description
                            or manual contains the keyword (case-insensitive),
                            with the first matching manual line — like
                            `man -k` / apropos

  ## EXAMPLES
  help
  help -k weather
  help -k "public ip"

  ## SEE ALSO
  man, denree
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

  // The space between name and description keeps them apart in plain-text
  // output (pipes, and the denree agent's headless capture).
  const row = (command, extra = '') =>
    `<div class="ln">${commandLink(command.name)} <span class="comment">${E(command.desc || '')}</span>${extra}</div>`;

  // help -k <keyword>: search every command's name, aliases, description and
  // manual, like `man -k` — lets a visitor (or the denree agent) find which
  // command can do something.
  const flag = ctx.args[0];
  if (flag === '-k' || flag === '--keyword') {
    const keyword = ctx.args.slice(1).join(' ').trim();
    if (!keyword) {
      ctx.error('help: -k needs a keyword — e.g. help -k weather');
      return;
    }
    const needle = keyword.toLowerCase();
    // help itself is left out: its own examples would match every search.
    const matches = ctx.commands.filter((command) =>
      command.name !== 'help' &&
      [command.name, ...(command.alias || []), command.desc || '', command.man || '']
        .join('\n')
        .toLowerCase()
        .includes(needle),
    );
    if (!matches.length) {
      ctx.line(`help: nothing appropriate for "${keyword}"`);
      return;
    }
    // Show where the keyword appears in the manual, unless the description
    // already says it.
    const manualLine = (command) => {
      if ((command.desc || '').toLowerCase().includes(needle)) return '';
      const line = (command.man || '')
        .split('\n')
        .map((text) => text.trim())
        .find((text) => text.toLowerCase().includes(needle));
      return line ? `\n${' '.repeat(8)}<span class="comment">↳ ${E(line.slice(0, 120))}</span>` : '';
    };
    ctx.append(
      `<div class="ln"><span class="prompt-path"># ${matches.length} command(s) matching "${E(keyword)}"</span></div>`,
    );
    for (const command of matches) ctx.append(row(command, manualLine(command)));
    ctx.line('');
    ctx.append('<div class="ln comment"># run <span class="cmd">man &lt;command&gt;</span> for more on a command</div>');
    return;
  }

  // One append per row: a headless capture records each append as one line.
  ctx.append(
    '<div class="ln"><span class="prompt-path"># commands</span> ' +
      '<span class="comment">(click one for its manual)</span></div>',
  );
  for (const command of ctx.commands) ctx.append(row(command));
  ctx.line('');
  ctx.append(
    '<div class="ln comment"># files (click one, or type <span class="cmd">cat &lt;file&gt;</span>):</div>' +
      `<div class="ln">${ctx.fileList().map(fileLink).join('  ')}</div>`,
  );
  ctx.line('');
  ctx.append('<div class="ln comment"># run <span class="cmd">man &lt;command&gt;</span> for more on a command</div>');
---
