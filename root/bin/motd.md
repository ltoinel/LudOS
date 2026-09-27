---
name: motd
desc: message of the day (welcome banner)
index: false
man: |
  # MOTD(1)

  ## NAME
  motd — message of the day (welcome banner)

  ## SYNOPSIS
  motd

  ## DESCRIPTION
  Shows the welcome banner: the Lud'OS logo drawn by the asciiart command,
  the release, a systemd-style boot sequence, the last-login date and a
  random quote or joke from the fortune command. This is what the
  connection plays (see boot).

  ## EXAMPLES
  motd

  ## SEE ALSO
  boot, asciiart, fortune
js: |
  const E = ctx.escape;

  // Logo, drawn by the asciiart command, with the release underneath (a
  // blank line first, to set it apart from the SSH handshake).
  ctx.line('');
  await ctx.exec('asciiart', ['-s', 'small', "Lud'OS"]);
  if (ctx.cfg.version) ctx.sysLine(`version ${ctx.cfg.version}`);
  ctx.line('');

  // systemd-style boot sequence.
  const ok = (msg) =>
    ctx.append(
      `<div class="ln"><span class="comment">[</span><span class="accent text-glow"> OK </span><span class="comment">] ${E(msg)}</span></div>`,
    );
  const steps = [
    `${ctx.commands.length} commands mounted on /bin`,
    'Encrypted LTS link established',
    'CRT theme calibrated · glow nominal',
    'Coffee: brewing ☕',
  ];
  for (const s of steps) {
    ok(s);
    await ctx.sleep(55);
  }
  ctx.line('');

  // Last login: persisted in localStorage → we show the PREVIOUS session (like a
  // real `last login`), then record the current one.
  const LL_KEY = 'ltsh.lastlogin';
  let prev = null;
  try {
    prev = JSON.parse(localStorage.getItem(LL_KEY) || 'null');
  } catch {
    /* localStorage unavailable / corrupt value */
  }
  if (prev && prev.date) {
    const when = new Date(prev.date).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const from = prev.ip ? ` from ${E(prev.ip)}` : '';
    ctx.append(`<div class="ln comment">Last login: ${E(when)}${from}</div>`);
  } else {
    ctx.append('<div class="ln comment">First connection — welcome. 👋</div>');
  }
  // Record the current session. The date is set right away; the real IP is fetched
  // in the background (fire-and-forget) and patched in for next time.
  try {
    localStorage.setItem(LL_KEY, JSON.stringify({ date: Date.now(), ip: null }));
    fetch('https://api64.ipify.org?format=json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const cur = JSON.parse(localStorage.getItem(LL_KEY) || 'null');
        if (cur && d && d.ip) {
          cur.ip = d.ip;
          localStorage.setItem(LL_KEY, JSON.stringify(cur));
        }
      })
      .catch(() => {
        /* offline / blocked: keep the date without an IP */
      });
  } catch {
    /* localStorage unavailable */
  }

  // A quote or a developer joke, from the fortune command (it falls back to a
  // built-in list when offline).
  ctx.line('');
  await ctx.exec('fortune');
  ctx.line('');

  // Quick start.
  ctx.line('→ `help` lists everything · `whoami` who am I · `ls` explore');
  ctx.line('→ `?` ask anything in plain language — e.g. `? "what is my public IP?"`');
---
