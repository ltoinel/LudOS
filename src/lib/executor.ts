/* ------------------------------------------------------------------------- *
 * Pipeline executor for the terminal shell.
 *
 * Runs a parsed command line — stages connected by `|`, an optional trailing
 * `>` / `>>` redirection — on top of a small host interface, so the stdout
 * capture / stdin plumbing can be unit-tested without a DOM. `terminal.ts`
 * supplies the host (command dispatch, printers, VFS writes); its printers
 * consult `state` to decide whether to paint or to capture.
 * ------------------------------------------------------------------------- */

import { parseCommandLine, type Redirect, type Stage } from './shell-parse';

/** Output routing for the line being run — read by the host's printers. */
export interface OutputState {
  /**
   * When set, stdout is captured into this buffer instead of painted — for
   * `>` / `>>` and for every non-final pipeline stage (its stdout becomes the
   * next stage's stdin).
   */
  capture: string[] | null;
  /** When set, stderr is recorded here instead of painted (headless runs). */
  errSink: string[] | null;
  /** Piped input handed to the running stage (`ctx.stdin`); '' if none. */
  stdin: string;
}

export interface ExecutorHost {
  /** Runs one stage; its output goes through printers that honor `state`. */
  runStage(stage: Stage): Promise<void>;
  /** Reads a file (for `>>`); null when it doesn't exist or can't be read. */
  readFile(path: string): string | null;
  /** Writes a file (for `>` / `>>`); returns an error message or null. */
  writeFile(path: string, content: string): string | null;
  /** Prints an error line (the host routes it to `state.errSink` if set). */
  printErr(text: string): void;
}

/** The captured result of a headless run. */
export interface CaptureResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function createExecutor(host: ExecutorHost) {
  const state: OutputState = { capture: null, errSink: null, stdin: '' };

  /** Persists a redirection's captured output (`>` truncates, `>>` appends). */
  function writeRedirect(redirect: Redirect, out: string[]): void {
    let content = out.join('\n');
    if (content && !content.endsWith('\n')) content += '\n';
    if (redirect.append) content = (host.readFile(redirect.path) ?? '') + content;
    const err = host.writeFile(redirect.path, content);
    if (err) host.printErr(err);
  }

  /**
   * Runs the stages in order, piping each captured stdout into the next
   * stage's stdin. The final stage is captured too when `captureLast` is set
   * or its output is redirected. Returns the final stage's captured stdout.
   */
  async function runPipeline(
    stages: Stage[],
    redirect: Redirect | null,
    captureLast: boolean,
  ): Promise<string[] | null> {
    let last: string[] | null = null;
    state.stdin = ''; // the first stage has no stdin
    for (let i = 0; i < stages.length; i++) {
      const isLast = i === stages.length - 1;
      const buf = !isLast || captureLast || redirect ? [] : null;
      state.capture = buf;
      try {
        await host.runStage(stages[i]);
      } finally {
        state.capture = null;
      }
      last = buf;
      state.stdin = buf ? buf.join('\n') : '';
    }
    if (redirect && last) writeRedirect(redirect, last);
    return last;
  }

  return {
    state,

    /** Runs a typed line interactively: the final stage paints to the screen. */
    async execute(line: string): Promise<void> {
      const { stages, redirect, error } = parseCommandLine(line);
      if (error) {
        host.printErr(error);
        return;
      }
      try {
        await runPipeline(stages, redirect, false);
      } finally {
        state.capture = null;
        state.stdin = '';
      }
    },

    /**
     * Runs a line headlessly: every stage is captured (stderr included) and the
     * final stdout is returned as text. Re-entrant — a command may call it
     * while itself being piped or captured; the outer routing is restored.
     */
    async capture(raw: string): Promise<CaptureResult> {
      const line = (raw || '').trim();
      if (!line) return { ok: true, stdout: '', stderr: '' };
      const { stages, redirect, error } = parseCommandLine(line);
      if (error) return { ok: false, stdout: '', stderr: error };

      const outer = { ...state };
      const errBuf: string[] = [];
      state.errSink = errBuf;
      let last: string[] | null;
      try {
        last = await runPipeline(stages, redirect, true);
      } finally {
        Object.assign(state, outer);
      }
      const stderr = errBuf.join('\n');
      // A redirected line's stdout went to the file, so report it as empty.
      const stdout = redirect || !last ? '' : last.join('\n');
      return { ok: !stderr, stdout, stderr };
    },
  };
}

export type Executor = ReturnType<typeof createExecutor>;
