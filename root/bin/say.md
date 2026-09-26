---
name: say
desc: speak text aloud (speech synthesis) — e.g. say bonjour, say -l en hello
alias: tts
page: false
man: |
  # SAY(1)

  ## NAME
  say — speak text with the browser's speech synthesis

  ## SYNOPSIS
  say [-l lang] [-r rate] [-p pitch] <text>
  say --voices
  echo text | say

  ## DESCRIPTION
  Reads the text aloud with the Web Speech API
  (window.speechSynthesis), fully offline with your system voices. The
  language defaults to the page's (English); a matching voice is picked
  automatically. Text can also be piped in. Ctrl+C stops speaking.

  ## OPTIONS
  -l <lang>    language / voice locale (e.g. fr-FR, en-US, ja)
  -r <rate>    speed, 0.5 to 2 (default 1)
  -p <pitch>   pitch, 0 to 2 (default 1)
  --voices     list the voices available in this browser

  ## EXAMPLES
  say Hello and welcome to my terminal
  say -l fr-FR Bonjour et bienvenue
  say -l en-US -r 1.2 Hello world
  fortune | say -l en
  say --voices

  ## SEE ALSO
  fortune, miaougpt
js: |
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    ctx.error('say: speech synthesis is not supported by this browser');
    return;
  }
  // Voices load asynchronously in some browsers (Chrome): wait briefly for them.
  const voices = async () => {
    let v = synth.getVoices();
    if (v.length) return v;
    await new Promise((r) => {
      const t = setTimeout(r, 1000);
      synth.addEventListener('voiceschanged', () => { clearTimeout(t); r(); }, { once: true });
    });
    return synth.getVoices();
  };

  const args = ctx.args.slice();
  let lang = document.documentElement.lang || 'en-US';
  let rate = 1;
  let pitch = 1;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--voices') {
      const list = await voices();
      if (!list.length) { ctx.line('no voice available'); return; }
      list.forEach((v) => ctx.raw(`${v.lang.padEnd(8)} ${v.name}${v.default ? '  (default)' : ''}`));
      return;
    }
    if (a === '-l') lang = args[++i] || lang;
    else if (a === '-r') rate = Math.min(2, Math.max(0.5, parseFloat(args[++i]) || 1));
    else if (a === '-p') pitch = Math.min(2, Math.max(0, parseFloat(args[++i]) || 1));
    else words.push(a);
  }
  const text = (words.join(' ') || ctx.stdin).trim().slice(0, 1000);
  if (!text) { ctx.error('usage: say [-l lang] [-r rate] [-p pitch] <text>'); return; }

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  // Prefer an exact locale match, then a same-language voice.
  const list = await voices();
  const low = lang.toLowerCase();
  u.voice = list.find((v) => v.lang.toLowerCase() === low)
    || list.find((v) => v.lang.toLowerCase().startsWith(low.split('-')[0])) || null;

  synth.cancel(); // don't queue behind a previous utterance
  ctx.sysLine(`🔊 ${u.voice ? u.voice.name : lang}…`);
  await new Promise((resolve) => {
    u.onend = resolve;
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') ctx.error(`say: ${e.error}`);
      resolve();
    };
    ctx.signal?.addEventListener('abort', () => { synth.cancel(); resolve(); }, { once: true });
    synth.speak(u);
  });
---
