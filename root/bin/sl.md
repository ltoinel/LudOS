---
name: sl
desc: a steam locomotive crosses the terminal — for when you meant ls
agent: no
index: false
demo: sl
man: |
  # SL(6)

  ## NAME
  sl — cure your bad habit of mistyping ls

  ## SYNOPSIS
  sl [-alFe]

  ## DESCRIPTION
  You meant to type ls. Instead, a steam locomotive rolls across the
  terminal from right to left, and you get to watch all of it: like
  the original Unix joke, the train ignores Ctrl+C unless -e is given.

  Options combine freely (sl -alF). In a pipe, or when reduced motion
  is requested, a single still frame is printed instead.

  ## OPTIONS
  -a   an accident seems to happen: the passengers cry for help
  -l   a little train instead of the express
  -F   the train flies, climbing as it crosses
  -e   Ctrl+C is allowed to stop the train

  ## EXAMPLES
  sl
  sl -al
  sl -F
  sl -e

  ## SEE ALSO
  ls, asciiart, fortune, cmatrix, cowsay
js: |
  // ---- options ---------------------------------------------------------
  const KNOWN_FLAGS = 'alFe';
  const flags = new Set();
  for (const arg of ctx.args) {
    const letters = /^-[a-zA-Z]+$/.test(arg) ? arg.slice(1) : '';
    const unknown = [...letters].find((letter) => !KNOWN_FLAGS.includes(letter));
    if (!letters || unknown) {
      ctx.error(`sl: invalid option '${unknown ? `-${unknown}` : arg}' — usage: sl [-alFe]`);
      return;
    }
    for (const letter of letters) flags.add(letter);
  }
  const accident = flags.has('a');
  const little = flags.has('l');
  const flying = flags.has('F');
  const interruptible = flags.has('e');

  // ---- timing ----------------------------------------------------------
  const FRAME_MS = 30; // one column per frame
  const SLOW_TICKS = 4; // smoke and passengers change every few frames
  const FLY_ROWS = 6; // how high a flying train climbs

  // ---- rolling stock ---------------------------------------------------
  // The train faces left (it travels right to left). Every car of a train
  // has the same number of rows; cars are coupled side by side.
  const BS = String.fromCharCode(92); // a backslash, for the raised arms

  /** Pads every row of a drawing to the width of its longest row. */
  const block = (rows) => {
    const width = Math.max(...rows.map((row) => row.length));
    return rows.map((row) => row.padEnd(width));
  };

  /** The express: locomotive, coal tender and two passenger cars. */
  function expressCars(tick) {
    const rods = tick % 2 === 0 ? '=' : '-'; // connecting rods turning
    const slow = Math.floor(tick / SLOW_TICKS);
    const locomotive = block([
      '     ___         ___________',
      '    _| |_   __  |  []   []  |',
      '  _|     |_|  |_|           |',
      ' |  LudOS  EXPRESS          |',
      '/|__________________________|',
      `/_/ (O)${rods}(O)${rods}(O)${rods}(O)   (o)(o)`,
    ]);
    const tender = block([
      '',
      '  . : . : . :',
      ' _____________',
      '|             |',
      '|_____________|',
      '  (o)     (o)',
    ]);
    const passengerCar = (carIndex) => {
      // In an accident, the passengers wave their arms and shout in turns.
      const waving = accident && (slow + carIndex) % 2 === 0;
      const seat = !accident ? '   ' : waving ? `${BS}o/` : ' o ';
      return block([
        waving ? '   Help!  Help!' : '',
        ' ___________________',
        '|  ___   ___   ___  |',
        `| |${seat}| |${seat}| |${seat}| |`,
        '|_|___|_|___|_|___|_|',
        '   (o)         (o)',
      ]);
    };
    return [locomotive, tender, passengerCar(0), passengerCar(1)];
  }

  /** The little train of `-l`: a small engine and two wagons. */
  function littleCars(tick) {
    const slow = Math.floor(tick / SLOW_TICKS);
    const wheel = tick % 2 === 0 ? 'o-o' : 'o=o';
    const engine = block(['   _   ___', ' _| |_|   |', '|_________|', ` ${wheel}   ${wheel}`]);
    const wagon = (wagonIndex) => {
      const shouting = accident && (slow + wagonIndex) % 2 === 0;
      return block([shouting ? ' Help!' : '', ' _______', '|_______|', ` ${wheel} ${wheel}`]);
    };
    return [engine, wagon(0), wagon(1)];
  }

  /** Smoke trailing behind the chimney, in two alternating shapes. */
  function smokeRows(tick) {
    const phase = Math.floor(tick / SLOW_TICKS) % 2;
    if (little) return [phase === 0 ? '    o  O' : '   o    O'];
    return phase === 0
      ? ['        (  )   (   )    o', '     ( )     ()       o', '    ()']
      : ['          ( )    (  )     o', '      (  )    ( )      o', '     o'];
  }

  /** The whole train for one animation tick, as rows of equal width. */
  function trainRows(tick) {
    const cars = little ? littleCars(tick) : expressCars(tick);
    const height = cars[0].length;
    const body = [];
    for (let row = 0; row < height; row++) {
      // Couplers link the cars at chassis level (the row above the wheels).
      const coupler = row === height - 2 ? '=' : ' ';
      body.push(cars.map((car) => car[row]).join(coupler));
    }
    return block([...smokeRows(tick), ...body]);
  }

  /**
   * One frame as text: the train drawn with its left edge at column `x`
   * (negative once it leaves the screen), clipped to `cols` columns. A
   * flying train sits `rise` rows higher; the frame height stays constant.
   */
  function frame(x, tick, cols, rise) {
    const lines = trainRows(tick).map((row) => {
      const visible = ' '.repeat(Math.max(0, x)) + row.slice(Math.max(0, -x));
      return visible.slice(0, cols);
    });
    if (!flying) return lines.join('\n');
    const blank = (count) => new Array(count).fill('');
    return [...blank(FLY_ROWS - rise), ...lines, ...blank(rise)].join('\n');
  }

  // ---- display ---------------------------------------------------------
  const trainWidth = trainRows(0)[0].length;
  // A still frame first: it is all a pipe (or a reader who asked for reduced
  // motion) gets, and it reserves the screen area the animation runs in.
  const still = frame(2, 0, trainWidth + 4, 0)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+/, ''); // a flying train's still frame needs no empty sky
  const view = ctx.append(
    `<div class="ln out" style="white-space:pre;overflow:hidden">${ctx.escape(still)}</div>`,
  );
  // Captured output (a pipe, a redirection) never reaches the page: stop here.
  if (!view.isConnected) return;
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  // Measure how many characters fit on one line of this terminal window.
  const screen = view.firstElementChild;
  const PROBE_CHARS = 20;
  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(PROBE_CHARS);
  screen.textContent = '';
  screen.appendChild(probe);
  const charWidth = probe.getBoundingClientRect().width / PROBE_CHARS;
  const cols = charWidth > 0 ? Math.max(20, Math.floor(screen.clientWidth / charWidth)) : 80;

  // ---- the crossing ----------------------------------------------------
  const distance = cols + trainWidth;
  let tick = 0;
  for (let x = cols; x > -trainWidth; x--) {
    // The window was closed mid-journey: nothing left to draw on.
    if (!view.isConnected) return;
    // True to the original, only `-e` lets Ctrl+C stop the train.
    if (interruptible && ctx.signal && ctx.signal.aborted) break;
    const progress = (cols - x) / distance;
    screen.textContent = frame(x, tick, cols, Math.floor(progress * FLY_ROWS));
    tick++;
    await ctx.sleep(FRAME_MS);
  }
  // The train has left: clear its track, like the original clears the screen.
  view.remove();
---
