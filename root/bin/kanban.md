---
name: kanban
desc: show the todo tasks as a kanban board
alias: board
seo_title: Kanban board in your terminal — todo, doing, done
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

  ## HOW IT WORKS
  The board is plain text, drawn from the same list as the todo command
  (stored in your browser's localStorage). Nothing is sent to a server
  and there is no account: add a card with `todo add`, move it with
  `todo start` / `todo done`, and run kanban again to see it.

  ## USE CASES
  - see at a glance what is waiting, in progress and finished;
  - limit work in progress: keep the DOING column short;
  - paste the board into a chat or a ticket — it is just text
    (kanban > board.txt saves it as a file).

  ## EXAMPLES
  kanban
  kanban 34

  ## SEE ALSO
  todo, pomodoro
js: |
  const E = ctx.escape;
  // Column width in characters (optional first argument), kept within what a
  // card and a terminal can reasonably hold.
  const DEFAULT_COLUMN_WIDTH = 26;
  const MIN_COLUMN_WIDTH = 14;
  const MAX_COLUMN_WIDTH = 60;
  const requestedWidth = parseInt(ctx.args[0], 10) || DEFAULT_COLUMN_WIDTH;
  const columnWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, requestedWidth));
  // A cell keeps one space of padding on each side of its text.
  const textWidth = columnWidth - 2;
  // Reads the task list kept by the todo command (same localStorage key and
  // format); unreadable data just shows an empty board.
  const readTasks = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('ltsh.todo') || '[]');
      return Array.isArray(stored)
        ? stored.filter(
            (task) => task && typeof task.id === 'number' && typeof task.text === 'string',
          )
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

  // Word-wraps `text` to lines of at most `width` chars (hard-splits long words).
  const wrap = (text, width) => {
    const wrapped = [];
    let current = ''; // the line being filled
    for (let word of text.split(' ')) {
      // Hard-split words longer than a whole line.
      while (word.length > width) {
        if (current) {
          wrapped.push(current);
          current = '';
        }
        wrapped.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!current) {
        current = word;
      } else if ((current + ' ' + word).length <= width) {
        current += ' ' + word;
      } else {
        wrapped.push(current);
        current = word;
      }
    }
    if (current) wrapped.push(current);
    return wrapped;
  };

  // Each column becomes a list of plain-text rows, cards separated by a blank
  // row (a row is [text, isFirstLineOfCard]).
  const columnRows = COLUMNS.map((column) => {
    const rows = [];
    for (const task of tasks.filter((candidate) => candidate.status === column.key)) {
      // The id prefixes the card's first line; the next ones align under the text.
      const prefix = `#${task.id} `;
      const hangingIndent = ' '.repeat(prefix.length);
      wrap(task.text, textWidth - prefix.length).forEach((line, lineIndex) => {
        const isFirstLine = lineIndex === 0;
        rows.push([(isFirstLine ? prefix : hangingIndent) + line, isFirstLine]);
      });
      rows.push(['', false]);
    }
    // Drop the separator after the last card; an empty column shows a dash.
    if (rows.length) rows.pop();
    else rows.push(['—', false]);
    return rows;
  });
  const boardHeight = Math.max(...columnRows.map((rows) => rows.length));

  // ---- drawing (box characters are dimmed, like comments) ----
  const border = (chars) => `<span class="comment">${chars}</span>`;
  const horizontalRule = (left, junction, right) =>
    border(left + COLUMNS.map(() => '─'.repeat(columnWidth)).join(junction) + right);
  const cell = (text, color) => ` <span style="color:${color}">${E(text.padEnd(textWidth))}</span> `;
  const boxedRow = (cells) => border('│') + cells.join(border('│')) + border('│');

  const lines = [horizontalRule('┌', '┬', '┐')];
  const headers = COLUMNS.map((column) => {
    const cardCount = tasks.filter((task) => task.status === column.key).length;
    const heading = ` ${column.title} (${cardCount})`.padEnd(columnWidth);
    return `<span class="accent text-glow">${E(heading)}</span>`;
  });
  lines.push(boxedRow(headers));
  lines.push(horizontalRule('├', '┼', '┤'));
  for (let rowIndex = 0; rowIndex < boardHeight; rowIndex++) {
    const cells = COLUMNS.map((column, columnIndex) => {
      // A column shorter than the board is padded with empty cells.
      const row = columnRows[columnIndex][rowIndex] || [''];
      return cell(row[0], column.color);
    });
    lines.push(boxedRow(cells));
  }
  lines.push(horizontalRule('└', '┴', '┘'));
  ctx.append(`<div class="ln ascii-art">${lines.join('\n')}</div>`);
---
