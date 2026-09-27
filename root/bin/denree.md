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
    in view, explains what went wrong so the next decision can fix it;
  - synthesize: several candidate answers are drafted from the facts;
  - critique: each candidate is scored against the facts; if something is
    missing, one more command is run and the answer re-synthesized;
  - answer: the best-scored candidate wins.

  The model runs locally, so the defaults are generous (12 steps, 3
  candidates, 2 critique rounds) — reasoning only costs time.

  Every decision is constrained to JSON by the engine (grammar-guided
  generation). The model receives the whole catalog of usable commands
  (`denree --commands`) and the manuals of the most relevant ones. Commands
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
  --candidates <n>     candidate answers drafted and judged (1–5, default 3)
  --rounds <n>         critique/refinement rounds (0–4, default 2)
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
  //        ─▶ SYNTHESIZE  draft several candidate answers from the facts
  //        ─▶ CRITIQUE    score them; if something is missing, run the proposed
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

  // The model runs locally, so reasoning costs nothing but time: the defaults
  // are generous, and still bounded so a confused model cannot loop forever.
  const options = {
    model: undefined,
    maxSteps: 12, // decide → act → reflect steps (commands run)
    candidates: 3, // candidate answers drafted, then judged
    rounds: 2, // critique → extra command → re-synthesis rounds
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
      options.candidates = Math.min(5, Math.max(1, next() || 3));
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

  // One stateless model call. Every call gets a condensed state (facts,
  // failures) rather than a growing transcript, so any number of steps fits in
  // a small model's context window (4k tokens for the default model).
  // With a schema, returns the parsed object ({} if unparsable).
  const think = async (system, user, { schema, temperature = 0 } = {}) => {
    llmCalls++;
    const result = await ctx.llm.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      schema,
      temperature,
      stream: false,
      signal: ctx.signal,
    });
    const text = ((result && result.content) || '').trim();
    return schema ? parseJson(text) || {} : text;
  };

  // ------------------------------------------------------------ context

  const catalog = usable
    .map((c) => `- ${c.name}${c.alias.length ? ` (alias: ${c.alias.join(', ')})` : ''}: ${c.desc}`)
    .join('\n');
  const commandByName = (name) =>
    usable.find((c) => c.name === name || c.alias.includes(name)) || null;
  const manualOf = (name) => {
    const command = commandByName(name);
    return command && command.man ? `### ${command.name}\n${manExcerpt(command.man)}` : '';
  };
  // Manuals of the commands most relevant to the goal (lexical mini-RAG).
  const goalManuals = rankManuals(goal, usable, 4);

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
  let commandsRun = 0;

  const factsText = (limit = 2400) =>
    facts.length
      ? facts
          .map((f, i) => `[${i + 1}] $ ${f.command}\n${f.facts}`)
          .join('\n\n')
          .slice(-limit) // keep the most recent evidence if it grows long
      : '(none yet)';
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

  const synthesize = (temperature) =>
    think(
      'You answer the question using the numbered facts gathered from terminal commands. ' +
        'Use ONLY those facts for anything factual or live (IP, weather, dates, files…); ' +
        'never invent, convert or substitute values. If the facts are empty and the ' +
        'question needs live data, say you could not find it. A purely general or ' +
        'conversational question may be answered from general knowledge. Be concise and ' +
        'reply in the SAME language as the question.',
      `Question: ${goal}\n\nFacts:\n${factsText(3000)}\n\nAnswer:`,
      { temperature },
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

  const critique = (draft) =>
    think(
      'You grade an answer from 0 to 10: is it fully supported by the facts, complete, ' +
        'and does it answer the question? Deduct heavily for any value not present in the ' +
        'facts. If information is missing, describe it in "missing" and propose ONE ' +
        'command that would provide it in "command" (else "").\n' +
        TERMINAL_RULES + '\n\nAvailable commands:\n' + catalog,
      `Question: ${goal}\n\nFacts:\n${factsText()}\n\nAnswer to grade:\n${draft}`,
      { schema: CRITIQUE_SCHEMA },
    );

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
    const reflection = await think(
      'You check a command output for a goal. Extract the facts relevant to the goal ' +
        'literally (numbers, names, dates) — never invent or convert. If the output is an ' +
        'error, empty or off-topic, set useful=false and explain the problem in one short ' +
        'sentence (e.g. the correct syntax from the manual). Set goal_answered=true only ' +
        'if all the facts gathered so far fully answer the goal.\n\n' +
        manualOf(result.name),
      `Goal: ${goal}\n\nFacts so far:\n${factsText(1200)}\n\n` +
        `Command: ${result.command}\nOutput:\n${result.observation}`,
      { schema: REFLECT_SCHEMA },
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
    if (goalManuals.length) {
      addNode(root, '📚', `manuals: ${goalManuals.map((c) => c.name).join(', ')}`, 'info');
    }
    const manualContext = goalManuals.length
      ? 'Reference manuals (exact syntax and flags):\n\n' +
        goalManuals.map((c) => manualOf(c.name)).join('\n\n')
      : '';

    // PLAN: a first decomposition, used as a hint by every later decision —
    // not a fixed script, so the agent can adapt to what it discovers.
    const plan = await think(
      'You are Denree, an agent operating a Unix-like terminal in the user\'s browser. ' +
        'Split the goal into the short sub-questions needed to answer it, in order, and ' +
        'give for each the command most likely to answer it ("" if no command is needed). ' +
        'A later step may depend on an earlier result: write it as a question, the ' +
        'command will be decided when that result is known.\n' +
        TERMINAL_RULES + '\n\nAvailable commands (name: description):\n' + catalog + '\n\n' +
        manualContext,
      `Goal: ${goal}`,
      { schema: PLAN_SCHEMA },
    );
    const hints = (Array.isArray(plan.steps) ? plan.steps : [])
      .filter((s) => s && typeof s.question === 'string')
      .slice(0, 6);
    const planNode = addNode(root, '🧭', 'plan', 'info', (plan.analysis || '').slice(0, 220));
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
    let stuck = 0; // decisions that only repeated an earlier command
    for (let n = 0; n < options.maxSteps && !aborted(); n++) {
      const decision = await think(
        'You are Denree, an agent operating a Unix-like terminal. Decide the NEXT step ' +
          'towards the goal, using the facts gathered so far: action "run" with ONE ' +
          'command (you may reuse values from the facts as arguments), or action ' +
          '"answer" when the facts already answer the goal (or when no command can ' +
          'help). Never repeat a command from the failures without fixing it.\n' +
          TERMINAL_RULES + '\n\nAvailable commands (name: description):\n' + catalog + '\n\n' +
          manualContext,
        `Goal: ${goal}\n\nPlan (a hint):\n${planText}\n\nFacts so far:\n${factsText()}\n\n` +
          `Failures:\n${failuresText()}\n\n` +
          `Commands already run (NEVER run them again): ${[...attempted].join(', ') || '(none)'}\n\n` +
          'Next step:',
        { schema: DECIDE_SCHEMA },
      );
      noteMentions(decision.thought);
      const command = (decision.command || '').trim();
      if (decision.action !== 'run' || !command) {
        addNode(actNode, '■', 'enough to answer', 'info', (decision.thought || '').slice(0, 160));
        settled = true;
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
          break;
        }
        continue;
      }
      if (await step(command, actNode)) {
        settled = true;
        break;
      }
    }
    if (!settled && !aborted()) {
      addNode(actNode, '⌛', `step budget reached (${options.maxSteps})`, 'info');
    }

    // SYNTHESIZE several candidates, CRITIQUE them, keep the best; if the best
    // one misses something, run the command the critique proposes and retry.
    for (let round = 0; round <= options.rounds && !aborted(); round++) {
      const draftsNode = addNode(root, '✎', `synthesis${round ? ` (round ${round + 1})` : ''}`, 'info');
      const scored = [];
      for (let i = 0; i < options.candidates && !aborted(); i++) {
        const draft = await synthesize(i === 0 ? 0 : 0.7);
        if (!draft) continue;
        const review = options.candidates > 1 || options.rounds > 0 ? await critique(draft) : { score: 10 };
        const score = Math.max(0, Math.min(10, Number(review.score) || 0));
        scored.push({ draft, score, review });
        addNode(draftsNode, '◇', `candidate ${i + 1} — score ${score}/10`, score >= 6 ? 'ok' : 'fail', draft.slice(0, 160));
      }
      if (!scored.length) break;
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      answer = best.draft;
      bestScore = best.score;

      const followUp = (best.review.command || '').trim();
      if (best.score >= 8 || round >= options.rounds || !followUp) break;
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
