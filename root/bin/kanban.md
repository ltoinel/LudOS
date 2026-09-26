---
name: kanban
desc: show the todo tasks as a kanban board
alias: board
page: false
man: |
  # KANBAN(1)

  ## NAME
  kanban — display the task list as a kanban board

  ## SYNOPSIS
  kanban [width]

  ## DESCRIPTION
  Draws the tasks managed by the todo command as a three-column board
  (TODO · DOING · DONE) with Unicode box-drawing characters. Long task
  texts wrap inside their column. The optional width sets the width of
  each column in characters (default 26, from 14 to 60).

  Move cards with todo: `todo start <id>`, `todo done <id>`,
  `todo reset <id>`.

  ## EXAMPLES
  kanban
  kanban 34

  ## SEE ALSO
  todo, pomodoro
js: |
  const E = ctx.escape;
  const W = Math.min(60, Math.max(14, parseInt(ctx.args[0], 10) || 26));
  // Reads the task list kept by the todo command (same localStorage key and
  // format); unreadable data just shows an empty board.
  const readTasks = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('ltsh.todo') || '[]');
      return Array.isArray(stored)
        ? stored.filter((task) => task && typeof task.id === 'number' && typeof task.text === 'string')
        : [];
    } catch {
      return [];
    }
  };
  const tasks = readTasks().sort((a, b) => a.id - b.id);
  if (!tasks.length) {
    ctx.line('the board is empty — add cards with: todo add "…"');
    return;
  }

  const COLUMNS = [
    { key: 'todo', title: 'TODO', color: 'var(--fg-bright)' },
    { key: 'doing', title: 'DOING', color: 'var(--amber)' },
    { key: 'done', title: 'DONE', color: 'var(--dim)' },
  ];

  // Word-wraps `text` to lines of at most `w` chars (hard-splits long words).
  const wrap = (text, w) => {
    const out = [];
    let cur = '';
    for (let word of text.split(' ')) {
      // Hard-split words longer than a whole line.
      while (word.length > w) {
        if (cur) {
          out.push(cur);
          cur = '';
        }
        out.push(word.slice(0, w));
        word = word.slice(w);
      }
      if (!cur) {
        cur = word;
      } else if ((cur + ' ' + word).length <= w) {
        cur += ' ' + word;
      } else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  // Each column becomes a list of plain-text rows, cards separated by a blank
  // row (a row is [text, isFirstLineOfCard]).
  const cols = COLUMNS.map((c) => {
    const rows = [];
    for (const t of tasks.filter((x) => x.status === c.key)) {
      const prefix = `#${t.id} `;
      wrap(t.text, W - 2 - prefix.length).forEach((l, i) =>
        rows.push([(i === 0 ? prefix : ' '.repeat(prefix.length)) + l, i === 0]),
      );
      rows.push(['', false]);
    }
    if (rows.length) rows.pop();
    else rows.push(['—', false]);
    return rows;
  });
  const height = Math.max(...cols.map((r) => r.length));

  const B = (s) => `<span class="comment">${s}</span>`;
  const hr = (l, m, r) => B(l + COLUMNS.map(() => '─'.repeat(W)).join(m) + r);
  const cell = (text, color) => ` <span style="color:${color}">${E(text.padEnd(W - 2))}</span> `;

  const lines = [hr('┌', '┬', '┐')];
  lines.push(
    B('│') +
      COLUMNS.map((c) => {
        const n = tasks.filter((t) => t.status === c.key).length;
        return `<span class="accent text-glow">${E(` ${c.title} (${n})`.padEnd(W))}</span>`;
      }).join(B('│')) +
      B('│'),
  );
  lines.push(hr('├', '┼', '┤'));
  for (let r = 0; r < height; r++) {
    lines.push(
      B('│') + COLUMNS.map((c, i) => cell((cols[i][r] || [''])[0], c.color)).join(B('│')) + B('│'),
    );
  }
  lines.push(hr('└', '┴', '┘'));
  ctx.append(`<div class="ln ascii-art">${lines.join('\n')}</div>`);
---
