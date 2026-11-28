---
name: miaougpt
desc: chat with a local AI cat (WebGPU, fully in-browser) — e.g. miaougpt
agent: no
alias: chat
seo_title: Local AI chat in your browser — WebGPU LLM, no server
man: |
  # MIAOUGPT(1)

  ## NAME
  miaougpt — a chat assistant powered by an LLM that runs entirely in your
  browser

  ## SYNOPSIS
  miaougpt
  miaougpt <model-id>

  ## DESCRIPTION
  miaougpt is a simple chat: you type, the (feline) assistant replies, streamed
  token by token. The model runs fully client-side via WebGPU — no server, no
  network call for inference.

  Model loading, its cache and GPU memory are handled by the central LLM module
  (see the `llm` command and the top-right widget, which shows the loaded model
  and the tokens consumed). By default no model is loaded: on first launch
  miaougpt proposes a model and asks you to **confirm** its download.

  With no argument, miaougpt proposes a small default chat model. You can also
  name a specific model (full id or a unique substring); `llm --list` shows the
  recommended models.

  If a model is already loaded (by `llm`, `glaude` or `denree`), miaougpt reuses
  it instantly, with no re-download.

  ## CHAT COMMANDS
  /exit /quit /bye  close the chat
  /reset /clear     forget the context (keep the model)
  /model            show the loaded model
  /voice [on|off]   read replies aloud (Web Speech API)
  /voice <lang>     read aloud in a language, e.g. /voice fr-FR
  /help             list these commands

  ## EXAMPLES
  miaougpt
  miaougpt Qwen2.5-1.5B
  miaougpt Llama-3.2-3B-Instruct

  ## SEE ALSO
  llm, denree, webllmfit, glaude
js: |
  // miaougpt — pure chat on top of the central LLM module (ctx.llm). All the
  // loading/consent/cache lives in src/lib/llm.ts; this command just proposes a
  // model, asks for confirmation, then streams the conversation. Token counting
  // and the widget are handled by the manager.
  const E = ctx.escape;
  const args = ctx.args.slice();
  const first = args[0];

  // Default chat model (proposed when nothing is already loaded).
  const DEFAULT = { base: 'Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', gb: 1.0 };

  // Scroll anchor to stay pinned to the bottom while streaming.
  const anchor = ctx.append('<div class="ln comment">miaougpt — local AI chat (WebGPU)</div>');
  const scroller = anchor.closest('.ssh-body');
  const toBottom = () => {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  // ---- make sure a model is loaded (consent via ctx.llm.ensure) ----
  let session;
  try {
    if (first && !first.startsWith('-')) {
      // A specific model was requested (id or substring).
      session = await ctx.llm.ensure({ base: first, label: first, reason: 'chat with miaougpt' });
    } else {
      // Reuse the already-loaded model, otherwise propose the default.
      const state = ctx.llm.state();
      if (state && state.modelId) {
        session = { modelId: state.modelId, label: state.label };
      } else {
        session = await ctx.llm.ensure({
          base: DEFAULT.base,
          label: DEFAULT.label,
          gb: DEFAULT.gb,
          reason: 'chat with miaougpt',
        });
      }
    }
  } catch (e) {
    ctx.error('miaougpt: ' + ((e && (e.message || e.name)) || e));
    ctx.line('miaougpt needs WebGPU (Chrome/Edge ≥ 113 or Safari 18+).');
    return;
  }
  if (!session) {
    ctx.line('miaougpt: cancelled — no model loaded.');
    return;
  }

  // ---- chat session ----
  ctx.line('');
  ctx.append(
    '<div class="ln"><span class="accent text-glow">🐱 miaougpt ready</span> <span class="comment">— ' +
      E(session.label || session.modelId) +
      '</span></div>',
  );
  ctx.line('Type a message and press Enter. Commands: /exit · /reset · /model · /voice · /help');
  ctx.line('');

  const SYSTEM = {
    role: 'system',
    content:
      'You are miaougpt, a friendly and concise chat assistant with a cat ' +
      'personality (you slip in the occasional quiet "meow"). You run entirely ' +
      "in the user's browser via WebLLM, with no server. Reply in the user's " +
      'language, helpfully and naturally.',
  };
  // Completed exchanges only ({ user, assistant }): a failed or interrupted
  // generation is never recorded, so it cannot poison the next requests.
  let exchanges = [];
  // History budget: the system prompt plus the most recent exchanges. Small
  // local models have a 2k–4k token window, so older turns are dropped.
  const MAX_EXCHANGES = 6;
  const buildMessages = (question) => {
    const messages = [SYSTEM];
    for (const exchange of exchanges.slice(-MAX_EXCHANGES)) {
      messages.push({ role: 'user', content: exchange.user });
      messages.push({ role: 'assistant', content: exchange.assistant });
    }
    messages.push({ role: 'user', content: question });
    return messages;
  };

  // ---- voice (Web Speech API, optional) ----
  const tts = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = false;
  let voiceLang = ''; // BCP 47 tag (e.g. fr-FR); empty = the browser's default voice
  const speak = (text) => {
    if (!tts || !text || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceLang) utterance.lang = voiceLang;
    try {
      tts.speak(utterance);
    } catch {
      /* ignore */
    }
  };
  const stopSpeaking = () => {
    if (tts) {
      try {
        tts.cancel();
      } catch {
        /* ignore */
      }
    }
  };

  // Ctrl+C interrupts the running generation and closes the session.
  if (ctx.signal) {
    ctx.signal.addEventListener(
      'abort',
      () => {
        ctx.llm.interrupt();
        stopSpeaking();
      },
      { once: true },
    );
  }

  while (true) {
    if (ctx.signal && ctx.signal.aborted) break;
    const raw = await ctx.ask('you›');
    const message = (raw || '').trim();
    if (!message) continue;

    ctx.append(
      '<div class="ln"><span class="prompt">you›</span> <span class="cmd">' +
        E(message) +
        '</span></div>',
    );

    // Slash commands are matched case-insensitively.
    const command = message.toLowerCase();
    if (command === '/exit' || command === '/quit' || command === '/bye') {
      stopSpeaking();
      ctx.line('see you 🐾');
      break;
    }
    if (command === '/help') {
      ctx.line('/exit  quit · /reset  forget context · /model · /voice  read aloud');
      continue;
    }
    if (command === '/model') {
      ctx.line('model: ' + (session.label || session.modelId));
      continue;
    }
    if (command === '/reset' || command === '/clear') {
      exchanges = [];
      stopSpeaking();
      ctx.line('context cleared.');
      continue;
    }
    if (command === '/voice' || command.startsWith('/voice ')) {
      if (!tts) {
        ctx.error('voice: speech synthesis is not available in this browser.');
        continue;
      }
      // No argument toggles; `on` / `off` force; a language tag sets the voice.
      const arg = (message.split(/\s+/)[1] || '').toLowerCase();
      if (arg === 'off' || (arg === '' && voice)) {
        voice = false;
        stopSpeaking();
        ctx.line('voice: off');
      } else if (arg === 'on' || arg === '') {
        voice = true;
        ctx.line('voice: on' + (voiceLang ? ' (' + voiceLang + ')' : ''));
      } else if (/^[a-z]{2}(-[a-z]{2})?$/.test(arg)) {
        voiceLang = arg;
        voice = true;
        ctx.line('voice: on (' + voiceLang + ')');
      } else {
        ctx.line('usage: /voice [on|off|<lang>]   e.g. /voice fr-FR');
      }
      continue;
    }

    // Stream the reply into a single growing line (textContent — never HTML).
    const row = ctx.append(
      '<div class="ln out" style="white-space:pre-wrap"><span class="accent">🐱› </span><span class="reply comment">…</span></div>',
    );
    const replyEl = row.querySelector('.reply');
    // Read the reply aloud as it streams, one finished sentence at a time:
    // `spokenLength` is how much of the reply was already handed to the
    // synthesizer. `force` flushes whatever is left once the reply is over.
    let spokenLength = 0;
    const flushSpeech = (full, force) => {
      if (!voice || !tts) return;
      const unspoken = full.slice(spokenLength);
      if (force) {
        if (unspoken.trim()) {
          speak(unspoken);
          spokenLength = full.length;
        }
        return;
      }
      // Everything up to the last sentence end (or line break) so far.
      const completeSentences = unspoken.match(/^[\s\S]*[.!?…\n]/);
      if (completeSentences) {
        speak(completeSentences[0]);
        spokenLength += completeSentences[0].length;
      }
    };

    let result;
    let streamed = ''; // what the model really wrote (never the "…" placeholder)
    let failed = false;
    try {
      result = await ctx.llm.chat({
        messages: buildMessages(message),
        stream: true,
        signal: ctx.signal,
        onToken: (delta, full) => {
          streamed = full;
          replyEl.classList.remove('comment');
          replyEl.textContent = full;
          flushSpeech(full, false);
          toBottom();
        },
      });
    } catch (e) {
      failed = true;
      if (!(ctx.signal && ctx.signal.aborted))
        ctx.error('miaougpt: generation failed — ' + (e.message || e.name));
    }

    const aborted = Boolean(ctx.signal && ctx.signal.aborted);
    const reply = (result && result.content) || streamed;
    if (!aborted) flushSpeech(reply, true);
    if (!reply) replyEl.textContent = '(no reply)';
    // Only a complete exchange joins the history: after a failure or an
    // interruption the question is forgotten along with its partial answer.
    if (reply && !failed && !aborted) exchanges.push({ user: message, assistant: reply });

    spokenLength = 0;
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

  ctx.line('miaougpt: chat closed (the model stays loaded — `llm --unload` to free it).');
---
