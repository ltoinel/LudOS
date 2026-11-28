---
name: say
desc: speak text aloud (speech synthesis) — e.g. say bonjour, say -l en hello
agent: no
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
  const VOICES_WAIT_MS = 1000;
  const loadVoices = async () => {
    const available = synth.getVoices();
    if (available.length) return available;
    // Whichever comes first: the browser announcing its voices, or the deadline.
    await new Promise((resolve) => {
      const deadline = setTimeout(resolve, VOICES_WAIT_MS);
      synth.addEventListener(
        'voiceschanged',
        () => {
          clearTimeout(deadline);
          resolve();
        },
        { once: true },
      );
    });
    return synth.getVoices();
  };

  const args = ctx.args.slice();
  let lang = document.documentElement.lang || 'en-US';
  let rate = 1;
  let pitch = 1;
  const words = [];
  // Ranges accepted by the Web Speech API that still sound like speech.
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const MAX_TEXT_LENGTH = 1000; // long utterances are cut off by some browsers
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--voices') {
      const installed = await loadVoices();
      if (!installed.length) {
        ctx.line('no voice available');
        return;
      }
      installed.forEach((voice) =>
        ctx.raw(`${voice.lang.padEnd(8)} ${voice.name}${voice.default ? '  (default)' : ''}`),
      );
      return;
    }
    // A valued option consumes the next argument (hence the ++i).
    if (arg === '-l') lang = args[++i] || lang;
    else if (arg === '-r') rate = clamp(parseFloat(args[++i]) || 1, 0.5, 2);
    else if (arg === '-p') pitch = clamp(parseFloat(args[++i]) || 1, 0, 2);
    else words.push(arg);
  }
  const text = (words.join(' ') || ctx.stdin).trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) {
    ctx.error('usage: say [-l lang] [-r rate] [-p pitch] <text>');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = pitch;
  // Prefer an exact locale match (fr-FR), then a same-language voice (fr-*).
  const installed = await loadVoices();
  const wantedLocale = lang.toLowerCase();
  const wantedLanguage = wantedLocale.split('-')[0];
  utterance.voice =
    installed.find((voice) => voice.lang.toLowerCase() === wantedLocale) ||
    installed.find((voice) => voice.lang.toLowerCase().startsWith(wantedLanguage)) ||
    null;

  synth.cancel(); // don't queue behind a previous utterance
  ctx.sysLine(`🔊 ${utterance.voice ? utterance.voice.name : lang}…`);
  // Resolves when the speech ends, fails, or is interrupted with Ctrl+C.
  await new Promise((resolve) => {
    utterance.onend = resolve;
    utterance.onerror = (event) => {
      // Our own cancel() surfaces as an error too: that one is not worth reporting.
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        ctx.error(`say: ${event.error}`);
      }
      resolve();
    };
    ctx.signal?.addEventListener(
      'abort',
      () => {
        synth.cancel();
        resolve();
      },
      { once: true },
    );
    synth.speak(utterance);
  });
---
