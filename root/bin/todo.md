---
name: todo
desc: lightweight task manager — e.g. todo add "finish the project", todo ls
alias: task
page: false
man: |
  # TODO(1)

  ## NAME
  todo — manage a personal task list

  ## SYNOPSIS
  todo [ls] [--all]
  todo add <text>
  todo start | done | reset <id>
  todo edit <id> <text>
  todo rm <id>
  todo clear

  ## DESCRIPTION
  A small task manager whose list is saved in this browser
  (localStorage, key ltsh.todo) and shared by every shell window. Each task has an id
  and a status — todo, doing or done — which the kanban command shows
  as a board.

  `todo` alone (or `todo ls`) lists the open tasks; `--all` also lists
  the finished ones.

  ## COMMANDS
  add <text>       add a task (quotes optional)
  ls [--all]       list tasks (open ones by default)
  start <id>       move a task to "doing"
  done <id>        mark a task as done
  reset <id>       move a task back to "todo"
  edit <id> <text> change a task's text
  rm <id>          delete a task
  clear            delete every finished task

  ## EXAMPLES
  todo add "Finish the project"
  todo start 1
  todo done 1
  todo ls --all

  ## SEE ALSO
  kanban, pomodoro
js: |
  // Self-contained task store. Tasks live in localStorage under `ltsh.todo`
  // as [{ id, text, status: 'todo'|'doing'|'done', created, updated }] — the
  // kanban command reads the same key.
  const STORAGE_KEY = 'ltsh.todo';
  const STATUSES = ['todo', 'doing', 'done'];
  const MAX_LENGTH = 200;

  // Re-read on every call so several shell windows stay in sync. Corrupt or
  // unreadable data yields an empty list rather than an error.
  const loadTasks = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) {
        return [];
      }
      return stored.filter(
        (task) =>
          task && typeof task.id === 'number' && typeof task.text === 'string' &&
          STATUSES.includes(task.status),
      );
    } catch {
      return [];
    }
  };
  const saveTasks = (tasks) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      return true;
    } catch {
      ctx.error('todo: could not save (storage full or blocked)');
      return false;
    }
  };
  const cleanText = (text) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);

  // ---- display ----
  const E = ctx.escape;
  const MARK = { todo: '[ ]', doing: '[~]', done: '[x]' };
  const COLOR = { todo: 'var(--fg)', doing: 'var(--amber)', done: 'var(--dim)' };
  const showTask = (task) => {
    const text = task.status === 'done' ? `<s>${E(task.text)}</s>` : E(task.text);
    ctx.append(
      `<div class="ln"><span class="comment">${String(task.id).padStart(3)}</span> ` +
        `<span style="color:${COLOR[task.status]}">${MARK[task.status]} ${text}</span></div>`,
    );
  };

  // ---- sub-commands ----
  const [sub = 'ls', ...rest] = ctx.args;

  // Parses the task id argument; prints usage and returns null when invalid.
  const parseId = () => {
    const id = parseInt(rest[0], 10);
    if (!(id > 0)) {
      ctx.error(`usage: todo ${sub} <id>`);
      return null;
    }
    return id;
  };

  // Applies `change` to task `id`, saves, and reports with `verb`.
  const updateTask = (id, verb, change) => {
    const tasks = loadTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      ctx.error(`todo: no task #${id}`);
      return;
    }
    change(task);
    task.updated = new Date().toISOString();
    if (saveTasks(tasks)) {
      ctx.line(`${verb} #${task.id}: ${task.text}`);
    }
  };

  if (sub === 'ls' || sub === 'list') {
    const showAll = rest.includes('--all') || rest.includes('-a');
    const tasks = loadTasks().sort((a, b) => a.id - b.id);
    const shown = showAll ? tasks : tasks.filter((t) => t.status !== 'done');
    if (!shown.length) {
      ctx.line(
        tasks.length
          ? 'nothing left to do 🎉 (todo ls --all to see finished tasks)'
          : 'no task yet — try: todo add "my first task"',
      );
      return;
    }
    shown.forEach(showTask);
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    ctx.sysLine(`${tasks.length - doneCount} open · ${doneCount} done`);
  } else if (sub === 'add') {
    const text = cleanText(rest.join(' '));
    if (!text) {
      ctx.error('usage: todo add <text>');
      return;
    }
    const tasks = loadTasks();
    const now = new Date().toISOString();
    const task = {
      id: tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1,
      text,
      status: 'todo',
      created: now,
      updated: now,
    };
    tasks.push(task);
    if (saveTasks(tasks)) {
      ctx.line(`added #${task.id}: ${task.text}`);
    }
  } else if (sub === 'start' || sub === 'done' || sub === 'reset') {
    const id = parseId();
    if (id) {
      const status = { start: 'doing', done: 'done', reset: 'todo' }[sub];
      const verb = { start: 'started', done: 'done', reset: 'reset' }[sub];
      updateTask(id, verb, (task) => {
        task.status = status;
      });
    }
  } else if (sub === 'edit') {
    const id = parseId();
    const text = cleanText(rest.slice(1).join(' '));
    if (id && !text) {
      ctx.error('usage: todo edit <id> <text>');
    } else if (id) {
      updateTask(id, 'edited', (task) => {
        task.text = text;
      });
    }
  } else if (sub === 'rm' || sub === 'del') {
    const id = parseId();
    if (id) {
      const tasks = loadTasks();
      const kept = tasks.filter((t) => t.id !== id);
      if (kept.length === tasks.length) {
        ctx.error(`todo: no task #${id}`);
      } else if (saveTasks(kept)) {
        ctx.line(`removed #${id}`);
      }
    }
  } else if (sub === 'clear') {
    const tasks = loadTasks();
    const kept = tasks.filter((t) => t.status !== 'done');
    if (saveTasks(kept)) {
      ctx.line(`removed ${tasks.length - kept.length} finished task(s)`);
    }
  } else {
    ctx.error(`todo: unknown command "${sub}" — see man todo`);
  }
---
