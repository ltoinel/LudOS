---
name: neofetch
desc: system summary next to the LudOS logo — browser, screen, GPU, theme
agent: read
alias: fastfetch
demo: neofetch
seo_title: Neofetch online — browser & system info in ASCII
man: |
  # NEOFETCH(1)

  ## NAME
  neofetch — show a system summary beside the LudOS logo

  ## SYNOPSIS
  neofetch

  ## DESCRIPTION
  Prints a small LudOS logo with, next to it, what this "machine" really
  is — your browser:

  - user@host and the OS string (the same as uname, with the site's
    release);
  - browser and rendering engine, platform;
  - screen resolution and device pixel ratio;
  - CPU threads, approximate memory, GPU (the WebGL renderer);
  - language, time zone, current theme, uptime of the page, number of
    commands installed in /bin;
  - a row of the current theme's colours.

  Nothing is invented: a line whose information the browser does not
  expose is simply left out (memory is Chromium-only; the GPU name may
  be hidden or generic for privacy reasons). In a pipe, the same summary
  is plain text.

  ## OPTIONS
  None.

  ## PRIVACY
  Everything is read locally from your browser: nothing is sent or
  stored.

  ## EXAMPLES
  neofetch
  neofetch | grep GPU
  neofetch > system.txt

  ## SEE ALSO
  uname, useragent, top, theme, whoami, cmatrix, color
js: |
  const E = ctx.escape;

  // ---- the logo ----------------------------------------------------------
  // An original drawing: a small CRT showing a LudOS prompt.
  const LOGO = [
    ' .-----------------. ',
    ' | .-------------. | ',
    ' | |             | | ',
    ' | |  L u d O S  | | ',
    ' | |  >_         | | ',
    ' | |             | | ',
    " | '-------------' | ",
    " '--------.--------' ",
    '      ____|____      ',
    '     /_________\\     ',
  ];
  const LOGO_GAP = '  ';

  // ---- browser APIs, each optional ---------------------------------------
  // Every global is looked up defensively: an API may be missing (older or
  // privacy-hardened browsers) and the summary must still print.
  const nav = typeof navigator !== 'undefined' && navigator ? navigator : {};
  const display = typeof screen !== 'undefined' && screen ? screen : null;
  const userAgent = String(nav.userAgent || '');
  const hints = nav.userAgentData || null;

  /** Browser name and version: Client Hints first, the User-Agent otherwise. */
  const detectBrowser = () => {
    const brands = hints && Array.isArray(hints.brands) ? hints.brands : [];
    const real = brands.filter((entry) => !/not.?a.?brand/i.test(String(entry.brand)));
    // "Chromium" is the engine family: prefer the product built on it.
    const product = real.find((entry) => entry.brand !== 'Chromium') || real[0];
    if (product) return `${product.brand} ${product.version}`;
    // Order matters: Edge and Opera also announce Chrome, Chrome announces Safari.
    const rules = [
      ['Firefox', /Firefox\/([\d.]+)/],
      ['Edge', /Edg\/([\d.]+)/],
      ['Opera', /OPR\/([\d.]+)/],
      ['Chrome', /Chrome\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of rules) {
      const match = pattern.exec(userAgent);
      if (match) return `${name} ${match[1]}`;
    }
    return '';
  };

  /** The rendering engine, as far as the User-Agent tells. */
  const detectEngine = () => {
    if (/Firefox\//.test(userAgent)) return 'Gecko';
    if (/Chrom(e|ium)\//.test(userAgent) || (hints && Array.isArray(hints.brands))) return 'Blink';
    if (/AppleWebKit\//.test(userAgent)) return 'WebKit';
    return '';
  };

  /** The GPU as WebGL names it; '' when WebGL or the name is unavailable. */
  const detectGpu = () => {
    if (typeof document === 'undefined') return '';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return '';
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      // Free the context right away: browsers only allow a handful of them.
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();
      return String(renderer || '');
    } catch {
      return ''; // WebGL blocked or broken: no GPU line
    }
  };

  /** The time zone name, or '' on engines without Intl. */
  const detectTimeZone = () => {
    try {
      return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch {
      return '';
    }
  };

  /** A duration as `42s`, `5m 07s` or `1h 05m`. */
  const formatUptime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
  };

  // ---- the facts ---------------------------------------------------------
  // The OS string is uname's, so both commands always agree; the fallback
  // only names what the configuration really holds.
  let osName = '';
  try {
    const uname = await ctx.capture('uname');
    if (uname && uname.ok) osName = String(uname.stdout || '').trim();
  } catch {
    osName = '';
  }
  if (!osName) osName = ctx.cfg.version ? `Lud'OS ${ctx.cfg.version}` : "Lud'OS";

  const browser = detectBrowser();
  const engine = detectEngine();
  const platform = String((hints && hints.platform) || nav.platform || '');
  const pixelRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 0;
  const hasClock = typeof performance !== 'undefined' && typeof performance.now === 'function';
  let theme;
  try {
    theme = String(ctx.currentTheme() || '');
  } catch {
    theme = ''; // no document to read the theme from
  }

  // [label, value] pairs; a pair with an empty value is left out.
  const facts = [
    ['OS', osName],
    ['Browser', browser && engine ? `${browser} (${engine})` : browser || engine],
    ['Platform', platform],
    ['Resolution', display && display.width ? `${display.width}x${display.height}` : ''],
    ['Pixel ratio', pixelRatio ? `${Math.round(pixelRatio * 100) / 100}x` : ''],
    ['CPU', nav.hardwareConcurrency ? `${nav.hardwareConcurrency} threads` : ''],
    ['Memory', nav.deviceMemory ? `about ${nav.deviceMemory} GB (browser hint)` : ''],
    ['GPU', detectGpu()],
    ['Language', String(nav.language || '')],
    ['Time zone', detectTimeZone()],
    ['Theme', theme],
    ['Uptime', hasClock ? `${formatUptime(performance.now())} (this page)` : ''],
    ['Packages', ctx.commands && ctx.commands.length ? `${ctx.commands.length} (/bin)` : ''],
  ].filter(([, value]) => value);

  // ---- layout ------------------------------------------------------------
  const identity = `${ctx.cfg.user}@${ctx.cfg.host}`;
  const infoLines = [
    `<span class="accent text-glow">${E(identity)}</span>`,
    `<span class="comment">${'-'.repeat(identity.length)}</span>`,
    ...facts.map(([label, value]) => `<span class="accent">${E(label)}</span>: ${E(value)}`),
    '',
    // The theme's own colours, read from its CSS custom properties. Solid
    // blocks (not coloured spaces) so the row survives as plain text.
    ['--green', '--green-dim', '--amber', '--cyan', '--fg', '--fg-bright', '--dim']
      .map((property) => `<span style="color:var(${property})">███</span>`)
      .join(''),
  ];

  const blankLogo = ' '.repeat(LOGO[0].length);
  const rowCount = Math.max(LOGO.length, infoLines.length);
  const rows = [];
  for (let row = 0; row < rowCount; row++) {
    const logo = `<span class="accent">${E(LOGO[row] || blankLogo)}</span>`;
    const info = infoLines[row] || '';
    rows.push(info ? `${logo}${LOGO_GAP}${info}` : logo);
  }
  // One pre-formatted block: on screen it is coloured, and its text content
  // — what a pipe or a redirection records — is the same summary, plain.
  ctx.append(`<div class="ln" style="white-space:pre;overflow-x:auto">${rows.join('\n')}</div>`);
---
