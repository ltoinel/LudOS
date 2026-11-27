---
name: history
desc: previous commands
page: false
man: |
  # HISTORY(1)

  ## NAME
  history — show the command history

  ## SYNOPSIS
  history

  ## DESCRIPTION
  Lists, numbered, the commands typed during the session. The history
  persists across visits (stored locally in the browser). The ↑ and ↓
  arrows browse it at the prompt.

  ## EXAMPLES
  history

  ## SEE ALSO
  clear
js: |
  if (!ctx.history.length) {
    ctx.append('<div class="ln comment"># empty</div>');
    return;
  }
  // One append per command: a pipe or a redirection records each append as
  // one line (`history | grep ssh`).
  ctx.history.forEach((command, index) => {
    const number = String(index + 1).padStart(3);
    ctx.append(`<div class="ln"><span class="comment">${number} </span>${ctx.escape(command)}</div>`);
  });
---
