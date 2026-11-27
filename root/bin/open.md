---
name: open
desc: open a link — e.g. open github
index: false
man: |
  # OPEN(1)

  ## NAME
  open — open a link

  ## SYNOPSIS
  open [name]

  ## DESCRIPTION
  Opens one of my links (blog, GitHub, LinkedIn, etc.) in a new tab.
  With no argument, lists the available names.

  ## EXAMPLES
  open
  open github

  ## SEE ALSO
  whoami, iframed, msg
js: |
  const keys = Object.keys(ctx.cfg.links).sort();
  if (!ctx.args.length) {
    // Link names come from the site config: escaped like any other data.
    const names = keys.map((key) => `<span class="prompt-path">${ctx.escape(key)}</span>`);
    ctx.append('<div class="ln comment"># usage: open &lt;name&gt;</div>');
    ctx.append(`<div class="ln">${names.join('  ')}</div>`);
    return;
  }
  // Own keys only: `open constructor` must not reach Object.prototype.
  const known = Object.prototype.hasOwnProperty.call(ctx.cfg.links, ctx.args[0]);
  const url = known ? ctx.cfg.links[ctx.args[0]] : '';
  if (!url || typeof url !== 'string') {
    ctx.error(`open: ${ctx.args[0]}: unknown link (type \`open\` for the list)`);
    return;
  }
  ctx.line(`opening ${url} …`);
  ctx.open(url);
---
