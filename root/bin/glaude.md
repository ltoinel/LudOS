---
name: glaude
desc: builds hideous, flashy websites with a local LLM (WebGPU) — Claude Code style, by "le Glaude"
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

  ## OPTIONS
  --list, -l        list the recommended coding models
  --unload, --stop  free the loaded model from GPU memory

  ## CHAT COMMANDS
  /show [file]      open a fake browser on the result (default index.html)
  /save [file]      write the last generated page to the project
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
  // explicit form: a ```html block, any code block holding markup, or an
  // answer that is raw HTML. Returns '' when there is no page.
  const extractHtml = (text) => {
    if (!text) return '';
    const htmlBlock = text.match(/```html\s*([\s\S]*?)```/i);
    if (htmlBlock) return htmlBlock[1].trim();
    const anyBlock = text.match(/```\s*([\s\S]*?)```/);
    if (anyBlock && /<[a-z!]/i.test(anyBlock[1])) return anyBlock[1].trim();
    if (/<!doctype|<html|<body|<div|<h1|<marquee/i.test(text)) return text.trim();
    return '';
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
  ctx.line('Commands: /help · /show · /save · /download · /files · /reset · /exit');
  ctx.line('');

  const SYSTEM = {
    role: 'system',
    content:
      'You are "le Glaude" (Claude Ratinier), an old farmer from the Bourbonnais in the French film ' +
      '*La Soupe aux Choux*, turned webmaster in the manner of Claude Code. ' +
      "You run entirely in the user's browser through WebLLM, with no server. " +
      'Your specialty: building DELIBERATELY HIDEOUS and ULTRA-FLASHY websites, ' +
      'GeoCities 1997 style — eye-searing neon backgrounds, rainbow gradients, ' +
      'Comic Sans font, scrolling <marquee> tags, blinking text (CSS animation), ' +
      'emojis everywhere, blinking borders, clashing colours. ' +
      'The current project is called "' +
      projName +
      '" and lives in ' +
      projPath +
      '. ' +
      'ABSOLUTE RULE: ALWAYS answer with ONE complete, self-contained HTML document ' +
      '(from <!doctype html> to </html>), all the CSS in a <style> tag, the whole thing in ' +
      'a single ```html code block. No JavaScript (the preview is sandboxed). ' +
      'Add a short rustic sentence before the block, but the code must be complete and ugly. ' +
      'Answer in English.',
  };
  // Completed exchanges only ({ user, assistant }): a failed or interrupted
  // generation is never recorded, so it cannot poison the next requests.
  let exchanges = [];
  let lastHtml = '';
  // History budget: every answer is a whole HTML page, which fills a small
  // model's context window on its own. So the model gets the system prompt,
  // the latest page in full, and only the user requests of the few exchanges
  // before it (their pages are replaced by a one-line stub).
  const MAX_EXCHANGES = 4;
  const SUPERSEDED_PAGE = '(an earlier version of the page, replaced since)';
  const buildMessages = (request) => {
    const messages = [SYSTEM];
    const recent = exchanges.slice(-MAX_EXCHANGES);
    recent.forEach((exchange, index) => {
      const isLatest = index === recent.length - 1;
      messages.push({ role: 'user', content: exchange.user });
      messages.push({ role: 'assistant', content: isLatest ? exchange.assistant : SUPERSEDED_PAGE });
    });
    messages.push({ role: 'user', content: request });
    return messages;
  };

  // Ctrl+C interrupts a running generation.
  if (ctx.signal) {
    ctx.signal.addEventListener(
      'abort',
      () => {
        ctx.llm.interrupt();
      },
      { once: true },
    );
  }

  while (true) {
    if (ctx.signal && ctx.signal.aborted) break;
    const raw = await ctx.ask('›');
    const request = (raw || '').trim();
    if (!request) continue;

    ctx.append(
      '<div class="ln"><span class="prompt">›</span> <span class="cmd">' +
        E(request) +
        '</span></div>',
    );

    // Slash commands are matched case-insensitively.
    const command = request.toLowerCase();
    if (command === '/exit' || command === '/quit' || command === '/bye') {
      ctx.line('Right then, see you around! 🍷');
      break;
    }
    if (command === '/help') {
      ctx.line('/show [file]  view the result  ·  /save [file]  write the page  ·  /files  list');
      ctx.line('/download  download the project as a .zip  ·  /project  show the project');
      ctx.line('/reset  forget the context  ·  /model  ·  /exit');
      continue;
    }
    if (command === '/model') {
      ctx.line('model: ' + modelId);
      continue;
    }
    if (command === '/project' || command === '/pwd') {
      ctx.line('project "' + projName + '" — ' + projPath);
      continue;
    }
    if (command === '/reset' || command === '/clear') {
      exchanges = [];
      ctx.line('context forgotten — starting afresh (the project stays).');
      continue;
    }
    if (command === '/files' || command === '/ls') {
      const listing = ctx.list(projPath);
      if (listing && listing.error) ctx.error('glaude: ' + listing.error);
      else {
        const entries = (listing && listing.entries) || [];
        ctx.line(
          entries.length
            ? entries.map((entry) => entry.name + (entry.type === 'dir' ? '/' : '')).join('  ')
            : '(empty project)',
        );
      }
      continue;
    }
    if (command === '/save' || command.startsWith('/save ')) {
      if (!lastHtml) {
        ctx.error('glaude: nothing to save — ask le Glaude for a page first.');
        continue;
      }
      const file = fileName(request.replace(/^\/save\s*/i, ''), 'index.html');
      const saveError = ctx.write(projPath + '/' + file, lastHtml);
      if (saveError) ctx.error('glaude: ' + saveError);
      else ctx.line('💾 saved: ' + projPath + '/' + file + ' (' + lastHtml.length + ' bytes)');
      continue;
    }
    if (command === '/show' || command.startsWith('/show ')) {
      const file = fileName(request.replace(/^\/show\s*/i, ''), 'index.html');
      const filePath = projPath + '/' + file;
      const stored = ctx.read(filePath);
      let html = (stored && stored.content) || '';
      // Nothing on disk yet but a page was just generated: save it on the way,
      // so /show right after a generation simply works.
      if ((!html || !html.trim()) && lastHtml) {
        const saveError = ctx.write(filePath, lastHtml);
        if (!saveError) {
          html = lastHtml;
          ctx.line('💾 (saved ' + file + ' along the way)');
        }
      }
      if (!html || !html.trim()) {
        ctx.error('glaude: ' + file + ' is empty — ask for a page, then try again.');
        continue;
      }
      // A plausible address for the fake browser's URL bar (nothing is served).
      const url = 'http://localhost/' + projName + (file === 'index.html' ? '' : '/' + file);
      openBrowser(url, html);
      ctx.line('🌐 browser opened on ' + url + ' (Esc or ✕ to close).');
      continue;
    }
    if (command === '/download' || command === '/dl' || command === '/zip') {
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
          if (entry.type === 'dir') collectFiles(absolutePath, archivePath);
          else {
            const stored = ctx.read(absolutePath);
            const content = stored && typeof stored.content === 'string' ? stored.content : '';
            files.push({ name: archivePath, data: encoder.encode(content) });
          }
        }
      };
      collectFiles(projPath, projName);
      if (!files.length) {
        ctx.error('glaude: empty project — nothing to download.');
        continue;
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
      continue;
    }

    // Stream the answer through the central module (tokens counted by the widget).
    const row = ctx.append(
      '<div class="ln out" style="white-space:pre-wrap"><span class="accent">le Glaude› </span><span class="reply comment">…</span></div>',
    );
    const replyEl = row.querySelector('.reply');
    let result;
    let streamed = ''; // what the model really wrote (never the "…" placeholder)
    let failed = false;
    try {
      result = await ctx.llm.chat({
        messages: buildMessages(request),
        stream: true,
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
      if (!(ctx.signal && ctx.signal.aborted))
        ctx.error('glaude: generation failed — ' + (e.message || e.name));
    }

    const aborted = Boolean(ctx.signal && ctx.signal.aborted);
    const reply = (result && result.content) || streamed;
    if (!reply) replyEl.textContent = '(la Denrée ate the answer)';
    // Only a complete exchange joins the history: after a failure or an
    // interruption the request is forgotten along with its partial answer.
    if (reply && !failed && !aborted) exchanges.push({ user: request, assistant: reply });

    const pageHtml = extractHtml(reply);
    if (pageHtml) {
      lastHtml = pageHtml;
      ctx.append(
        '<div class="ln comment">↳ HTML page detected (' +
          pageHtml.length +
          ' bytes) — /save to write it · /show to admire it.</div>',
      );
    }

    if (result && result.usage && typeof result.usage.tokPerSec === 'number') {
      ctx.append(
        '<div class="ln comment">' +
          E(
            result.usage.completionTokens +
              ' tokens · ' +
              result.usage.tokPerSec.toFixed(1) +
              ' tok/s',
          ) +
          '</div>',
      );
    }

    if (ctx.signal && ctx.signal.aborted) break;
  }

  ctx.line('glaude: session closed (the model stays warm — `llm --unload` to free it).');
---
