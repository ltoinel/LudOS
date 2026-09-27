---
name: denree
desc: reasoning AI agent (local LLM, WebGPU) that drives the terminal — e.g. denree "what's the weather in Rennes?"
alias: agent ?
seo_title: Local AI agent in your browser — reasons with tools
man: |
  # DENREE(1)

  ## NAME
  denree — an autonomous AI agent that accomplishes a goal by running the
  terminal's commands, reasoned by a local LLM (WebGPU, 100% in-browser)

  ## SYNOPSIS
  denree "<goal in natural language>"
  denree                (asks for the goal interactively)
  denree --commands
  denree --model <id> "<goal>"
  denree [--steps n] [--candidates n] [--rounds n] [--fast] "<goal>"
  denree --unload

  ## DESCRIPTION
  denree (a nod to "la Denrée", the alien from the film *La Soupe aux Choux*)
  is a reasoning agent: you give it a goal and a language model running
  entirely in your browser (WebGPU, no server) works it out through a small
  reasoning graph, shown live as a tree:

  - plan: a first split of the goal into sub-questions — a hint, not a
    fixed script;
  - decide → act → reflect, in a loop: the model picks the next command
    seeing every fact gathered so far (so one result can feed the next
    command, e.g. checkip finds your city, then weather <city>), the command
    runs, and the model extracts its facts — or, with the command's manual
    in view, explains what went wrong so the next decision can fix it. A
    lookup (help -k <keyword>, man <command>) skips that check: its output
    is kept as-is for the next decision, so the agent can find a command
    it did not think of, then use it (its manual then joins the context);
  - synthesize: an answer is drafted from the facts;
  - critique: only when the investigation did not settle the goal (or with
    --candidates > 1), the draft is scored against the facts; if something
    is missing, one more command is run and the answer re-synthesized;
  - answer: the best-scored draft wins.

  A small local model is slow, so the agent spends calls only where they
  help: a short, single-part goal skips the plan, and a settled
  investigation goes straight to one answer — about 4 to 5 model calls
  for a simple question. Every prompt is kept within the model's context
  window (manuals, then lookups, then the oldest facts are trimmed first)
  and every generation has a length cap.

  denree adapts to the model loaded in the browser: every budget is derived
  from that model's context window (4k tokens for most builds, 1k or 2k for
  some — shown at the top of the tree), and the characters-per-token
  estimate is measured on each call from the token counts the engine
  reports. In a small window the command list shrinks to names only, and
  outputs, manuals and facts are cut shorter. Should a prompt still
  overflow, it is rebuilt from the exact token count and retried once.

  Every decision is constrained to JSON by the engine (grammar-guided
  generation). Every call starts with the same system prompt: the model is
  told it runs in the visitor's browser, inside LudOS — a simulated Linux
  environment whose shell commands it is free to use to answer — and that
  `help -k <keyword>` finds the commands whose manual mentions a keyword
  (plain `help` would only repeat the list it already has). It also receives the whole catalog of usable
  commands (`denree --commands`) and the manuals of the most relevant ones. Commands
  with side effects, endless or heavy ones (rm, su, msg, open, dl, top,
  hashcat, httperf, todo, say, the LLM commands…) are blocked for safety,
  and interactive commands get no keyboard input.

  The model comes from the central LLM module (see `llm` and the widget in
  the top-right corner). By default no model is loaded: denree proposes a
  reasoning model and asks you to confirm its download — unless a model is
  already warm, which it reuses instantly. Ctrl+C interrupts it.

  ## OPTIONS
  --commands, --list   list the commands the agent may use
  --model <id>         pick the reasoning model (default: Qwen2.5-1.5B)
  --steps <n>          max decide → act → reflect steps (1–30, default 12)
  --candidates <n>     answers drafted, then ranked by a critique (1–5, default 1)
  --rounds <n>         critique/refinement rounds when the goal is not settled (0–4, default 2)
  --fast               6 steps, one candidate, no critique round (quicker)
  --unload, --stop     free the loaded model from GPU memory

  ## EXAMPLES
  denree "what is my public IP address and its country?"
  denree "summarize the file about.md in one sentence"
  denree --steps 20 "search for the word 'drone' in my documents"
  denree --fast "what time is it?"
  denree --model Qwen2.5-3B-Instruct "what's the weather in Rennes?"
  denree --unload

  ## SEE ALSO
  miaougpt, glaude, llm, webllmfit, help
js: |
  // denree — an autonomous agent reasoned by a local LLM (via ctx.llm), which
  // explores a REASONING GRAPH to reach the best answer:
  //
  //   goal ─▶ PLAN        a first decomposition into sub-questions (a hint only)
  //        ─▶ DECIDE      pick the next command, seeing every fact gathered so
  //                       far — one output can feed the next command's arguments
  //        ─▶ ACT         run it headlessly (ctx.capture)
  //        ─▶ REFLECT     extract the facts, or explain what went wrong (with the
  //                       command's manual in view), and tell if the goal is met
  //           … loop DECIDE → ACT → REFLECT until answered or out of steps
  //        ─▶ SYNTHESIZE  draft the answer from the facts
  //        ─▶ CRITIQUE    if not settled: score it; if something is missing, run the proposed
  //                       command and synthesize again
  //        ─▶ ANSWER      the best-scored draft
  //
  // Every call is stateless and gets a condensed memory (facts + failures), so
  // many steps fit in a small model's context. Decisions are JSON-constrained.
  const E = ctx.escape;
  const args = ctx.args.slice();

  // ---------------------------------------------------------------- settings

  // Reasoning model proposed when nothing is loaded yet.
  const DEFAULT_MODEL = { base: 'Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', gb: 1.0 };

  // Commands the agent must never run: mutations with no undo, control flow,
  // side effects (network pings of the owner, downloads, audio, timers,
  // request bursts at a host), endless or CPU-heavy commands, and the LLM
  // commands themselves.
  const DENY = new Set([
    'rm', 'su', 'sudo', 'exit', 'clear', 'boot', 'msg', 'open', 'iframed', 'theme',
    'bell', 'miaougpt', 'llm', 'glaude', 'denree', 'shutdown', 'reboot', 'dl',
    'pomodoro', 'say', 'top', 'hashcat', 'todo', 'history', 'httperf', 'nano',
  ]);

  // ------------------------------------------------------------------ options

  // The model runs locally, so reasoning costs time, not money: calls are spent
  // only where they help, and bounded so a confused model cannot loop forever.
  const options = {
    model: undefined,
    maxSteps: 12, // decide → act → reflect steps (commands run)
    candidates: 1, // answers drafted; more than one are judged by a critique
    rounds: 2, // critique → extra command → re-synthesis, if the goal is not settled
  };
  const goalWords = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => parseInt(args[++i], 10);
    if (arg === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === '--steps' || arg === '--budget') {
      options.maxSteps = Math.min(30, Math.max(1, next() || 12));
    } else if (arg === '--candidates') {
      options.candidates = Math.min(5, Math.max(1, next() || 1));
    } else if (arg === '--rounds') {
      options.rounds = Math.min(4, Math.max(0, next() || 0));
    } else if (arg === '--fast') {
      options.maxSteps = 6;
      options.candidates = 1;
      options.rounds = 0;
    } else {
      goalWords.push(arg);
    }
  }
  let goal = goalWords.join(' ').trim();
  const first = args[0];

  // ------------------------------------------------------------------ helpers

  // Tolerant JSON parse: strips ```fences``` and isolates the first object.
  const parseJson = (text) => {
    if (text == null) return null;
    if (typeof text === 'object') return text;
    let s = String(text).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      s = fence[1].trim();
    }
    try {
      return JSON.parse(s);
    } catch {
      const object = s.match(/\{[\s\S]*\}/);
      if (object) {
        try {
          return JSON.parse(object[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  // Mini-RAG over the man pages (BM25-lite, no embeddings): a small model
  // guesses command syntax poorly, so the SYNOPSIS/OPTIONS of the most relevant
  // commands are injected into its context. The manuals are English.
  const STOP_WORDS = new Set(
    'the a an of to in on at by for and or is are be with from as this that it your you my via eg use using into what how'.split(' '),
  );
  const tokenize = (text) =>
    ((text || '').toLowerCase().match(/[a-z0-9][a-z0-9.+_-]*/g) || []).filter(
      (term) => term.length > 1 && !STOP_WORDS.has(term),
    );

  const manExcerpt = (man) => {
    if (!man) return '';
    const parts = [];
    for (const section of ['SYNOPSIS', 'OPTIONS']) {
      const match = man.match(new RegExp('##\\s+' + section + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)'));
      if (match) {
        parts.push(section + '\n' + match[1].replace(/\s+$/, '').slice(0, 320));
      }
    }
    return parts.join('\n');
  };

  const rankManuals = (query, commands, limit) => {
    const queryTerms = Array.from(new Set(tokenize(query)));
    if (!queryTerms.length) return [];
    const corpus = commands.map((command) => ({
      command,
      terms: tokenize(`${command.name} ${command.name} ${command.desc} ${command.man}`),
    }));
    const documentFrequency = {};
    for (const doc of corpus) {
      for (const term of new Set(doc.terms)) {
        documentFrequency[term] = (documentFrequency[term] || 0) + 1;
      }
    }
    const count = corpus.length;
    const averageLength = corpus.reduce((sum, doc) => sum + doc.terms.length, 0) / count;
    const K1 = 1.5;
    const B = 0.75;
    return corpus
      .map((doc) => {
        const termFrequency = {};
        for (const term of doc.terms) {
          termFrequency[term] = (termFrequency[term] || 0) + 1;
        }
        let score = 0;
        for (const term of queryTerms) {
          const f = termFrequency[term] || 0;
          if (!f) continue;
          const df = documentFrequency[term];
          const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
          const norm = 1 - B + (B * doc.terms.length) / averageLength;
          score += (idf * f * (K1 + 1)) / (f + K1 * norm);
        }
        if (queryTerms.includes(doc.command.name)) {
          score += 5; // the goal names the command explicitly
        }
        return { command: doc.command, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.command);
  };

  // ------------------------------------------------------------ sub-commands

  ctx.append(
    '<div class="ln ascii-art"><span class="accent text-glow">░▒▓ DENREE ▓▒░</span> ' +
      '<span class="comment">— reasoning agent (local LLM, WebGPU)</span></div>',
  );

  const usable = ctx.commands.filter((command) => !DENY.has(command.name));

  if (first === '--commands' || first === '--list' || first === '-l') {
    ctx.line(`${usable.length} command(s) usable by the agent (side-effect ones excluded):`);
    ctx.line('');
    for (const command of usable) {
      ctx.append(
        `<div class="ln out"><span class="cmd">${E(command.name)}</span> ` +
          `<span class="comment">— ${E(command.desc)}</span></div>`,
      );
    }
    return;
  }

  if (first === '--unload' || first === '--stop') {
    const freed = await ctx.llm.unload();
    ctx.line(freed ? 'denree: model unloaded, GPU memory freed.' : 'denree: no model loaded.');
    return;
  }

  // No goal on the command line (e.g. the dock's "ask AI" tile): ask for it.
  if (!goal) {
    ctx.line('Ask me anything — I will use the terminal\'s commands to find the answer. Examples:');
    ctx.line('  what is my public IP address and its country?');
    ctx.line('  summarize about.md in one sentence');
    ctx.line('');
    goal = ((await ctx.ask('ask ›')) || '').trim();
    if (!goal) {
      ctx.line('denree: no question — see also: denree --commands · man denree');
      return;
    }
  }

  // ------------------------------------------------------------ load a model

  let session;
  try {
    const state = ctx.llm.state();
    if (state && state.modelId && !options.model) {
      session = { modelId: state.modelId, label: state.label }; // reuse the warm model
    } else {
      session = await ctx.llm.ensure({
        base: options.model || DEFAULT_MODEL.base,
        label: options.model || DEFAULT_MODEL.label,
        gb: options.model ? undefined : DEFAULT_MODEL.gb,
        reason: 'Denree agent (reasoning)',
      });
    }
  } catch (e) {
    ctx.error(`denree: ${(e && (e.message || e.name)) || e}`);
    ctx.line('The agent needs WebGPU. Try a recent Chrome/Edge (≥ 113) or Safari 18+.');
    return;
  }
  if (!session) {
    ctx.line('denree: cancelled — no model loaded.');
    return;
  }

  // Ctrl+C interrupts the running generation as well as the loop.
  if (ctx.signal) {
    ctx.signal.addEventListener('abort', () => ctx.llm.interrupt(), { once: true });
  }
  const aborted = () => Boolean(ctx.signal && ctx.signal.aborted);

  // -------------------------------------------------------- reasoning graph

  // Each node is printed as soon as it is created, indented under its parent,
  // so the graph grows live on screen.
  const TREE_COLORS = { ok: 'var(--green)', fail: '#ff6b6b', info: 'var(--dim)' };
  const addNode = (parent, icon, label, status = 'info', detail = '') => {
    const node = { depth: parent ? parent.depth + 1 : 0 };
    const indent = node.depth ? '   '.repeat(node.depth - 1) + '└─ ' : '';
    const detailHtml = detail
      ? `\n${'   '.repeat(node.depth)}   <span class="comment">${E(detail)}</span>`
      : '';
    ctx.append(
      `<div class="ln" style="white-space:pre-wrap"><span class="comment">${indent}</span>` +
        `<span style="color:${TREE_COLORS[status]}">${icon}</span> ${E(label)}${detailHtml}</div>`,
    );
    return node;
  };

  // ------------------------------------------------------------ LLM calls

  let llmCalls = 0;

  // The system prompt shared by every call: who the agent is, where it runs,
  // and how it can discover the commands it may use.
  const SYSTEM_CONTEXT =
    'You are Denree, an AI agent running entirely in the user\'s web browser ' +
    '(a local language model on WebGPU, no server). You operate inside LudOS, a ' +
    'website that simulates a Linux environment with its own shell commands. You are ' +
    'free to use these commands to answer the user\'s requests. To find a command, ' +
    'run `help -k <keyword>`: it lists the commands whose manual mentions the keyword ' +
    '(e.g. help -k weather); `man <command>` shows how to use one. Plain `help` adds ' +
    'nothing: every command is already listed below.';

  // ------------------------------------------------------------ model limits

  // Every prompt is sized from the loaded model's context window, which the
  // prompt and the answer share: 4k tokens for most WebLLM builds, 1k or 2k
  // for some. Unknown (older engine) ⇒ assume the common 4k.
  const contextWindow = (ctx.llm.state() || {}).contextWindow || 4096;
  // Characters per token: a cautious first guess, then measured on every call
  // from the prompt tokens the engine reports (chat template included, which
  // keeps the estimate on the safe side).
  let charsPerToken = 3.2;
  const TEMPLATE_TOKENS = 64; // role markers + margin
  // An answer never takes more than a quarter of the window.
  const outputCap = (wanted) => Math.max(48, Math.min(wanted, Math.floor(contextWindow / 4)));
  // Characters left for the call-specific part of a prompt (after the shared
  // system prompt) when the answer is capped at `cap` tokens.
  const promptBudget = (cap) =>
    Math.max(
      400,
      Math.floor((contextWindow - cap - TEMPLATE_TOKENS) * charsPerToken) - SYSTEM_CONTEXT.length,
    );

  // One stateless model call. Every call gets a condensed state (facts,
  // failures) rather than a growing transcript, so any number of steps fits in
  // the context window. `build(budget)` returns { system, user } within
  // `budget` characters; it is rebuilt with a tighter budget if the engine
  // still reports an overflow. With a schema, returns the parsed object ({} if
  // unparsable).
  const think = async (build, { schema, temperature = 0, maxTokens = 256 } = {}) => {
    const cap = outputCap(maxTokens);
    for (let attempt = 0; ; attempt++) {
      const { system, user } = build(promptBudget(cap));
      const messages = [
        { role: 'system', content: SYSTEM_CONTEXT + '\n\n' + system },
        { role: 'user', content: user },
      ];
      const chars = messages[0].content.length + user.length;
      llmCalls++;
      let result;
      try {
        result = await ctx.llm.chat({
          messages,
          schema,
          temperature,
          maxTokens: cap,
          stream: false,
          signal: ctx.signal,
        });
      } catch (e) {
        // "Prompt tokens exceed context window size: number of prompt tokens: N"
        const overflow = String((e && e.message) || e).match(/prompt tokens: (\d+)/);
        if (!overflow || attempt > 0) throw e;
        charsPerToken = Math.max(1.2, (chars / Number(overflow[1])) * 0.9);
        continue;
      }
      const promptTokens = result && result.usage && result.usage.promptTokens;
      if (promptTokens) {
        const measured = chars / promptTokens;
        // Follow a denser text at once, a lighter one halfway.
        charsPerToken = Math.min(5, Math.max(1.2, measured < charsPerToken ? measured : (charsPerToken + measured) / 2));
      }
      const text = ((result && result.content) || '').trim();
      return schema ? parseJson(text) || {} : text;
    }
  };

  // ------------------------------------------------------------ context

  const catalog = usable
    .map((c) => `- ${c.name}${c.alias.length ? ` (alias: ${c.alias.join(', ')})` : ''}: ${c.desc}`)
    .join('\n');
  // A small window cannot hold every description (~2k characters): the names
  // alone then, help -k telling what each does.
  const catalogFor = (budget) =>
    catalog.length <= budget * 0.3
      ? 'Available commands (name: description):\n' + catalog
      : 'Available commands (help -k <keyword> tells what each does): ' +
        usable.map((c) => c.name).join(', ');
  const commandByName = (name) =>
    usable.find((c) => c.name === name || c.alias.includes(name)) || null;
  const manualOf = (name) => {
    const command = commandByName(name);
    return command && command.man ? `### ${command.name}\n${manExcerpt(command.man)}` : '';
  };
  // Manuals of the commands most relevant to the goal (lexical mini-RAG),
  // completed during the run by the commands found through help -k / man.
  const goalManuals = rankManuals(goal, usable, 4);
  const lookedUp = []; // command names, most recent first
  const manualsText = (limit) => {
    const names = [...new Set([...lookedUp, ...goalManuals.map((c) => c.name)])];
    let text = '';
    for (const name of names) {
      const manual = manualOf(name);
      if (!manual || text.length + manual.length + 2 > limit) continue;
      text += (text ? '\n\n' : '') + manual;
    }
    return text ? 'Reference manuals (exact syntax and flags):\n\n' + text : '';
  };

  // Keeps the start of a text that must fit in `limit` characters.
  const clip = (text, limit) => (text.length > limit ? text.slice(0, Math.max(0, limit - 1)) + '…' : text);

  const TERMINAL_RULES =
    'Command rules: use only the commands listed, by their plain name, one single line ' +
    '(pipes `|` allowed). There is NO bash/sh: never write `bash -c`. No heredocs. ' +
    'No environment variables (`TZ=… date`). Interactive commands get no keyboard input: ' +
    'always pass their arguments (e.g. bc "2+2", not bc).';

  // ------------------------------------------------------------ memory

  // The agent's working memory — what every decision is based on.
  const facts = []; // { command, facts } — evidence for the answer
  const failures = []; // { command, reason } — what did not work, and why
  const ran = new Map(); // normalized command → observation (never run twice)
  // help / man outputs: what the agent learned about the commands themselves.
  // Not evidence for the answer, so kept apart from the facts and shown as-is
  // to the next decision (the reflect step would discard it as off-topic).
  const DISCOVERY = new Set(['help', 'man']);
  const discoveries = []; // { command, output }
  let commandsRun = 0;

  // Keeps the most recent entries that fit in `limit` characters, whole — a
  // fact cut mid-line could turn into a wrong value.
  const newestFirst = (entries, limit) => {
    const kept = [];
    let size = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (size + entries[i].length + 2 > limit) break;
      kept.unshift(entries[i]);
      size += entries[i].length + 2;
    }
    return kept.join('\n\n');
  };
  const factsText = (limit = 2400) =>
    facts.length
      ? newestFirst(
          facts.map((f, i) => `[${i + 1}] $ ${f.command}\n${f.facts}`),
          limit,
        ) || facts[facts.length - 1].facts.slice(0, limit)
      : '(none yet)';
  const discoveriesText = (limit = 1200) =>
    newestFirst(
      discoveries.map((d) => `$ ${d.command}\n${d.output.slice(0, limit)}`),
      limit,
    );
  const failuresText = () =>
    failures.length
      ? failures.map((f) => `- $ ${f.command} → ${f.reason}`).join('\n').slice(-800)
      : '(none)';

  // ------------------------------------------------------------ ACT

  // Normalizes a model-written command line: drops `VAR=value` prefixes and a
  // path on the command name (`/bin/cat` → `cat`). Returns { command, name }.
  const normalize = (rawCommand) => {
    let line = rawCommand.trim().replace(/\s+/g, ' ');
    let envMatch = line.match(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(\S[\s\S]*)$/);
    while (envMatch) {
      line = envMatch[1];
      envMatch = line.match(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(\S[\s\S]*)$/);
    }
    const head = line.match(/^(\S+)([\s\S]*)$/);
    const name = head ? head[1].replace(/^.*\//, '') : line;
    return { command: head ? name + head[2] : line, name };
  };
  const attempted = new Set(); // every normalized command tried, valid or not

  // Checks every pipeline stage is a real, allowed command, then runs it
  // headlessly. Returns { command, name, ok, observation, repeated? }.
  const execute = async (rawCommand) => {
    const { command, name } = normalize(rawCommand);
    attempted.add(command);
    const names = command.split('|').map((stage) => stage.trim().split(/\s+/)[0]);
    const isKnown = (n) => ctx.commands.some((c) => c.name === n || c.alias.includes(n));

    if (ran.has(command)) {
      return { command, name, ok: false, observation: ran.get(command), repeated: true };
    }
    if (names.some((n) => /^(?:ba|z)?sh$/.test(n))) {
      return { command, name, ok: false, observation: 'there is no shell: run the command directly.' };
    }
    const unknown = names.find((n) => !isKnown(n));
    if (unknown) {
      return { command, name, ok: false, observation: `command "${unknown}" does not exist here.` };
    }
    const forbidden = names.find((n) => !commandByName(n));
    if (forbidden) {
      return { command, name, ok: false, observation: `command "${forbidden}" is not allowed.` };
    }
    commandsRun++;
    const result = await ctx.capture(command);
    const observation = (result.stdout || result.stderr || '(no output)').slice(0, 1500);
    ran.set(command, observation);
    return { command, name, ok: result.ok && Boolean(result.stdout.trim()), observation };
  };

  // ------------------------------------------------------------ PLAN (hint)

  const PLAN_SCHEMA = {
    type: 'object',
    properties: {
      analysis: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            command: { type: 'string' },
          },
          required: ['question', 'command'],
        },
      },
    },
    required: ['analysis', 'steps'],
  };

  // ------------------------------------------------------------ DECIDE

  // The next step, chosen with the whole memory in view: that is what lets one
  // command's output become the next command's argument (checkip finds a
  // city, then weather <city>).
  const DECIDE_SCHEMA = {
    type: 'object',
    properties: {
      thought: { type: 'string' },
      action: { type: 'string', enum: ['run', 'answer'] },
      command: { type: 'string' },
    },
    required: ['thought', 'action', 'command'],
  };

  // ------------------------------------------------------------ REFLECT

  const REFLECT_SCHEMA = {
    type: 'object',
    properties: {
      useful: { type: 'boolean' },
      facts: { type: 'string' },
      problem: { type: 'string' },
      goal_answered: { type: 'boolean' },
    },
    required: ['useful', 'facts', 'problem', 'goal_answered'],
  };

  // ------------------------------------------------------------ SYNTHESIZE + CRITIQUE

  const SYNTHESIZE_RULES =
    'You answer the question using the numbered facts gathered from terminal commands. ' +
    'Use ONLY those facts for anything factual or live (IP, weather, dates, files…); ' +
    'never invent, convert or substitute values. If the facts are empty and the ' +
    'question needs live data, say you could not find it. A purely general or ' +
    'conversational question may be answered from general knowledge. Be concise and ' +
    'reply in the SAME language as the question.';
  const synthesize = (temperature) =>
    think(
      (budget) => {
        const room = budget - SYNTHESIZE_RULES.length - goal.length - 30;
        return {
          system: SYNTHESIZE_RULES,
          user: `Question: ${goal}\n\nFacts:\n${factsText(Math.max(200, Math.min(3000, room)))}\n\nAnswer:`,
        };
      },
      { temperature, maxTokens: 400 },
    );

  const CRITIQUE_SCHEMA = {
    type: 'object',
    properties: {
      score: { type: 'integer' },
      missing: { type: 'string' },
      command: { type: 'string' },
    },
    required: ['score', 'missing', 'command'],
  };

  const CRITIQUE_RULES =
    'You grade an answer from 0 to 10: is it fully supported by the facts, complete, ' +
    'and does it answer the question? Deduct heavily for any value not present in the ' +
    'facts. If information is missing, describe it in "missing" and propose ONE ' +
    'command that would provide it in "command" (else "").\n' +
    TERMINAL_RULES;
  const critique = (draft) =>
    think(
      (budget) => {
        const system = CRITIQUE_RULES + '\n\n' + catalogFor(budget);
        const answerPart = clip(draft, 800);
        const room = budget - system.length - goal.length - answerPart.length - 50;
        return {
          system,
          user:
            `Question: ${goal}\n\nFacts:\n${factsText(Math.max(200, Math.min(2400, room)))}\n\n` +
            `Answer to grade:\n${answerPart}`,
        };
      },
      { schema: CRITIQUE_SCHEMA, maxTokens: 200 },
    );

  const REFLECT_RULES =
    'You check a command output for a goal. Extract the facts relevant to the goal ' +
    'literally (numbers, names, dates) — never invent or convert. If the output is an ' +
    'error, empty or off-topic, set useful=false and explain the problem in one short ' +
    'sentence (e.g. the correct syntax from the manual). Set goal_answered=true only ' +
    'if all the facts gathered so far fully answer the goal.';

  // ------------------------------------------------------------ the loop

  // One step of the graph: run a command, then reflect on its output with the
  // command's own manual in view. Returns true when the goal looks answered.
  const step = async (command, parent) => {
    const result = await execute(command);
    const preview = result.observation.replace(/\s+/g, ' ').slice(0, 140);
    const node = addNode(parent, '▸', result.command, result.ok ? 'ok' : 'fail', preview);
    if (result.repeated) {
      failures.push({ command: result.command, reason: 'already run — use its facts or try another command' });
      return false;
    }
    // A lookup (help -k weather, man weather) is remembered for the next
    // decision instead of being judged as evidence. Piped, it is a normal step.
    if (DISCOVERY.has(result.name) && !result.command.includes('|')) {
      if (result.ok) {
        discoveries.push({ command: result.command, output: result.observation });
        // The commands it points at get their manual in the next prompts:
        // `man x` names one, `help -k` lists one per line (name first).
        const words = result.command.split(/\s+/);
        const found = (result.name === 'man'
          ? [words[1]]
          : result.observation.split('\n').map((line) => line.trim().split(/\s+/)[0])
        ).filter((name) => name && commandByName(name) && name !== 'help');
        for (const name of found.slice(0, 2).reverse()) {
          const canonical = commandByName(name).name;
          if (!lookedUp.includes(canonical)) lookedUp.unshift(canonical);
        }
        addNode(node, '📖', 'noted for the next decision', 'info', found.length ? `manuals: ${found.slice(0, 2).join(', ')}` : '');
      } else {
        failures.push({ command: result.command, reason: result.observation.slice(0, 160) });
        addNode(node, '✗', 'nothing found', 'fail');
      }
      return false;
    }
    const reflection = await think(
      (budget) => {
        // The output matters most here, then the manual, then earlier facts.
        const rules = REFLECT_RULES;
        const output = clip(result.observation, Math.max(300, Math.min(1500, budget * 0.45)));
        const manual = clip(manualOf(result.name), Math.max(0, Math.min(700, budget * 0.2)));
        const room = budget - rules.length - manual.length - output.length - goal.length - result.command.length - 60;
        return {
          system: rules + '\n\n' + manual,
          user:
            `Goal: ${goal}\n\nFacts so far:\n${factsText(Math.max(150, Math.min(1200, room)))}\n\n` +
            `Command: ${result.command}\nOutput:\n${output}`,
        };
      },
      { schema: REFLECT_SCHEMA, maxTokens: 320 },
    );
    const extracted = (reflection.facts || '').trim();
    // Small models sometimes "extract" a placeholder: that is no evidence.
    const isPlaceholder = /^(n\/?a|none|null|unknown|nothing|empty|no (data|facts|information)|-+)\.?$/i.test(extracted);
    if (reflection.useful && extracted && !isPlaceholder) {
      facts.push({ command: result.command, facts: extracted });
      addNode(node, '✓', 'useful', 'ok', extracted.slice(0, 200));
    } else {
      const problem = (reflection.problem || '').trim() || 'no useful output';
      failures.push({ command: result.command, reason: problem });
      addNode(node, '✗', 'not conclusive', 'fail', problem.slice(0, 160));
    }
    return Boolean(reflection.goal_answered) && facts.length > 0;
  };

  let answer = '';
  let bestScore = null;
  try {
    ctx.line('');
    const root = addNode(null, '◆', `goal: ${goal}`, 'info');
    addNode(
      root,
      '📏',
      `context window: ${contextWindow} tokens`,
      'info',
      catalog.length > promptBudget(200) * 0.3 ? 'small window — compact command list, shorter prompts' : '',
    );
    if (goalManuals.length) {
      addNode(root, '📚', `manuals: ${goalManuals.map((c) => c.name).join(', ')}`, 'info');
    }

    // PLAN: a first decomposition, used as a hint by every later decision —
    // not a fixed script, so the agent can adapt to what it discovers. A
    // short, single-part goal skips it: the decisions see every fact anyway,
    // so the plan would only cost one more model call.
    const multiPart = /\b(and|then|et|puis|also|after)\b|[,;]/i.test(goal);
    const needsPlan = multiPart || tokenize(goal).length > 6;
    const PLAN_RULES =
      'Split the goal into the short sub-questions needed to answer it, in order, and ' +
      'give for each the command most likely to answer it ("" if no command is needed). ' +
      'A later step may depend on an earlier result: write it as a question, the ' +
      'command will be decided when that result is known.\n' +
      TERMINAL_RULES;
    const plan = !needsPlan ? { analysis: 'short goal — no plan needed', steps: [] } : await think(
      (budget) => {
        const system = PLAN_RULES + '\n\n' + catalogFor(budget);
        const room = budget - system.length - goal.length - 10;
        return { system: system + '\n\n' + manualsText(Math.max(0, Math.min(2600, room))), user: `Goal: ${goal}` };
      },
      { schema: PLAN_SCHEMA, maxTokens: 320 },
    );
    const hints = (Array.isArray(plan.steps) ? plan.steps : [])
      .filter((s) => s && typeof s.question === 'string')
      .slice(0, 6);
    const planNode = addNode(root, '🧭', needsPlan ? 'plan' : 'plan skipped', 'info', (plan.analysis || '').slice(0, 220));
    for (const hint of hints) {
      addNode(planNode, '?', hint.question, 'info', hint.command ? `→ ${hint.command}` : '');
    }
    const planText = hints.length
      ? hints.map((h, i) => `${i + 1}. ${h.question}${h.command ? ` (maybe: ${h.command})` : ''}`).join('\n')
      : '(no plan)';

    // When the model gets stuck repeating itself, the agent falls back on the
    // commands it has itself pointed at but not tried yet: the plan's
    // commands, then any command named in its plan or thoughts (e.g. the plan
    // says "whoami" but the model keeps choosing pwd).
    const mentioned = [];
    const noteMentions = (text) => {
      for (const c of usable) {
        if (new RegExp(`(^|[^\\w-])${c.name}([^\\w-]|$)`).test(text || '')) mentioned.push(c.name);
      }
    };
    noteMentions(plan.analysis);
    hints.forEach((h) => noteMentions(h.question));
    const nextUntried = () =>
      [...hints.map((h) => (h.command || '').trim()).filter(Boolean), ...mentioned].find(
        (c) => !attempted.has(normalize(c).command),
      );

    // DECIDE → ACT → REFLECT, until the goal is answered or the steps run out.
    const actNode = addNode(root, '⚙', 'investigation', 'info');
    let settled = false; // the loop ended on its own (answer ready / nothing to run)
    let resolved = false; // …and the model judged the facts sufficient
    let stuck = 0; // decisions that only repeated an earlier command
    const DECIDE_RULES =
      'Decide the NEXT step ' +
      'towards the goal, using the facts gathered so far: action "run" with ONE ' +
      'command (you may reuse values from the facts as arguments), or action ' +
      '"answer" when the facts already answer the goal (or when no command can ' +
      'help). Never repeat a command from the failures without fixing it. If no ' +
      'listed command obviously fits, look one up with help -k <keyword> (or read ' +
      'its usage with man <command>) before giving up.\n' +
      TERMINAL_RULES;
    for (let n = 0; n < options.maxSteps && !aborted(); n++) {
      // Fit the prompt in the budget: the fixed parts first, then the facts
      // (the evidence matters most), the lookups, and the manuals last.
      const head = `Goal: ${goal}\n\nPlan (a hint):\n${planText}\n\n`;
      const tail =
        `Failures:\n${failuresText()}\n\n` +
        `Commands already run (NEVER run them again): ${[...attempted].join(', ') || '(none)'}\n\n` +
        'Next step:';
      const decision = await think(
        (budget) => {
          const rules = DECIDE_RULES + '\n\n' + catalogFor(budget);
          let room = budget - rules.length - head.length - tail.length;
          const factsPart = `Facts so far:\n${factsText(Math.max(200, Math.min(2400, room * 0.5)))}\n\n`;
          room -= factsPart.length;
          const lookups = discoveries.length ? discoveriesText(Math.max(150, Math.min(1200, room * 0.4))) : '';
          const lookupsPart = lookups ? `Command lookups (help / man):\n${lookups}\n\n` : '';
          room -= lookupsPart.length;
          return {
            system: rules + '\n\n' + manualsText(Math.max(0, room)),
            user: head + factsPart + lookupsPart + tail,
          };
        },
        { schema: DECIDE_SCHEMA, maxTokens: 200 },
      );
      noteMentions(decision.thought);
      const command = (decision.command || '').trim();
      if (decision.action !== 'run' || !command) {
        addNode(actNode, '■', 'enough to answer', 'info', (decision.thought || '').slice(0, 160));
        settled = true;
        resolved = facts.length > 0;
        break;
      }
      // A repeat brings nothing new: try an untried command the model itself
      // pointed at, or stop investigating after the second time.
      if (attempted.has(normalize(command).command)) {
        stuck++;
        const fallback = nextUntried();
        if (stuck > 2 || !fallback) {
          addNode(actNode, '↻', `stuck repeating "${command}" — moving on to the answer`, 'fail');
          settled = true;
          break;
        }
        addNode(actNode, '↻', `"${command}" already ran — trying "${fallback}" instead`, 'info');
        if (await step(fallback, actNode)) {
          settled = true;
          resolved = true;
          break;
        }
        continue;
      }
      if (await step(command, actNode)) {
        settled = true;
        resolved = true;
        break;
      }
    }
    if (!settled && !aborted()) {
      addNode(actNode, '⌛', `step budget reached (${options.maxSteps})`, 'info');
    }

    // SYNTHESIZE, then CRITIQUE only when it can change the outcome: several
    // candidates to rank, or an investigation that did not settle the goal
    // (then a missing fact can trigger one more command and a new draft).
    // A small model grades its own settled answer poorly — not worth a call.
    const review = options.candidates > 1 || (options.rounds > 0 && !resolved);
    for (let round = 0; round <= options.rounds && !aborted(); round++) {
      const draftsNode = addNode(root, '✎', `synthesis${round ? ` (round ${round + 1})` : ''}`, 'info');
      const scored = [];
      for (let i = 0; i < options.candidates && !aborted(); i++) {
        const draft = await synthesize(i === 0 ? 0 : 0.7);
        if (!draft) continue;
        if (!review) {
          scored.push({ draft, score: null, review: {} });
          addNode(draftsNode, '◇', 'answer drafted', 'ok', draft.slice(0, 160));
          continue;
        }
        const grade = await critique(draft);
        const score = Math.max(0, Math.min(10, Number(grade.score) || 0));
        scored.push({ draft, score, review: grade });
        addNode(draftsNode, '◇', `candidate ${i + 1} — score ${score}/10`, score >= 6 ? 'ok' : 'fail', draft.slice(0, 160));
      }
      if (!scored.length) break;
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      answer = best.draft;
      bestScore = best.score;

      const followUp = (best.review.command || '').trim();
      if (!review || best.score >= 8 || round >= options.rounds || !followUp) break;
      const gapNode = addNode(draftsNode, '⚑', `missing: ${best.review.missing || 'more evidence'}`, 'fail');
      const before = facts.length;
      await step(followUp, gapNode);
      if (facts.length === before) break; // the extra command brought nothing new
    }
  } catch (e) {
    if (!aborted()) {
      ctx.error(`denree: ${(e && (e.message || e.name)) || e}`);
    }
  }

  // ------------------------------------------------------------ ANSWER

  ctx.line('');
  if (answer && !aborted()) {
    ctx.append(
      '<div class="ln out" style="white-space:pre-wrap"><span class="accent text-glow">✦ answer › </span>' +
        `<span class="reply">${E(answer)}</span></div>`,
    );
  } else if (aborted()) {
    ctx.line('denree: interrupted.');
  } else {
    ctx.line('denree: no conclusive answer.');
  }
  const scoreText = bestScore === null ? '' : ` · confidence ${bestScore}/10`;
  ctx.append(
    `<div class="ln comment">— ${commandsRun} command(s) · ${llmCalls} LLM call(s)${scoreText} · ` +
      `model ${E(session.modelId)} (stays warm — llm --unload to free it)</div>`,
  );
---
