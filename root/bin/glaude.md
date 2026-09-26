---
name: glaude
desc: builds hideous, flashy websites with a local LLM (WebGPU) — Claude Code style, by "le Glaude"
alias: soupe
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
    { label: 'Qwen2.5-Coder 3B',   base: 'Qwen2.5-Coder-3B-Instruct',   gb: 3.3 },
    { label: 'Qwen2.5-Coder 7B',   base: 'Qwen2.5-Coder-7B-Instruct',   gb: 8.1 },
  ];
  const DEFAULT = { base: 'Qwen2.5-Coder-1.5B-Instruct', label: 'Qwen2.5-Coder 1.5B', gb: 1.9 };

  // ---- glaude --unload: free the resident model ----
  if (first === '--unload' || first === '--stop') {
    const freed = await ctx.llm.unload();
    ctx.line(freed ? 'glaude: model unloaded, GPU memory freed.' : 'glaude: no model loaded.');
    return;
  }

  // ---- "la Denrée" in colored pixel art (the alien from La Soupe aux Choux) ----
  const PAL = { R: '#e23b2e', D: '#a82018', B: '#e9c277', N: '#6e4a2b', W: '#ffffff', o: '#2a2a2a' };
  const PIXES = [
    "       RRRRRR       ",
    "      RRRRRRRR      ",
    "      DRRRRRRD      ",
    "      BBBBBBBB      ",
    "...RR.BBBBBBBB.RR...",
    ".DRRRRBBBBBBBBRRRRD.",
    ".DRRRRBNNBBNNBRRRRD.",
    ".DRRRRBWoBBoWBRRRRD.",
    "...RR.BBBNNBBB.RR...",
    ".......BBBooBBB.....",
    ".......BBBBBB.......",
    "..RRRRBBBBBBBBRRRR..",
    "DRRRRRBBBBBBBBRRRRRD",
    "..RRR.BBBBBBBB.RRR..",
    "....BBBBBBBBBBBB....",
    ".....BBBBBBBBBB.....",
    "......BBBBBBBB......",
  ];
  const blocksRow = (row) => {
    let html = '';
    for (let i = 0; i < row.length; ) {
      const ch = row[i];
      let j = i;
      while (j < row.length && row[j] === ch) j++;
      const n = j - i;
      if (ch === '.' || ch === ' ') html += '  '.repeat(n);
      else html += '<span style="color:' + (PAL[ch] || '#888') + '">' + '██'.repeat(n) + '</span>';
      i = j;
    }
    return '<div class="ln ascii-art">' + html + '</div>';
  };
  const narrow = typeof window !== 'undefined' && window.innerWidth < 680;
  if (narrow) {
    ctx.append('<div class="ln ascii-art"><span class="accent text-glow">░▒▓ la Denrée ▓▒░</span></div>');
  } else {
    for (const l of PIXES) { ctx.append(blocksRow(l)); await ctx.sleep(28); }
  }
  ctx.line('');

  // Claude Code-style welcome box.
  const box = (t) => '<div class="ln ascii-art"><span class="accent">' + E(t) + '</span></div>';
  ctx.append(box('╭──────────────────────────────────────────────╮'));
  ctx.append('<div class="ln ascii-art"><span class="accent">│ </span><span class="accent text-glow">✻</span><span class="accent"> Welcome to Glaude Code                     │</span></div>');
  ctx.append(box('│                                              │'));
  ctx.append(box('│   the worst webmaster in Bourbonnais 🥬      │'));
  ctx.append(box('│   /help · /show to admire · /exit            │'));
  ctx.append(box('╰──────────────────────────────────────────────╯'));
  ctx.line('');

  // ---- model list (no WebGPU needed) ----
  if (first === '--list' || first === '-l') {
    ctx.line('Recommended coding models (smallest first):');
    ctx.line('');
    RECOMMENDED.forEach((r, i) => {
      ctx.append(
        '<div class="ln out"><span class="accent">' + (i + 1) + ')</span> ' +
        '<span class="cmd">' + E(r.label) + '</span> ' +
        '<span class="comment">≈ ' + E(r.gb.toFixed(1)) + ' GB</span></div>',
      );
    });
    ctx.line('');
    ctx.line('Start:  glaude <number>   (e.g. glaude 1)   ·   all models: `llm --list-all`');
    return;
  }

  // ---- small file helpers ----
  const slugify = (s) =>
    (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 48);
  const fileName = (s, def) => {
    let f = slugify(s) || def;
    if (!/\.[a-z0-9]+$/.test(f)) f += '.html';
    return f;
  };
  const extractHtml = (text) => {
    if (!text) return '';
    let m = text.match(/```html\s*([\s\S]*?)```/i);
    if (m) return m[1].trim();
    m = text.match(/```\s*([\s\S]*?)```/);
    if (m && /<[a-z!]/i.test(m[1])) return m[1].trim();
    if (/<!doctype|<html|<body|<div|<h1|<marquee/i.test(text)) return text.trim();
    return '';
  };

  // ---- fake browser: shows the rendered HTML in its own window ----
  const openBrowser = (url, html) => {
    if (!document.getElementById('glb-style')) {
      const st = document.createElement('style');
      st.id = 'glb-style';
      st.textContent =
        '.glb-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9997}' +
        '.glb-win{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'width:min(900px,92vw);height:min(78vh,680px);min-width:320px;min-height:240px;' +
        'background:#c9d2da;border:1px solid #2a2f36;border-radius:8px;display:flex;' +
        'flex-direction:column;overflow:hidden;resize:both;z-index:9998;' +
        'box-shadow:0 40px 90px -30px rgba(0,0,0,.85)}' +
        '.glb-bar{display:flex;align-items:center;gap:.6rem;padding:.45rem .6rem;' +
        'background:linear-gradient(#eef2f6,#d3dbe2);border-bottom:1px solid #9aa4ad;' +
        'font:13px/1.2 system-ui,sans-serif;color:#333}' +
        '.glb-dots{display:flex;gap:.4rem}.glb-dots i{width:11px;height:11px;border-radius:50%;' +
        'display:inline-block;border:1px solid rgba(0,0,0,.25)}' +
        '.glb-nav{border:1px solid #9aa4ad;background:#fafcff;border-radius:5px;cursor:pointer;' +
        'font-size:14px;line-height:1;padding:2px 7px;color:#333}.glb-nav:hover{background:#fff}' +
        '.glb-url{flex:1;background:#fff;border:1px solid #9aa4ad;border-radius:12px;padding:3px 12px;' +
        'color:#225;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.4 ui-monospace,monospace}' +
        '.glb-x{margin-left:.2rem;border:none;background:#e2554b;color:#fff;width:22px;height:22px;' +
        'border-radius:5px;cursor:pointer;font-size:12px}.glb-x:hover{filter:brightness(1.1)}' +
        '.glb-frame{flex:1;width:100%;border:0;background:#fff}';
      document.head.appendChild(st);
    }
    const oldWin = document.getElementById('glb-win'); if (oldWin) oldWin.remove();
    const oldBack = document.getElementById('glb-back'); if (oldBack) oldBack.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'glb-back'; backdrop.className = 'glb-back';
    const win = document.createElement('div');
    win.id = 'glb-win'; win.className = 'glb-win';
    win.innerHTML =
      '<div class="glb-bar">' +
      '<span class="glb-dots"><i style="background:#ff5f56"></i><i style="background:#ffbd2e"></i><i style="background:#27c93f"></i></span>' +
      '<button class="glb-nav" data-act="reload" title="Recharger" type="button">⟳</button>' +
      '<span class="glb-url"></span>' +
      '<button class="glb-x" data-act="close" title="Fermer" type="button">✕</button>' +
      '</div><iframe class="glb-frame" sandbox=""></iframe>';
    win.querySelector('.glb-url').textContent = url;
    const frame = win.querySelector('.glb-frame');
    frame.srcdoc = html;
    document.body.appendChild(backdrop);
    document.body.appendChild(win);

    const close = () => {
      win.remove(); backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', close);
    win.querySelector('[data-act=close]').addEventListener('click', close);
    win.querySelector('[data-act=reload]').addEventListener('click', () => { frame.srcdoc = html; });
  };

  // ---- mini ZIP archiver ("stored" method, plain JS, no dependency) ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const concatBytes = (arrs) => {
    let len = 0;
    for (const a of arrs) len += a.length;
    const out = new Uint8Array(len);
    let p = 0;
    for (const a of arrs) { out.set(a, p); p += a.length; }
    return out;
  };
  const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const buildZip = (files) => {
    const enc = new TextEncoder();
    const locals = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, f.data,
      ]);
      locals.push(local);
      central.push(concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name,
      ]));
      offset += local.length;
    }
    const cd = concatBytes(central);
    const end = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0),
    ]);
    return concatBytes([...locals, cd, end]);
  };

  // ---- project bootstrap (before loading the model, like Claude Code) ----
  const HOME = (ctx.cfg && ctx.cfg.home) || '/home/guest';
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // Rustic French-countryside flavor, in the spirit of le Glaude.
  const NOUN = [
    'baguette', 'cheese', 'bistro', 'veggie-patch', 'vineyard', 'snail', 'accordion',
    'camembert', 'terroir', 'stewpot', 'soup', 'cabbage', 'beret', 'croissant', 'red-wine',
    'dance-hall', 'flea-market', 'turnip', 'dandelion', 'artichoke',
  ];
  const ADJ = [
    'magnificent', 'flamboyant', 'tremendous', 'fantastic', 'sensational', 'picturesque',
    'majestic', 'crunchy', 'authentic', 'rustic', 'breathtaking', 'thundering',
    'tasty', 'flashy', 'extraordinary',
  ];
  const suggested = slugify(pick(NOUN) + '-' + pick(ADJ)) || 'tremendous-project';

  ctx.append('<div class="ln"><span class="accent text-glow">✻</span> <span class="comment">le Glaude: “Right, what site are we building today?”</span></div>');
  let projName = slugify(((await ctx.ask('project name? [' + suggested + ']')) || '').trim());
  if (!projName) projName = suggested;
  const projPath = HOME + '/' + projName;

  const ok = ((await ctx.ask('create "' + projPath + '" and work there? [Y/n]')) || '').trim().toLowerCase();
  if (ok === 'n' || ok === 'no') { ctx.line('glaude: cancelled — no project created.'); return; }

  let mkErr = ctx.mkdir(projPath, true);
  if (mkErr) { ctx.error('glaude: ' + mkErr); return; }
  const STARTER =
    '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<title>' + projName + '</title>\n' +
    '<style>\n' +
    'body{margin:0;background:#ff00ea;font-family:"Comic Sans MS","Comic Sans",cursive;text-align:center;color:#00ff00}\n' +
    'h1{font-size:3rem;text-shadow:3px 3px 0 #ff0,6px 6px 0 #f00}\n' +
    '.rainbow{background:linear-gradient(90deg,red,orange,yellow,green,blue,indigo,violet);' +
    '-webkit-background-clip:text;background-clip:text;color:transparent}\n' +
    '.blink{animation:b .6s steps(2) infinite}@keyframes b{50%{opacity:0}}\n' +
    '</style>\n</head>\n<body>\n' +
    '<marquee behavior="alternate"><h1 class="rainbow">🥬 ' + projName + ' 🥬</h1></marquee>\n' +
    '<p class="blink">UNDER CONSTRUCTION !!! Ask le Glaude to fill it in!</p>\n' +
    '<marquee direction="right">⭐⭐⭐ Welcome to the most beautiful site on the web ⭐⭐⭐</marquee>\n' +
    '</body>\n</html>\n';
  const wErr = ctx.write(projPath + '/index.html', STARTER);
  if (wErr) { ctx.error('glaude: ' + wErr); return; }
  const cdErr = ctx.cd(projPath);
  if (cdErr) ctx.error('glaude: ' + cdErr);
  ctx.append('<div class="ln"><span class="comment">[</span><span class="accent text-glow"> OK </span><span class="comment">] project "' + E(projName) + '" created in ' + E(projPath) + '</span></div>');
  ctx.append('<div class="ln comment">         starter index.html written — type /show to admire it.</div>');
  ctx.line('');

  // ---- model loading through the central module (consent + progress bar) ----
  // Reuses the warm model if there is one and none was requested; otherwise
  // suggests a coding model (by number, id, or the default).
  let session;
  try {
    const st = ctx.llm.state();
    if (st && st.modelId && !first) {
      session = { modelId: st.modelId, label: st.label };
      ctx.line('le Glaude reuses the warm model: ' + (st.label || st.modelId));
    } else {
      let base = DEFAULT.base, label = DEFAULT.label, gb = DEFAULT.gb;
      if (first && /^\d+$/.test(first)) {
        const n = parseInt(first, 10);
        if (n >= 1 && n <= RECOMMENDED.length) { base = RECOMMENDED[n - 1].base; label = RECOMMENDED[n - 1].label; gb = RECOMMENDED[n - 1].gb; }
        else { ctx.error('glaude: no recommended model #' + n + ' — see: glaude --list'); return; }
      } else if (first) {
        base = first; label = first; gb = undefined;
      }
      session = await ctx.llm.ensure({ base, label, gb, reason: 'le Glaude codes your site' });
    }
  } catch (e) {
    ctx.error('glaude: ' + ((e && (e.message || e.name)) || e));
    ctx.line('le Glaude needs WebGPU. Try a recent Chrome/Edge (≥ 113) or Safari 18+.');
    ctx.line('(Your project "' + projName + '" is still there — run `glaude` again to /show it.)');
    return;
  }
  if (!session) { ctx.line('glaude: cancelled — no model loaded (your project "' + projName + '" is still there).'); return; }
  const modelId = session.modelId;

  // Terminal scroll anchor (stays pinned to the bottom while streaming).
  const scroller = (ctx.append('<div class="ln comment">engine ready — ' + E(session.label || modelId) + '</div>')).closest('.ssh-body');
  const toBottom = () => { if (scroller) scroller.scrollTop = scroller.scrollHeight; };

  // ---- session: site generation ----
  ctx.line('');
  ctx.append('<div class="ln"><span class="accent text-glow">● le Glaude is tinkering with your site</span> <span class="comment">— ' + E(modelId) + ' · project ' + E(projName) + '</span></div>');
  ctx.line('Describe the page you want, press Enter. Then /save to write it, /show to admire it.');
  ctx.line('Commands: /help · /show · /save · /download · /files · /reset · /exit');
  ctx.line('');

  const SYSTEM = {
    role: 'system',
    content:
      "You are \"le Glaude\" (Claude Ratinier), an old farmer from the Bourbonnais in the French film " +
      "*La Soupe aux Choux*, turned webmaster in the manner of Claude Code. " +
      "You run entirely in the user's browser through WebLLM, with no server. " +
      "Your specialty: building DELIBERATELY HIDEOUS and ULTRA-FLASHY websites, " +
      "GeoCities 1997 style — eye-searing neon backgrounds, rainbow gradients, " +
      "Comic Sans font, scrolling <marquee> tags, blinking text (CSS animation), " +
      "emojis partout, bordures clignotantes, couleurs qui jurent. " +
      "The current project is called \"" + projName + "\" and lives in " + projPath + ". " +
      "ABSOLUTE RULE: ALWAYS answer with ONE complete, self-contained HTML document " +
      "(from <!doctype html> to </html>), all the CSS in a <style> tag, the whole thing in " +
      "a single ```html code block. No JavaScript (the preview is sandboxed). " +
      "Add a short rustic sentence before the block, but the code must be complete and ugly. " +
      "Answer in English.",
  };
  let messages = [SYSTEM];
  let lastHtml = '';

  // Ctrl+C interrupts a running generation.
  if (ctx.signal) {
    ctx.signal.addEventListener('abort', () => { ctx.llm.interrupt(); }, { once: true });
  }

  while (true) {
    if (ctx.signal && ctx.signal.aborted) break;
    const raw = await ctx.ask('›');
    const q = (raw || '').trim();
    if (!q) continue;

    ctx.append('<div class="ln"><span class="prompt">›</span> <span class="cmd">' + E(q) + '</span></div>');

    const low = q.toLowerCase();
    if (low === '/exit' || low === '/quit' || low === '/bye') { ctx.line('Right then, see you around! 🍷'); break; }
    if (low === '/help') {
      ctx.line('/show [file]  view the result  ·  /save [file]  write the page  ·  /files  list');
      ctx.line('/download  download the project as a .zip  ·  /project  show the project');
      ctx.line('/reset  forget the context  ·  /model  ·  /exit');
      continue;
    }
    if (low === '/model') { ctx.line('model: ' + modelId); continue; }
    if (low === '/project' || low === '/pwd') { ctx.line('project "' + projName + '" — ' + projPath); continue; }
    if (low === '/reset' || low === '/clear') { messages = [SYSTEM]; ctx.line('context forgotten — starting afresh (the project stays).'); continue; }
    if (low === '/files' || low === '/ls') {
      const r = ctx.list(projPath);
      if (r && r.error) ctx.error('glaude: ' + r.error);
      else {
        const entries = (r && r.entries) || [];
        ctx.line(entries.length ? entries.map((e2) => e2.name + (e2.type === 'dir' ? '/' : '')).join('  ') : '(empty project)');
      }
      continue;
    }
    if (low === '/save' || low.startsWith('/save ')) {
      if (!lastHtml) { ctx.error('glaude: nothing to save — ask le Glaude for a page first.'); continue; }
      const f = fileName(q.replace(/^\/save\s*/i, ''), 'index.html');
      const e3 = ctx.write(projPath + '/' + f, lastHtml);
      if (e3) ctx.error('glaude: ' + e3);
      else ctx.line('💾 saved: ' + projPath + '/' + f + ' (' + lastHtml.length + ' bytes)');
      continue;
    }
    if (low === '/show' || low.startsWith('/show ')) {
      const f = fileName(q.replace(/^\/show\s*/i, ''), 'index.html');
      const full = projPath + '/' + f;
      const r = ctx.read(full);
      let html = (r && r.content) || '';
      if ((!html || !html.trim()) && lastHtml) {
        const e3 = ctx.write(full, lastHtml);
        if (!e3) { html = lastHtml; ctx.line('💾 (saved ' + f + ' along the way)'); }
      }
      if (!html || !html.trim()) { ctx.error('glaude: ' + f + ' is empty — ask for a page, then try again.'); continue; }
      const url = 'http://localhost/' + projName + (f === 'index.html' ? '' : '/' + f);
      openBrowser(url, html);
      ctx.line('🌐 browser opened on ' + url + ' (Esc or ✕ to close).');
      continue;
    }
    if (low === '/download' || low === '/dl' || low === '/zip') {
      const enc = new TextEncoder();
      const files = [];
      const walk = (absDir, relDir) => {
        const r = ctx.list(absDir);
        if (!r || r.error || !r.entries) return;
        for (const ent of r.entries) {
          const abs = absDir + '/' + ent.name;
          const rel = relDir + '/' + ent.name;
          if (ent.type === 'dir') walk(abs, rel);
          else {
            const fr = ctx.read(abs);
            files.push({ name: rel, data: enc.encode((fr && typeof fr.content === 'string') ? fr.content : '') });
          }
        }
      };
      walk(projPath, projName);
      if (!files.length) { ctx.error('glaude: empty project — nothing to download.'); continue; }
      try {
        const zip = buildZip(files);
        const blobUrl = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = blobUrl; a.download = projName + '.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
        ctx.line('⬇️  ' + projName + '.zip downloaded — ' + files.length + ' file(s).');
      } catch (e) {
        ctx.error('glaude: zip failed — ' + (e.message || e.name));
      }
      continue;
    }

    messages.push({ role: 'user', content: q });

    // Stream the answer through the central module (tokens counted by the widget).
    const row = ctx.append('<div class="ln out" style="white-space:pre-wrap"><span class="accent">le Glaude› </span><span class="reply comment">…</span></div>');
    const replyEl = row.querySelector('.reply');
    let result;
    try {
      result = await ctx.llm.chat({
        messages,
        stream: true,
        signal: ctx.signal,
        onToken: (delta, full) => {
          replyEl.classList.remove('comment');
          replyEl.textContent = full;
          toBottom();
        },
      });
    } catch (e) {
      if (!(ctx.signal && ctx.signal.aborted)) ctx.error('glaude: generation failed — ' + (e.message || e.name));
    }

    const reply = (result && result.content) || replyEl.textContent || '';
    if (!reply) replyEl.textContent = '(la Denrée ate the answer)';
    messages.push({ role: 'assistant', content: reply });

    const h = extractHtml(reply);
    if (h) {
      lastHtml = h;
      ctx.append('<div class="ln comment">↳ HTML page detected (' + h.length + ' bytes) — /save to write it · /show to admire it.</div>');
    }

    if (result && result.usage && typeof result.usage.tokPerSec === 'number') {
      ctx.append('<div class="ln comment">' + E(result.usage.completionTokens + ' tokens · ' + result.usage.tokPerSec.toFixed(1) + ' tok/s') + '</div>');
    }

    if (ctx.signal && ctx.signal.aborted) break;
  }

  ctx.line('glaude: session closed (the model stays warm — `llm --unload` to free it).');
---
