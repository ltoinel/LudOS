---
name: bc
desc: basic calculator — e.g. bc "2 + 2 * 3", bc "sqrt(2)"
alias: calc
demo: bc "2^10 + sqrt(144) * pi"
seo_title: Scientific calculator online — bc
man: |
  # BC(1)

  ## NAME
  bc — evaluate arithmetic expressions

  ## SYNOPSIS
  bc <expression>
  bc
  echo "<expression>" | bc

  ## DESCRIPTION
  A safe arithmetic calculator. Pass an expression as the argument, pipe it in,
  or run `bc` with no argument for an interactive prompt (type `quit` to leave).

  Supported: + - * / % and ^ (power, also **), parentheses, unary minus, and
  decimal/scientific numbers (e.g. 1.5e3). Functions: sqrt, abs, round, floor,
  ceil, ln, log (base 10), exp, sin, cos, tan. Constants: pi, e. Separate
  several expressions with `;` or newlines.

  The expression is parsed and evaluated by a small built-in parser — never by
  eval() — so untrusted input cannot run code.

  ## USE CASES
  - quick arithmetic without leaving the terminal: bc "19.99 * 3 * 1.2";
  - scientific functions and constants: bc "sin(pi / 6)", bc "ln(e^2)";
  - pipe calculations in: echo "2^32" | bc.

  ## NOTES
  Numbers are double-precision floats, as in JavaScript: results carry about
  15 significant digits, unlike the arbitrary precision of the Unix bc.

  ## EXAMPLES
  bc "2 + 2 * 3"
  bc "(1 + 2) ^ 10"
  bc "sqrt(2)"
  bc "sin(pi / 2)"
  echo "21 * 2" | bc

  ## SEE ALSO
  cal, date, wc
js: |
  // bc — a safe arithmetic evaluator. The user's expression is tokenized and run
  // through a recursive-descent parser (NOT eval), so it cannot execute code.
  // Works from an argument, a pipe (ctx.stdin), or interactively (REPL).
  const E = ctx.escape;

  const FUNCTIONS = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    ln: Math.log,
    log: (x) => Math.log(x) / Math.LN10,
    exp: Math.exp,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
  };
  const CONSTANTS = { pi: Math.PI, e: Math.E };

  // Evaluate one expression. Throws on a syntax error.
  const evalExpr = (src) => {
    const TOKEN = /[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|\*\*|[A-Za-z_][A-Za-z0-9_]*|[-+*/%^()]/g;
    const tokens = src.match(TOKEN) || [];
    // Whatever is neither a token nor a blank is an error — silently dropping
    // it would print a wrong result (`5!` must not answer 5).
    const stray = src.replace(TOKEN, '').replace(/\s+/g, '');
    if (stray) throw new Error('illegal character "' + Array.from(stray)[0] + '"');
    let position = 0;
    const peek = () => tokens[position];
    const next = () => tokens[position++];

    // Grammar, lowest precedence first: expr (+ -) > term (* / %) > factor
    // (^ **) > unary (+ -) > atom (number, constant, function call, parens).
    const parseExpr = () => {
      let value = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const operator = next();
        const right = parseTerm();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    };
    const parseTerm = () => {
      let value = parseFactor();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const operator = next();
        const right = parseFactor();
        if (operator === '*') value = value * right;
        else if (operator === '/') value = value / right;
        else value = value % right;
      }
      return value;
    };
    const parseFactor = () => {
      const base = parseUnary();
      if (peek() === '^' || peek() === '**') {
        next();
        // Recursing on the exponent makes the power right-associative:
        // 2^3^2 is 2^(3^2).
        return Math.pow(base, parseFactor());
      }
      return base;
    };
    const parseUnary = () => {
      if (peek() === '+') {
        next();
        return parseUnary();
      }
      if (peek() === '-') {
        next();
        return -parseUnary();
      }
      return parseAtom();
    };
    const parseAtom = () => {
      const token = next();
      if (token === undefined) throw new Error('unexpected end of expression');
      if (token === '(') {
        const inner = parseExpr();
        if (next() !== ')') throw new Error('missing )');
        return inner;
      }
      if (/^[0-9]|^\./.test(token)) return parseFloat(token);
      if (/^[A-Za-z_]/.test(token)) {
        const name = token.toLowerCase();
        if (peek() === '(') {
          next();
          const argument = parseExpr();
          if (next() !== ')') throw new Error('missing )');
          if (!FUNCTIONS[name]) throw new Error('unknown function "' + token + '"');
          return FUNCTIONS[name](argument);
        }
        if (name in CONSTANTS) return CONSTANTS[name];
        throw new Error('unknown name "' + token + '"');
      }
      throw new Error('unexpected "' + token + '"');
    };

    const result = parseExpr();
    // Tokens left over after a complete expression (`2 3`, `1)`) are an error.
    if (position < tokens.length) throw new Error('unexpected "' + tokens[position] + '"');
    if (typeof result !== 'number' || Number.isNaN(result)) throw new Error('not a number');
    return result;
  };

  // Pretty-print: round off binary-float fuzz, drop trailing zeros.
  const DECIMAL_SCALE = 1e10; // keep 10 decimal places
  const formatNumber = (n) => {
    if (!isFinite(n)) return String(n);
    return (Math.round(n * DECIMAL_SCALE) / DECIMAL_SCALE).toString();
  };

  // Evaluate one expression and print its result (or the error).
  const evalAndPrint = (expression) => {
    try {
      ctx.line(formatNumber(evalExpr(expression)));
    } catch (e) {
      ctx.error('bc: ' + (e.message || 'syntax error'));
    }
  };

  // Expression from the argument or a pipe → evaluate (supports `;`/newline lists).
  const input = ctx.args.join(' ').trim() || (ctx.stdin || '').trim();
  if (input) {
    input
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(evalAndPrint);
    return;
  }

  // Interactive prompt (REPL).
  ctx.line('bc — basic calculator. Type an expression, or "quit" to exit.');
  while (true) {
    if (ctx.signal && ctx.signal.aborted) break;
    const raw = await ctx.ask('bc›');
    const expression = (raw || '').trim();
    if (!expression) continue;
    if (/^(quit|exit|q)$/i.test(expression)) break;
    ctx.append(
      '<div class="ln"><span class="prompt">bc›</span> <span class="cmd">' +
        E(expression) +
        '</span></div>',
    );
    evalAndPrint(expression);
  }
---
