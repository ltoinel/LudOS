---
name: nano
desc: edit a text file (a nano-like editor) — e.g. nano notes.txt
alias: edit vi vim
seo_title: Online text editor in your browser — nano-style, no signup
man: |
  # NANO(1)

  ## NAME
  nano — a small, friendly text editor

  ## SYNOPSIS
  nano [file]
  echo text | nano

  ## DESCRIPTION
  Opens the file in a full-window editor inside the terminal, in the style
  of GNU nano: a title bar, the text, a status line and the list of
  shortcuts at the bottom. A missing file is created when you save it; with
  no file name, nano asks for one on save. Text piped in becomes the new
  buffer.

  Files are saved in the shell's filesystem, in this browser. As guest you
  may write in your home directory; other places need `su`.

  The shortcuts are nano's, with one exception: browsers do not let a page
  catch Ctrl+W (it closes the tab), so search is on Ctrl+F. Every shortcut
  in the bottom bars can also be clicked or tapped — handy on a phone.

  ## SHORTCUTS
  ^S         save the file
  ^O         write out: save under a name (Enter keeps the current one)
  ^X         exit (asks to save a modified buffer: Y, N, or ^C to cancel)
  ^K         cut the current line (successive cuts stack up)
  ^U         paste the cut lines
  ^F         where is: search forward, wrapping around
  ^C         show the cursor position (copies when text is selected)
  ^G         show / hide this help
  ^Z         undo typing (the browser's native undo; not cut / paste)

  ## HOW IT WORKS
  The editor is a plain text area styled as a terminal: no plugin, no
  account, nothing sent to a server. Saved files go to the shell's
  filesystem, kept in this browser (localStorage) — they are still there
  after a reload, and gone if you clear the site's data.

  ## USE CASES
  - jot down a note or a snippet quickly, in a distraction-free editor;
  - practise nano's shortcuts before using it on a real server;
  - edit a document from the shell (cat about.md | nano) and save a copy.

  ## NOTES
  `vi` and `vim` open this same editor: it is not modal, so there is no
  insert mode and no :wq — type right away, save with ^S, quit with ^X.

  Files live only in this browser: they are not synced between devices.
  Copy anything you want to keep elsewhere (^C copies the selection).

  ## EXAMPLES
  nano notes.txt
  nano ~/todo.md
  cat about.md | nano

  ## SEE ALSO
  cat, touch, ls, grep
js: |
  // Self-contained, nano-like editor. The text lives in a <textarea> laid over
  // the terminal window; the file is read with ctx.read and written with
  // ctx.write (the shell's persisted filesystem). The command resolves when
  // the editor closes, so the shell prompt comes back afterwards.

  // ---- which file ----
  let path = (ctx.args[0] || '').trim();
  let text = '';
  let isNew = true;
  if (path) {
    const file = ctx.read(path);
    if (file.error === 'Is a directory' || file.error === 'Permission denied') {
      ctx.error(`nano: ${path}: ${file.error}`);
      return;
    }
    if (!file.error) {
      text = file.content;
      isNew = false;
      // ctx.read may have found the file with an implicit `.md`: save there.
      const base = path.split('/').pop();
      if (file.name && file.name !== base) path = path.slice(0, path.length - base.length) + file.name;
    }
  } else if (ctx.stdin) {
    text = ctx.stdin.endsWith('\n') ? ctx.stdin : `${ctx.stdin}\n`;
  }

  // ---- styles (once per page) ----
  if (!document.getElementById('nano-style')) {
    const style = document.createElement('style');
    style.id = 'nano-style';
    style.textContent = `
      .nano { position: absolute; left: 0; right: 0; bottom: 0; z-index: 5; display: flex;
        flex-direction: column; background: var(--bg); font-family: var(--font-mono);
        font-size: 14px; color: var(--fg); }
      .nano-title, .nano-keys button { background: var(--fg); color: var(--bg); }
      .nano-title { display: flex; justify-content: space-between; padding: 0.15rem 0.6rem;
        white-space: pre; }
      .nano-text { flex: 1; min-height: 0; margin: 0; padding: 0.4rem 0.6rem; border: 0;
        outline: none; resize: none; background: transparent; color: var(--fg);
        font: inherit; line-height: 1.5; caret-color: var(--green); white-space: pre;
        overflow: auto; tab-size: 4; }
      .nano-status { min-height: 1.5em; padding: 0 0.6rem; text-align: center;
        color: var(--fg-bright); white-space: pre-wrap; }
      .nano-status.is-prompt { text-align: left; }
      .nano-status input { background: transparent; border: 0; outline: none;
        color: var(--fg-bright); font: inherit; width: 60%; }
      .nano-keys { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
        gap: 0.1rem 0.6rem; padding: 0.2rem 0.6rem 0.35rem; }
      .nano-keys div { white-space: nowrap; cursor: pointer; }
      .nano-keys button { border: 0; padding: 0 0.2rem; margin-right: 0.35rem; font: inherit;
        cursor: pointer; }
      .nano-help { flex: 1; min-height: 0; overflow: auto; padding: 0.4rem 0.6rem; margin: 0;
        white-space: pre-wrap; color: var(--fg); }
    `;
    document.head.appendChild(style);
  }

  // ---- build the editor over the terminal window ----
  const anchor = ctx.append('<div class="ln comment">nano: editing…</div>');
  const win = anchor.closest('.ssh-win');
  if (!win) {
    // Not in a visible window (e.g. a headless run): there is nobody to edit.
    ctx.error('nano: needs an interactive terminal');
    return;
  }
  const bar = win.querySelector('.ssh-bar');
  const editor = document.createElement('div');
  editor.className = 'nano';
  editor.style.top = `${bar ? bar.offsetHeight : 0}px`;
  editor.innerHTML = `
    <div class="nano-title"><span>  nano</span><span class="nano-name"></span><span class="nano-flag"></span></div>
    <textarea class="nano-text" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
    <pre class="nano-help" hidden></pre>
    <div class="nano-status" role="status"></div>
    <div class="nano-keys"></div>`;
  win.appendChild(editor);

  const nameEl = editor.querySelector('.nano-name');
  const flagEl = editor.querySelector('.nano-flag');
  const area = editor.querySelector('.nano-text');
  const helpEl = editor.querySelector('.nano-help');
  const status = editor.querySelector('.nano-status');
  const keys = editor.querySelector('.nano-keys');
  area.value = text;
  area.setSelectionRange(0, 0);

  let saved = text; // content on disk, to tell whether the buffer is modified
  let cutBuffer = '';
  let lastWasCut = false; // successive ^K stack their lines, as in nano
  let statusTimer = 0;

  const modified = () => area.value !== saved;
  const refreshTitle = () => {
    nameEl.textContent = path || 'New Buffer';
    flagEl.textContent = modified() ? 'Modified  ' : '          ';
  };
  const say = (message) => {
    clearTimeout(statusTimer);
    status.classList.remove('is-prompt');
    status.textContent = message ? `[ ${message} ]` : '';
    if (message) statusTimer = setTimeout(() => (status.textContent = ''), 4000);
  };
  refreshTitle();
  const lineCount = (value) => (value === '' ? 0 : value.replace(/\n$/, '').split('\n').length);
  say(isNew ? (path ? 'New File' : '') : `Read ${lineCount(text)} lines`);

  // ---- status-bar prompts (file name, search, yes/no) ----
  // Resolves with the typed text, or null when cancelled (^C / Esc).
  const promptLine = (label, initial = '') =>
    new Promise((resolve) => {
      clearTimeout(statusTimer);
      status.classList.add('is-prompt');
      status.textContent = `${label}: `;
      const input = document.createElement('input');
      input.value = initial;
      status.appendChild(input);
      input.focus();
      input.select();
      const finish = (value) => {
        status.classList.remove('is-prompt');
        status.textContent = '';
        area.focus();
        resolve(value);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(input.value);
        } else if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) {
          e.preventDefault();
          finish(null);
        }
      });
    });

  // One key among `choices` (e.g. "yn"); null when cancelled.
  const promptKey = (label, choices) =>
    new Promise((resolve) => {
      clearTimeout(statusTimer);
      status.classList.add('is-prompt');
      status.textContent = label;
      const onKey = (e) => {
        const key = e.key.toLowerCase();
        const cancel = e.key === 'Escape' || (e.ctrlKey && key === 'c');
        if (!cancel && !choices.includes(key)) return;
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('keydown', onKey, true);
        status.classList.remove('is-prompt');
        status.textContent = '';
        area.focus();
        resolve(cancel ? null : key);
      };
      document.addEventListener('keydown', onKey, true);
    });

  // ---- actions ----
  const write = async (askName) => {
    let target = path;
    if (askName || !target) {
      const typed = await promptLine('File Name to Write', target);
      if (typed === null || !typed.trim()) {
        say('Cancelled');
        return false;
      }
      target = typed.trim();
    }
    // nano ends a file with a newline.
    const content = area.value && !area.value.endsWith('\n') ? `${area.value}\n` : area.value;
    const error = ctx.write(target, content);
    if (error) {
      say(`Error writing ${target}: ${error.replace(/^.*?: /, '')}`);
      return false;
    }
    path = target;
    area.value = content;
    saved = content;
    refreshTitle();
    say(`Wrote ${lineCount(content)} lines`);
    return true;
  };

  // Start/end offsets of the line holding the caret (end includes its \n).
  const currentLine = () => {
    const value = area.value;
    const caret = area.selectionStart;
    const start = value.lastIndexOf('\n', caret - 1) + 1;
    const newline = value.indexOf('\n', caret);
    return { start, end: newline === -1 ? value.length : newline + 1 };
  };

  // Replaces a range of the buffer and leaves the caret after it.
  const replaceRange = (start, end, replacement) => {
    area.focus();
    area.setRangeText(replacement, start, end, 'end');
    refreshTitle();
  };

  const cutLine = () => {
    const { start, end } = currentLine();
    if (start === end) return;
    const line = area.value.slice(start, end);
    cutBuffer = lastWasCut ? cutBuffer + line : line;
    replaceRange(start, end, '');
    lastWasCut = true;
  };

  const paste = () => {
    if (!cutBuffer) {
      say('Cutbuffer is empty');
      return;
    }
    const { start } = currentLine();
    replaceRange(start, start, cutBuffer);
  };

  let lastSearch = '';
  const search = async () => {
    const typed = await promptLine(`Search${lastSearch ? ` [${lastSearch}]` : ''}`);
    if (typed === null) {
      say('Cancelled');
      return;
    }
    const needle = typed || lastSearch;
    if (!needle) return;
    lastSearch = needle;
    const value = area.value;
    let at = value.indexOf(needle, area.selectionEnd);
    let wrapped = false;
    if (at === -1) {
      at = value.indexOf(needle);
      wrapped = at !== -1;
    }
    if (at === -1) {
      say(`"${needle}" not found`);
      return;
    }
    area.focus();
    area.setSelectionRange(at, at + needle.length);
    // Scroll the match into view: position by line.
    const line = value.slice(0, at).split('\n').length - 1;
    area.scrollTop = Math.max(0, line * parseFloat(getComputedStyle(area).lineHeight) - area.clientHeight / 2);
    if (wrapped) say('Search Wrapped');
  };

  const cursorPosition = () => {
    const value = area.value;
    const caret = area.selectionStart;
    const lines = value.split('\n');
    const line = value.slice(0, caret).split('\n').length;
    const column = caret - (value.lastIndexOf('\n', caret - 1) + 1) + 1;
    const lineLength = lines[line - 1].length + 1;
    const pct = (n, total) => Math.round((n / Math.max(total, 1)) * 100);
    say(
      `line ${line}/${lines.length} (${pct(line, lines.length)}%), ` +
        `col ${column}/${lineLength} (${pct(column, lineLength)}%), ` +
        `char ${caret}/${value.length} (${pct(caret, value.length)}%)`,
    );
  };

  const HELP = [
    'nano help',
    '',
    'Type to edit. The shortcuts below use Ctrl (^); they can also be clicked.',
    '',
    '^S  Save            ^O  Write Out (save as)     ^X  Exit',
    '^K  Cut line        ^U  Paste                   ^F  Where Is (search)',
    '^C  Cursor position ^G  This help               ^Z  Undo typing',
    '',
    'Ctrl+W is kept by the browser (it closes the tab), so search is on ^F.',
    '',
    'Press ^G again to go back to the text.',
  ].join('\n');
  const toggleHelp = () => {
    const showing = helpEl.hidden;
    helpEl.textContent = HELP;
    helpEl.hidden = !showing;
    area.hidden = showing;
    if (!showing) area.focus();
  };

  // Resolves the command: removes the editor and hands the shell back.
  let close = () => {};
  const done = new Promise((resolve) => {
    close = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      editor.remove();
      anchor.textContent = `nano: ${path || 'New Buffer'} closed`;
      resolve();
    };
  });

  const exit = async () => {
    if (modified()) {
      const answer = await promptKey('Save modified buffer?  Y Yes   N No   ^C Cancel', 'yn');
      if (answer === null) {
        say('Cancelled');
        return;
      }
      if (answer === 'y' && !(await write(false))) return;
    }
    close();
  };

  // ---- shortcuts (keyboard and clickable) ----
  const ACTIONS = {
    g: ['Help', toggleHelp],
    o: ['Write Out', () => write(true)],
    s: ['Save', () => write(false)],
    f: ['Where Is', search],
    k: ['Cut', cutLine],
    u: ['Paste', paste],
    c: ['Cur Pos', cursorPosition],
    x: ['Exit', exit],
  };
  for (const [key, [label, action]] of Object.entries(ACTIONS)) {
    const item = document.createElement('div');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `^${key.toUpperCase()}`;
    item.append(button, label);
    item.addEventListener('click', () => {
      lastWasCut = false;
      action();
    });
    keys.appendChild(item);
  }

  // Capture phase: runs before the terminal's own handlers and the browser's
  // defaults (Ctrl+S "save page", Ctrl+O "open file"…).
  function onKeyDown(e) {
    if (!editor.contains(e.target) || !e.ctrlKey || e.altKey || e.metaKey) return;
    if (status.classList.contains('is-prompt')) return; // a prompt owns the keys
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'y') return; // native undo / redo
    // With text selected, ^C stays the browser's "copy".
    if (key === 'c' && area.selectionStart !== area.selectionEnd) return;
    const entry = ACTIONS[key];
    if (!entry) return;
    e.preventDefault();
    e.stopPropagation();
    if (key !== 'k') lastWasCut = false;
    entry[1]();
  }
  document.addEventListener('keydown', onKeyDown, true);
  area.addEventListener('input', () => {
    lastWasCut = false;
    refreshTitle();
  });

  // Ctrl+C outside the editor (the shell's interrupt) closes it without saving.
  ctx.signal?.addEventListener('abort', () => close(), { once: true });

  // Focus on the next tick: the Enter key that launched nano must not land in
  // the buffer as a newline.
  setTimeout(() => area.focus(), 0);
  await done;
---
