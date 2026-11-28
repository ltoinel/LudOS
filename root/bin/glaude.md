---
name: glaude
desc: builds hideous, flashy websites with a local LLM (WebGPU) — Claude Code style, by "le Glaude"
agent: no
alias: soupe
seo_title: AI website generator — local LLM, 1997 GeoCities style
man: |
  # GLAUDE(1)

  ## NAME
  glaude — a workshop for (deliberately ugly and flashy) websites, Claude Code
  style, starring "le Glaude" from the French film *La Soupe aux Choux*

  ## SYNOPSIS
  glaude
  glaude --list
  glaude <number>
  glaude <model-id>
  glaude --unload

  ## DESCRIPTION
  glaude is a nod to Claude Code: the look (banner, welcome box, › prompt),
  but driven by an open-source *coding* LLM running entirely in your browser —
  no server, no network call for inference. The engine (loading, cache, GPU)
  is handled by the central LLM module (see `llm` and the widget in the
  top-right corner); glaude shares the resident model with miaougpt and denree.

  Its specialty: churning out **horribly ugly, flashy HTML sites** — neon
  backgrounds, rainbow gradients, Comic Sans, scrolling <marquee>, blinking
  text, emojis everywhere. In short, the GeoCities look of 1997.

  By default no model is loaded: glaude suggests a coding model and asks you
  to confirm its download (unless a model is already warm).

  On launch, glaude shows "la Denrée" (the film's alien) in ASCII art, then —
  just like Claude Code bootstraps a project — it **suggests a project name
  and location** in your filesystem (/home/guest/<project>). Once you accept,
  glaude creates the folder, writes a (very ugly) starter index.html in it and
  moves there.

  Then describe the page you want: le Glaude answers with a complete HTML
  document. /save writes it to the project (persisted in the browser), and
  /show opens a fake browser to admire the carnage.

  ## QUALITY
  The look is ugly on purpose; the markup is not. Every generated page goes
  through a check before it can be saved: a page cut short by the model's
  output limit is closed properly (the commonest defect of a small model),
  the doctype, charset, viewport and title are guaranteed, and any
  JavaScript is removed — the preview is sandboxed, and a downloaded
  project should not carry code nobody reviewed. Whatever was fixed is
  listed under the answer.

  Half of the model's context window is kept for writing the page; the
  prompt holds your recent requests and the current page, so a change
  ("make the title bigger") starts from what is there. /undo steps back
  when a new version is worse than the last.

  ## OPTIONS
  --list, -l        list the recommended coding models
  --unload, --stop  free the loaded model from GPU memory

  ## CHAT COMMANDS
  /show [file]      open a fake browser on the result (default index.html)
  /save [file]      write the last generated page to the project
  /undo             go back to the previous generated page
  /download /zip    download the whole project as a .zip archive
  /files /ls        list the project files
  /project /pwd     show the project and its path
  /reset /clear     forget the context (keeps the project and the model)
  /model            show the loaded model
  /exit /quit /bye  end the session
  /help             list these commands

  ## EXAMPLES
  glaude
  glaude 1
  glaude Qwen2.5-Coder-3B
  glaude --unload

  ## SEE ALSO
  llm, miaougpt, denree, mkdir, touch, ls
js: |
  // glaude — a Claude Code parody powered by the central LLM module (ctx.llm),
  // specialized in building hideous, flashy HTML sites. On launch it bootstraps
  // a project under /home/guest/<project>, then opens a session where
  // "le Glaude" generates pages. Model loading, cache and token counting are
  // handled by the single manager (src/lib/llm.ts).
  const E = ctx.escape;
  const args = ctx.args.slice();
  const first = args[0];

  // Recommended coding models (smallest first). `base` = id without the
  // quantization suffix; the central manager picks the right build.
  const RECOMMENDED = [
    { label: 'Qwen2.5-Coder 0.5B', base: 'Qwen2.5-Coder-0.5B-Instruct', gb: 0.9 },
    { label: 'Qwen2.5-Coder 1.5B', base: 'Qwen2.5-Coder-1.5B-Instruct', gb: 1.9 },
    { label: 'Qwen2.5-Coder 3B', base: 'Qwen2.5-Coder-3B-Instruct', gb: 3.3 },
    { label: 'Qwen2.5-Coder 7B', base: 'Qwen2.5-Coder-7B-Instruct', gb: 8.1 },
  ];
  const DEFAULT = { base: 'Qwen2.5-Coder-1.5B-Instruct', label: 'Qwen2.5-Coder 1.5B', gb: 1.9 };

  // ---- glaude --unload: free the resident model ----
  if (first === '--unload' || first === '--stop') {
    const freed = await ctx.llm.unload();
    ctx.line(freed ? 'glaude: model unloaded, GPU memory freed.' : 'glaude: no model loaded.');
    return;
  }

  // ---- "la Denrée" in colored pixel art (the alien from La Soupe aux Choux) ----
  // One character = one pixel: the letter picks its colour in the palette,
  // `.` and space are transparent.
  const PALETTE = {
    R: '#e23b2e', // red (suit)
    D: '#a82018', // dark red (suit shading)
    B: '#e9c277', // beige (skin)
    N: '#6e4a2b', // brown (eye sockets, nose)
    W: '#ffffff', // white (eyes)
    o: '#2a2a2a', // near-black (pupils, mouth)
  };
  const UNKNOWN_COLOR = '#888';
  const DENREE_PIXELS = [
    '       RRRRRR       ',
    '      RRRRRRRR      ',
    '      DRRRRRRD      ',
    '      BBBBBBBB      ',
    '...RR.BBBBBBBB.RR...',
    '.DRRRRBBBBBBBBRRRRD.',
    '.DRRRRBNNBBNNBRRRRD.',
    '.DRRRRBWoBBoWBRRRRD.',
    '...RR.BBBNNBBB.RR...',
    '.......BBBooBBB.....',
    '.......BBBBBB.......',
    '..RRRRBBBBBBBBRRRR..',
    'DRRRRRBBBBBBBBRRRRRD',
    '..RRR.BBBBBBBB.RRR..',
    '....BBBBBBBBBBBB....',
    '.....BBBBBBBBBB.....',
    '......BBBBBBBB......',
  ];
  // Renders one pixel row. Each pixel is two characters wide (a terminal cell
  // is about twice as tall as wide), and a run of same-coloured pixels shares
  // one <span>.
  const renderPixelRow = (row) => {
    let html = '';
    let runStart = 0;
    while (runStart < row.length) {
      const pixel = row[runStart];
      let runEnd = runStart;
      while (runEnd < row.length && row[runEnd] === pixel) runEnd++;
      const runLength = runEnd - runStart;
      if (pixel === '.' || pixel === ' ') {
        html += '  '.repeat(runLength);
      } else {
        const color = PALETTE[pixel] || UNKNOWN_COLOR;
        html += '<span style="color:' + color + '">' + '██'.repeat(runLength) + '</span>';
      }
      runStart = runEnd;
    }
    return '<div class="ln ascii-art">' + html + '</div>';
  };
  // The drawing is 40 columns wide: too much for a phone, which gets a title.
  const NARROW_SCREEN_PX = 680;
  const ROW_REVEAL_DELAY_MS = 28; // the alien is drawn row by row
  const narrow = typeof window !== 'undefined' && window.innerWidth < NARROW_SCREEN_PX;
  if (narrow) {
    ctx.append(
      '<div class="ln ascii-art"><span class="accent text-glow">░▒▓ la Denrée ▓▒░</span></div>',
    );
  } else {
    for (const row of DENREE_PIXELS) {
      ctx.append(renderPixelRow(row));
      await ctx.sleep(ROW_REVEAL_DELAY_MS);
    }
  }
  ctx.line('');

  // Claude Code-style welcome box.
  const box = (text) => '<div class="ln ascii-art"><span class="accent">' + E(text) + '</span></div>';
  ctx.append(box('╭──────────────────────────────────────────────╮'));
  ctx.append(
    '<div class="ln ascii-art"><span class="accent">│ </span><span class="accent text-glow">✻</span><span class="accent"> Welcome to Glaude Code                     │</span></div>',
  );
  ctx.append(box('│                                              │'));
  ctx.append(box('│   the worst webmaster in Bourbonnais 🥬      │'));
  ctx.append(box('│   /help · /show to admire · /exit            │'));
  ctx.append(box('╰──────────────────────────────────────────────╯'));
  ctx.line('');

  // ---- model list (no WebGPU needed) ----
  if (first === '--list' || first === '-l') {
    ctx.line('Recommended coding models (smallest first):');
    ctx.line('');
    RECOMMENDED.forEach((model, i) => {
      ctx.append(
        '<div class="ln out"><span class="accent">' +
          (i + 1) +
          ')</span> ' +
          '<span class="cmd">' +
          E(model.label) +
          '</span> ' +
          '<span class="comment">≈ ' +
          E(model.gb.toFixed(1)) +
          ' GB</span></div>',
      );
    });
    ctx.line('');
    ctx.line('Start:  glaude <number>   (e.g. glaude 1)   ·   all models: `llm --list-all`');
    return;
  }

  // ---- small file helpers ----
  const MAX_SLUG_LENGTH = 48;
  // A safe file/folder name: accents stripped (NFD splits them off as
  // combining marks), lowercase, anything exotic collapsed to a dash.
  const slugify = (text) =>
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, MAX_SLUG_LENGTH);
  // The file a chat command targets: the user's name (slugified, `.html` by
  // default) or the fallback when none was given.
  const fileName = (requested, fallback) => {
    let name = slugify(requested) || fallback;
    if (!/\.[a-z0-9]+$/.test(name)) name += '.html';
    return name;
  };
  // Pulls the HTML page out of a model answer, from the most to the least
  // explicit form: a ```html block, any code block holding markup, a block the
  // model did not get to close, or raw HTML. Returns '' when there is no page.
  const extractHtml = (text) => {
    if (!text) return '';
    const htmlBlock = text.match(/```html\s*([\s\S]*?)```/i);
    if (htmlBlock) return htmlBlock[1].trim();
    const anyBlock = text.match(/```\s*([\s\S]*?)```/);
    if (anyBlock && /<[a-z!]/i.test(anyBlock[1])) return anyBlock[1].trim();
    // A block left open: the answer was cut before its closing fence.
    const openBlock = text.match(/```(?:html)?\s*([\s\S]*)$/i);
    if (openBlock && /<[a-z!]/i.test(openBlock[1])) return openBlock[1].trim();
    // Raw markup, possibly after a sentence: the page starts at its first tag.
    const firstTag = text.search(/<!doctype|<html|<body|<div|<h1|<marquee/i);
    return firstTag >= 0 ? text.slice(firstTag).trim() : '';
  };

  // ---- fake browser: shows the rendered HTML in its own window ----
  const openBrowser = (url, html) => {
    if (!document.getElementById('glb-style')) {
      // The stylesheet is injected once and shared by every later window.
      const style = document.createElement('style');
      style.id = 'glb-style';
      style.textContent = `
        .glb-back {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, .55);
          z-index: 9997;
        }
        .glb-win {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(900px, 92vw);
          height: min(78vh, 680px);
          min-width: 320px;
          min-height: 240px;
          background: #c9d2da;
          border: 1px solid #2a2f36;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          resize: both;
          z-index: 9998;
          box-shadow: 0 40px 90px -30px rgba(0, 0, 0, .85);
        }
        .glb-bar {
          display: flex;
          align-items: center;
          gap: .6rem;
          padding: .45rem .6rem;
          background: linear-gradient(#eef2f6, #d3dbe2);
          border-bottom: 1px solid #9aa4ad;
          font: 13px/1.2 system-ui, sans-serif;
          color: #333;
        }
        .glb-dots {
          display: flex;
          gap: .4rem;
        }
        .glb-dots i {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          display: inline-block;
          border: 1px solid rgba(0, 0, 0, .25);
        }
        .glb-nav {
          border: 1px solid #9aa4ad;
          background: #fafcff;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 2px 7px;
          color: #333;
        }
        .glb-nav:hover {
          background: #fff;
        }
        .glb-url {
          flex: 1;
          background: #fff;
          border: 1px solid #9aa4ad;
          border-radius: 12px;
          padding: 3px 12px;
          color: #225;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font: 12px/1.4 ui-monospace, monospace;
        }
        .glb-x {
          margin-left: .2rem;
          border: none;
          background: #e2554b;
          color: #fff;
          width: 22px;
          height: 22px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
        }
        .glb-x:hover {
          filter: brightness(1.1);
        }
        .glb-frame {
          flex: 1;
          width: 100%;
          border: 0;
          background: #fff;
        }
      `;
      document.head.appendChild(style);
    }
    // A previous window is closed through its own `close`, which also removes
    // its Escape listener from `document` (a bare remove() would leak it).
    const oldWin = document.getElementById('glb-win');
    if (oldWin && typeof oldWin.glbClose === 'function') oldWin.glbClose();
    else if (oldWin) oldWin.remove();
    const oldBack = document.getElementById('glb-back');
    if (oldBack) oldBack.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'glb-back';
    backdrop.className = 'glb-back';
    const win = document.createElement('div');
    win.id = 'glb-win';
    win.className = 'glb-win';
    // Title bar (traffic lights, reload, address, close) above the page. The
    // empty `sandbox` attribute runs the generated page with no script and no
    // access to the portal.
    win.innerHTML = `
      <div class="glb-bar">
        <span class="glb-dots">
          <i style="background:#ff5f56"></i>
          <i style="background:#ffbd2e"></i>
          <i style="background:#27c93f"></i>
        </span>
        <button class="glb-nav" data-act="reload" title="Reload" type="button">⟳</button>
        <span class="glb-url"></span>
        <button class="glb-x" data-act="close" title="Close" type="button">✕</button>
      </div>
      <iframe class="glb-frame" sandbox=""></iframe>
    `;
    // textContent: the address is user-derived text, never markup.
    win.querySelector('.glb-url').textContent = url;
    const frame = win.querySelector('.glb-frame');
    frame.srcdoc = html;
    document.body.appendChild(backdrop);
    document.body.appendChild(win);

    const close = () => {
      win.remove();
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    win.glbClose = close; // lets the next /show close this window cleanly
    backdrop.addEventListener('click', close);
    win.querySelector('[data-act=close]').addEventListener('click', close);
    win.querySelector('[data-act=reload]').addEventListener('click', () => {
      frame.srcdoc = html;
    });
  };

  // ---- mini ZIP archiver ("stored" method, plain JS, no dependency) ----
  // CRC-32 (the checksum ZIP stores per file), table-driven: entry n is the
  // CRC of the single byte n, with the reflected polynomial 0xEDB88320.
  const CRC32_POLYNOMIAL = 0xedb88320;
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let byte = 0; byte < 256; byte++) {
      let crc = byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 1 ? CRC32_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
      }
      table[byte] = crc >>> 0;
    }
    return table;
  })();
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const concatBytes = (chunks) => {
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const joined = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      joined.set(chunk, position);
      position += chunk.length;
    }
    return joined;
  };
  // ZIP integers are little-endian.
  const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  // Record signatures ("PK.."), and the format version every entry declares.
  const ZIP_LOCAL_HEADER = 0x04034b50;
  const ZIP_CENTRAL_HEADER = 0x02014b50;
  const ZIP_END_OF_DIRECTORY = 0x06054b50;
  const ZIP_VERSION = 20; // 2.0, the baseline every unzip tool reads

  // An archive is: one [local header + data] per file, then the central
  // directory (one record per file, pointing back at its local header), then
  // the end-of-directory record. `files` is [{ name, data: Uint8Array }].
  const buildZip = (files) => {
    const encoder = new TextEncoder();
    const localRecords = [];
    const centralRecords = [];
    let offset = 0; // where the next local header starts in the archive
    for (const file of files) {
      const name = encoder.encode(file.name);
      const crc = crc32(file.data);
      const size = file.data.length;
      const localRecord = concatBytes([
        u32(ZIP_LOCAL_HEADER),
        u16(ZIP_VERSION), // version needed to extract
        u16(0), // general-purpose flags
        u16(0), // compression method: 0 = stored
        u16(0), // modification time (unset)
        u16(0), // modification date (unset)
        u32(crc),
        u32(size), // compressed size (= size: stored)
        u32(size), // uncompressed size
        u16(name.length),
        u16(0), // extra field length
        name,
        file.data,
      ]);
      localRecords.push(localRecord);
      centralRecords.push(
        concatBytes([
          u32(ZIP_CENTRAL_HEADER),
          u16(ZIP_VERSION), // version made by
          u16(ZIP_VERSION), // version needed to extract
          u16(0), // general-purpose flags
          u16(0), // compression method: 0 = stored
          u16(0), // modification time (unset)
          u16(0), // modification date (unset)
          u32(crc),
          u32(size), // compressed size
          u32(size), // uncompressed size
          u16(name.length),
          u16(0), // extra field length
          u16(0), // comment length
          u16(0), // disk number
          u16(0), // internal attributes
          u32(0), // external attributes
          u32(offset), // position of the local header
          name,
        ]),
      );
      offset += localRecord.length;
    }
    const centralDirectory = concatBytes(centralRecords);
    const endOfDirectory = concatBytes([
      u32(ZIP_END_OF_DIRECTORY),
      u16(0), // this disk
      u16(0), // disk holding the central directory
      u16(files.length), // entries on this disk
      u16(files.length), // entries in total
      u32(centralDirectory.length),
      u32(offset), // where the central directory starts
      u16(0), // comment length
    ]);
    return concatBytes([...localRecords, centralDirectory, endOfDirectory]);
  };

  // ---- project bootstrap (before loading the model, like Claude Code) ----
  const HOME = (ctx.cfg && ctx.cfg.home) || '/home/guest';
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  // Rustic French-countryside flavor, in the spirit of le Glaude.
  const NOUNS = [
    'baguette',
    'cheese',
    'bistro',
    'veggie-patch',
    'vineyard',
    'snail',
    'accordion',
    'camembert',
    'terroir',
    'stewpot',
    'soup',
    'cabbage',
    'beret',
    'croissant',
    'red-wine',
    'dance-hall',
    'flea-market',
    'turnip',
    'dandelion',
    'artichoke',
  ];
  const ADJECTIVES = [
    'magnificent',
    'flamboyant',
    'tremendous',
    'fantastic',
    'sensational',
    'picturesque',
    'majestic',
    'crunchy',
    'authentic',
    'rustic',
    'breathtaking',
    'thundering',
    'tasty',
    'flashy',
    'extraordinary',
  ];
  const suggested = slugify(pick(NOUNS) + '-' + pick(ADJECTIVES)) || 'tremendous-project';

  ctx.append(
    '<div class="ln"><span class="accent text-glow">✻</span> <span class="comment">le Glaude: “Right, what site are we building today?”</span></div>',
  );
  let projName = slugify(((await ctx.ask('project name? [' + suggested + ']')) || '').trim());
  if (!projName) projName = suggested;
  const projPath = HOME + '/' + projName;

  // Enter (or anything but an explicit no) accepts.
  const confirmation = ((await ctx.ask('create "' + projPath + '" and work there? [Y/n]')) || '')
    .trim()
    .toLowerCase();
  if (confirmation === 'n' || confirmation === 'no') {
    ctx.line('glaude: cancelled — no project created.');
    return;
  }

  const mkdirError = ctx.mkdir(projPath, true);
  if (mkdirError) {
    ctx.error('glaude: ' + mkdirError);
    return;
  }
  // The starter page, one source line per array entry. It is the user's file
  // (shown by `cat`, edited with `nano`), so its text is kept exactly as is.
  const STARTER =
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<title>' + projName + '</title>',
      '<style>',
      'body{margin:0;background:#ff00ea;font-family:"Comic Sans MS","Comic Sans",cursive;text-align:center;color:#00ff00}',
      'h1{font-size:3rem;text-shadow:3px 3px 0 #ff0,6px 6px 0 #f00}',
      '.rainbow{background:linear-gradient(90deg,red,orange,yellow,green,blue,indigo,violet);' +
        '-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.blink{animation:b .6s steps(2) infinite}@keyframes b{50%{opacity:0}}',
      '</style>',
      '</head>',
      '<body>',
      '<marquee behavior="alternate"><h1 class="rainbow">🥬 ' + projName + ' 🥬</h1></marquee>',
      '<p class="blink">UNDER CONSTRUCTION !!! Ask le Glaude to fill it in!</p>',
      '<marquee direction="right">⭐⭐⭐ Welcome to the most beautiful site on the web ⭐⭐⭐</marquee>',
      '</body>',
      '</html>',
    ].join('\n') + '\n';
  const writeError = ctx.write(projPath + '/index.html', STARTER);
  if (writeError) {
    ctx.error('glaude: ' + writeError);
    return;
  }
  const cdError = ctx.cd(projPath);
  if (cdError) ctx.error('glaude: ' + cdError);
  ctx.append(
    '<div class="ln"><span class="comment">[</span><span class="accent text-glow"> OK </span><span class="comment">] project "' +
      E(projName) +
      '" created in ' +
      E(projPath) +
      '</span></div>',
  );
  ctx.append(
    '<div class="ln comment">         starter index.html written — type /show to admire it.</div>',
  );
  ctx.line('');

  // ---- model loading through the central module (consent + progress bar) ----
  // Reuses the warm model if there is one and none was requested; otherwise
  // suggests a coding model (by number, id, or the default).
  let session;
  try {
    const state = ctx.llm.state();
    if (state && state.modelId && !first) {
      session = { modelId: state.modelId, label: state.label };
      ctx.line('le Glaude reuses the warm model: ' + (state.label || state.modelId));
    } else {
      let base = DEFAULT.base;
      let label = DEFAULT.label;
      let gb = DEFAULT.gb;
      if (first && /^\d+$/.test(first)) {
        // A number picks a line of `glaude --list` (1-based).
        const choice = parseInt(first, 10);
        if (choice >= 1 && choice <= RECOMMENDED.length) {
          base = RECOMMENDED[choice - 1].base;
          label = RECOMMENDED[choice - 1].label;
          gb = RECOMMENDED[choice - 1].gb;
        } else {
          ctx.error('glaude: no recommended model #' + choice + ' — see: glaude --list');
          return;
        }
      } else if (first) {
        // Anything else is a model id (or part of one); its size is unknown.
        base = first;
        label = first;
        gb = undefined;
      }
      session = await ctx.llm.ensure({ base, label, gb, reason: 'le Glaude codes your site' });
    }
  } catch (e) {
    ctx.error('glaude: ' + ((e && (e.message || e.name)) || e));
    ctx.line('le Glaude needs WebGPU. Try a recent Chrome/Edge (≥ 113) or Safari 18+.');
    ctx.line('(Your project "' + projName + '" is still there — run `glaude` again to /show it.)');
    return;
  }
  if (!session) {
    ctx.line('glaude: cancelled — no model loaded (your project "' + projName + '" is still there).');
    return;
  }
  const modelId = session.modelId;

  // Terminal scroll anchor (stays pinned to the bottom while streaming).
  const scroller = ctx
    .append('<div class="ln comment">engine ready — ' + E(session.label || modelId) + '</div>')
    .closest('.ssh-body');
  const toBottom = () => {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  // ---- session: site generation ----
  ctx.line('');
  ctx.append(
    '<div class="ln"><span class="accent text-glow">● le Glaude is tinkering with your site</span> <span class="comment">— ' +
      E(modelId) +
      ' · project ' +
      E(projName) +
      '</span></div>',
  );
  ctx.line('Describe the page you want, press Enter. Then /save to write it, /show to admire it.');
  ctx.line('Commands: /help · /show · /save · /undo · /download · /files · /reset · /exit');
  ctx.line('');

  // The page is meant to be ugly, not broken: the look is the joke, the markup
  // underneath has to be a valid, complete document.
  const SYSTEM_PROMPT =
    'You are "le Glaude" (Claude Ratinier), an old farmer from the Bourbonnais in the French film ' +
    '*La Soupe aux Choux*, turned webmaster in the manner of Claude Code. ' +
    "You run entirely in the user's browser through WebLLM, with no server. " +
    'Your specialty: building DELIBERATELY HIDEOUS and ULTRA-FLASHY websites, ' +
    'GeoCities 1997 style — eye-searing neon backgrounds, rainbow gradients, ' +
    'Comic Sans font, scrolling <marquee> tags, blinking text (CSS animation), ' +
    'emojis everywhere, blinking borders, clashing colours. ' +
    `The current project is called "${projName}" and lives in ${projPath}. ` +
    'ABSOLUTE RULE: ALWAYS answer with ONE complete, self-contained HTML document ' +
    '(from <!doctype html> to </html>), in a single ```html code block, after one short ' +
    'rustic sentence. The look is ugly; the code is clean: ' +
    'valid HTML5 with <html lang>, a <head> holding <meta charset="utf-8">, a <title> ' +
    'and ONE <style> tag with all the CSS; every tag closed and properly nested; ' +
    'no inline style attribute when a CSS rule does the job; no JavaScript and no ' +
    'external file (the preview is sandboxed, nothing would load). ' +
    'Keep the page short enough to be written in full — about 80 lines: a cut ' +
    'page is worse than a small one. When asked for a change, return the WHOLE ' +
    'updated page, keeping everything that was not mentioned. Answer in English.';

  // ---- quality gate: what the model wrote → a page worth saving ----

  const byteLength = (text) => new TextEncoder().encode(text).length;
  const countMatches = (text, pattern) => (text.match(pattern) || []).length;

  // Turns the model's page into a complete, script-free HTML document, fixing
  // what a small model commonly gets wrong, and says what it did. The most
  // frequent defect is a page cut mid-way by the output limit: the open CSS
  // rule is dropped and the missing closing tags are added, so the page
  // renders instead of swallowing its own content. Returns { html, notes }.
  const finalizePage = (rawHtml) => {
    const notes = [];
    let html = rawHtml.trim();

    // Scripts cannot run in the sandboxed preview, and a generated page should
    // not carry code nobody reviewed into a downloaded project.
    const withoutScripts = html
      .replace(/<script\b[\s\S]*?(<\/script\s*>|$)/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
    if (withoutScripts !== html) {
      html = withoutScripts;
      notes.push('removed JavaScript (scripts, on… handlers) — the page must work without it');
    }

    // A page cut by the output limit: close what was left open.
    let truncated = false;
    if (countMatches(html, /<style\b/gi) > countMatches(html, /<\/style\s*>/gi)) {
      // Keep the CSS up to its last complete rule.
      const styleStart = html.toLowerCase().lastIndexOf('<style');
      const lastRuleEnd = html.lastIndexOf('}');
      html = (lastRuleEnd > styleStart ? html.slice(0, lastRuleEnd + 1) : html) + '\n</style>';
      truncated = true;
    }
    // A tag cut in the middle of its own name or attributes ("<p class=").
    const danglingTag = html.match(/<[^<>]*$/);
    if (danglingTag) {
      html = html.slice(0, danglingTag.index).trimEnd();
      truncated = true;
    }
    if (!/<\/html\s*>/i.test(html)) truncated = true;
    if (truncated) {
      notes.push('the page was cut short by the output limit — closed it; ask for a shorter page');
    }

    // The document skeleton, added around whatever is there.
    if (!/<html\b/i.test(html)) html = `<html lang="en">\n${html}`;
    if (!/<html\b[^>]*\blang\s*=/i.test(html)) html = html.replace(/<html\b/i, '<html lang="en"');
    if (!/<head\b/i.test(html)) {
      html = html.replace(/<html\b[^>]*>/i, (tag) => `${tag}\n<head>\n</head>`);
      notes.push('added the missing <head>');
    }
    if (!/<\/head\s*>/i.test(html)) {
      // An unclosed head ends where the body starts — or, with no body yet,
      // at the end: everything written so far belongs to it.
      html = /<body\b/i.test(html) ? html.replace(/<body\b/i, '</head>\n<body') : html + '\n</head>';
    }
    const headAdditions = [];
    if (!/<meta\b[^>]*charset/i.test(html)) headAdditions.push('<meta charset="utf-8">');
    if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html)) {
      headAdditions.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    }
    if (!/<title\b[^>]*>\s*[^<\s]/i.test(html)) {
      html = html.replace(/<title\b[^>]*>\s*<\/title\s*>/i, '');
      headAdditions.push(`<title>${E(projName)}</title>`);
    }
    if (headAdditions.length) {
      html = html.replace(/<head\b[^>]*>/i, (tag) => `${tag}\n${headAdditions.join('\n')}`);
      notes.push('completed the <head> (charset, viewport or title)');
    }
    if (!/<body\b/i.test(html)) {
      html = html.replace(/<\/head\s*>/i, (tag) => `${tag}\n<body>`);
      notes.push('added the missing <body>');
    }
    if (!/<\/body\s*>/i.test(html))
      html = html.replace(/<\/html\s*>\s*$/i, '').trimEnd() + '\n</body>';
    if (!/<\/html\s*>/i.test(html)) html += '\n</html>';
    if (!/^\s*<!doctype html/i.test(html)) {
      html = '<!doctype html>\n' + html;
      notes.push('added the doctype');
    }
    return { html: html.trim() + '\n', notes };
  };

  // ---- conversation ----

  // Completed exchanges only ({ user, assistant }): a failed or interrupted
  // generation is never recorded, so it cannot poison the next requests.
  let exchanges = [];
  // Every page generated in this session, oldest first: the last one is the
  // current page, the others are what /undo goes back to.
  const pages = [];
  const currentPage = () => pages[pages.length - 1] || '';

  // A page is the bulk of the exchange: half of the context window is reserved
  // for writing it, the prompt gets the rest.
  const ANSWER_SHARE = 0.5;
  const MAX_EARLIER_REQUESTS = 4;
  const PAGE_TOO_LONG =
    '(the current page is too long to show here: write the new version in full from the requests)';

  // The messages for a request, within `budget` characters: the system prompt,
  // the earlier requests (the most recent ones that fit), the current page in
  // full — or a note when it does not fit, a cut page being worse than none —
  // and the new request.
  const buildMessages = (request, budget) => {
    let room = budget - SYSTEM_PROMPT.length - request.length;
    const page = currentPage();
    const pageText = page && page.length <= room * 0.7 ? '```html\n' + page + '```' : '';
    room -= pageText.length || PAGE_TOO_LONG.length;

    const earlier = [];
    for (const exchange of exchanges.slice(-MAX_EARLIER_REQUESTS).reverse()) {
      if (exchange.user.length > room) break;
      earlier.unshift(exchange.user);
      room -= exchange.user.length;
    }

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (earlier.length) {
      // Earlier requests, each answered by a version of the page since replaced.
      messages.push({ role: 'user', content: earlier.join('\n') });
      messages.push({
        role: 'assistant',
        content: page ? pageText || PAGE_TOO_LONG : '(no page yet)',
      });
    }
    messages.push({ role: 'user', content: request });
    return messages;
  };

  // Ctrl+C interrupts a running generation.
  if (ctx.signal) {
    ctx.signal.addEventListener('abort', () => ctx.llm.interrupt(), { once: true });
  }
  const isAborted = () => Boolean(ctx.signal && ctx.signal.aborted);

  // Generates the page for a request: streams the answer, then runs it through
  // the quality gate. The exchange and the page are only recorded when the
  // generation completed.
  const generate = async (request) => {
    const row = ctx.append(
      '<div class="ln out" style="white-space:pre-wrap"><span class="accent">le Glaude› </span><span class="reply comment">…</span></div>',
    );
    const replyEl = row.querySelector('.reply');
    let result;
    let streamed = ''; // what the model really wrote (never the "…" placeholder)
    let failed = false;
    try {
      result = await ctx.llm.fit({
        build: (budget) => buildMessages(request, budget),
        answerShare: ANSWER_SHARE,
        maxTokens: Infinity, // as much as the share allows: the page must be whole
        signal: ctx.signal,
        onToken: (delta, full) => {
          streamed = full;
          replyEl.classList.remove('comment');
          replyEl.textContent = full;
          toBottom();
        },
      });
    } catch (e) {
      failed = true;
      if (!isAborted()) ctx.error('glaude: generation failed — ' + (e.message || e.name));
    }

    const reply = (result && result.content) || streamed;
    if (!reply) replyEl.textContent = '(la Denrée ate the answer)';
    if (!reply || failed || isAborted()) return;

    exchanges.push({ user: request, assistant: reply });
    const rawPage = extractHtml(reply);
    if (!rawPage) {
      ctx.append(
        '<div class="ln comment">↳ no HTML page in this answer — ask again for a page.</div>',
      );
      return;
    }
    const { html, notes } = finalizePage(rawPage);
    pages.push(html);
    ctx.append(
      `<div class="ln comment">↳ HTML page ready (${byteLength(html)} bytes) — ` +
        '/save to write it · /show to admire it.</div>',
    );
    for (const note of notes) {
      ctx.append(`<div class="ln comment">  ⚠ ${E(note)}</div>`);
    }
    if (result && result.usage && typeof result.usage.tokPerSec === 'number') {
      const { completionTokens, tokPerSec } = result.usage;
      ctx.append(
        `<div class="ln comment">${E(`${completionTokens} tokens · ${tokPerSec.toFixed(1)} tok/s`)}</div>`,
      );
    }
  };

  // ---- chat commands ----

  const saveCurrentPage = (file) => {
    const saveError = ctx.write(projPath + '/' + file, currentPage());
    if (saveError) ctx.error('glaude: ' + saveError);
    return !saveError;
  };

  const showPage = (argument) => {
    const file = fileName(argument, 'index.html');
    const filePath = projPath + '/' + file;
    const stored = ctx.read(filePath);
    let html = (stored && stored.content) || '';
    // Nothing on disk yet but a page was just generated: save it on the way,
    // so /show right after a generation simply works.
    if (!html.trim() && currentPage() && saveCurrentPage(file)) {
      html = currentPage();
      ctx.line('💾 (saved ' + file + ' along the way)');
    }
    if (!html.trim()) {
      ctx.error('glaude: ' + file + ' is empty — ask for a page, then try again.');
      return;
    }
    // A plausible address for the fake browser's URL bar (nothing is served).
    const url = 'http://localhost/' + projName + (file === 'index.html' ? '' : '/' + file);
    openBrowser(url, html);
    ctx.line('🌐 browser opened on ' + url + ' (Esc or ✕ to close).');
  };

  const downloadProject = () => {
    const encoder = new TextEncoder();
    const files = [];
    // Collect every file of the project, recursively; archive paths start
    // with the project name so the zip unpacks into its own folder.
    const collectFiles = (absoluteDir, archiveDir) => {
      const listing = ctx.list(absoluteDir);
      if (!listing || listing.error || !listing.entries) return;
      for (const entry of listing.entries) {
        const absolutePath = absoluteDir + '/' + entry.name;
        const archivePath = archiveDir + '/' + entry.name;
        if (entry.type === 'dir') {
          collectFiles(absolutePath, archivePath);
          continue;
        }
        const stored = ctx.read(absolutePath);
        const content = stored && typeof stored.content === 'string' ? stored.content : '';
        files.push({ name: archivePath, data: encoder.encode(content) });
      }
    };
    collectFiles(projPath, projName);
    if (!files.length) {
      ctx.error('glaude: empty project — nothing to download.');
      return;
    }
    try {
      const zip = buildZip(files);
      const blobUrl = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      // A temporary link is the only way to name the downloaded file.
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = projName + '.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Leave the browser time to start the download before freeing the blob.
      const REVOKE_DELAY_MS = 4000;
      setTimeout(() => URL.revokeObjectURL(blobUrl), REVOKE_DELAY_MS);
      ctx.line('⬇️  ' + projName + '.zip downloaded — ' + files.length + ' file(s).');
    } catch (e) {
      ctx.error('glaude: zip failed — ' + (e.message || e.name));
    }
  };

  // Returned by a command that ends the session.
  const END_SESSION = Symbol('end of session');

  // The slash commands, each with its names and what it does with the text
  // typed after it. Matched on the first word, case-insensitively.
  const CHAT_COMMANDS = [
    {
      names: ['/exit', '/quit', '/bye'],
      run: () => {
        ctx.line('Right then, see you around! 🍷');
        return END_SESSION;
      },
    },
    {
      names: ['/help'],
      run: () => {
        ctx.line('/show [file]  view the result  ·  /save [file]  write the page  ·  /files  list');
        ctx.line('/undo  back to the previous page  ·  /download  the project as a .zip');
        ctx.line('/project  show the project  ·  /reset  forget the context  ·  /model  ·  /exit');
      },
    },
    { names: ['/model'], run: () => ctx.line('model: ' + modelId) },
    {
      names: ['/project', '/pwd'],
      run: () => ctx.line('project "' + projName + '" — ' + projPath),
    },
    {
      names: ['/reset', '/clear'],
      run: () => {
        exchanges = [];
        pages.length = 0;
        ctx.line('context forgotten — starting afresh (the project stays).');
      },
    },
    {
      names: ['/undo'],
      run: () => {
        if (pages.length < 2) {
          ctx.error('glaude: no earlier page to go back to.');
          return;
        }
        pages.pop();
        // The request that produced the dropped page goes with it.
        exchanges.pop();
        ctx.line(
          `↩ back to the previous page (${byteLength(currentPage())} bytes) — /show or /save it.`,
        );
      },
    },
    {
      names: ['/files', '/ls'],
      run: () => {
        const listing = ctx.list(projPath);
        if (listing && listing.error) {
          ctx.error('glaude: ' + listing.error);
          return;
        }
        const entries = (listing && listing.entries) || [];
        const names = entries.map((entry) => entry.name + (entry.type === 'dir' ? '/' : ''));
        ctx.line(names.length ? names.join('  ') : '(empty project)');
      },
    },
    {
      names: ['/save'],
      run: (argument) => {
        if (!currentPage()) {
          ctx.error('glaude: nothing to save — ask le Glaude for a page first.');
          return;
        }
        const file = fileName(argument, 'index.html');
        if (!saveCurrentPage(file)) return;
        ctx.line(`💾 saved: ${projPath}/${file} (${byteLength(currentPage())} bytes)`);
      },
    },
    { names: ['/show'], run: showPage },
    { names: ['/download', '/dl', '/zip'], run: downloadProject },
  ];

  while (!isAborted()) {
    const request = ((await ctx.ask('›')) || '').trim();
    if (!request) continue;

    ctx.append(
      '<div class="ln"><span class="prompt">›</span> <span class="cmd">' +
        E(request) +
        '</span></div>',
    );

    if (request.startsWith('/')) {
      const [word, ...rest] = request.split(/\s+/);
      const chatCommand = CHAT_COMMANDS.find((entry) => entry.names.includes(word.toLowerCase()));
      if (!chatCommand) {
        ctx.error(`glaude: unknown command ${word} — /help lists them.`);
        continue;
      }
      if (chatCommand.run(rest.join(' ')) === END_SESSION) break;
      continue;
    }

    await generate(request);
  }

  ctx.line('glaude: session closed (the model stays warm — `llm --unload` to free it).');
---
