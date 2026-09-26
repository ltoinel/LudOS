/* ------------------------------------------------------------------------- *
 * The `ctx` API handed to every dynamic command (`root/bin/*.md` `js:` block).
 *
 * This is the contract between the shell engine (`terminal.ts`, which builds
 * the object) and the commands (plain JS run through `AsyncFunction`). Keep it
 * in sync with the README's `ctx` reference.
 * ------------------------------------------------------------------------- */

import type { CaptureResult } from './executor';
import type {
  CatalogRecord,
  ChatRequest,
  ChatResult,
  EnsureOptions,
  LlmState,
  Session,
} from './llm';
import type { Theme } from './themes';
import type { WorkerInfo } from './workers';
import type { VfsEntry } from './vfs';

/** Configuration injected via `#shell-cfg`. */
export interface ShellCfg {
  /** Host shown in prompts and the SSH animation. */
  host: string;
  /** User name shown in the prompt as `user@host` (e.g. `guest`). */
  user: string;
  /** Absolute home directory (shown as `~`); the shell starts here. */
  home: string;
  /** `key -> URL` registry used by the `open` command. */
  links: Record<string, string>;
  /** Site release (package.json `version`), shown by the boot banner and `uname`. */
  version?: string;
  /** Identity surfaced by `whoami`, mirrored from `site.config.ts`. */
  profile?: {
    name: string;
    role: string;
    company: string;
    nationality: string;
    knowsAbout: string[];
    url: string;
  };
}

/** A command as listed to other commands (`help`, `man`, completion). */
export interface CommandInfo {
  name: string;
  desc: string;
  alias: string[];
  man: string;
}

/** The central LLM manager as exposed to commands (see `llm.ts`). */
export interface ShellLlm {
  state(): LlmState;
  models(): Promise<string[]>;
  /** WebLLM's prebuilt catalogue, with VRAM / feature requirements. */
  catalog(): Promise<CatalogRecord[]>;
  recommended(): Promise<{ label: string; id: string; gb: number }[]>;
  cacheList(): Promise<string[]>;
  cacheRemove(id: string): Promise<string>;
  cacheRemoveAll(): Promise<number>;
  unload(): Promise<boolean>;
  chat(req: ChatRequest): Promise<ChatResult>;
  interrupt(): void;
  /** Loads a model after an in-terminal consent prompt, with a progress bar. */
  ensure(opts: EnsureOptions): Promise<Session | null>;
}

export interface ShellCtx {
  /** Arguments after the command name (quotes already removed). */
  args: string[];
  /** The command file's markdown body. */
  body: string;
  cfg: ShellCfg;
  /** Text piped in from the previous pipeline stage (`prev | cmd`); '' if none. */
  stdin: string;
  /** Command history (oldest first). */
  history: string[];
  commands: CommandInfo[];
  escape(s: string): string;

  /* ---- virtual filesystem ---- */
  /** Files (sorted) in the current directory. */
  fileList(): string[];
  /** Resolves a name in the current dir: exact, implicit `.md`, or without extension. */
  resolveFile(name: string): string | undefined;
  cwd(): string;
  cwdLabel(): string;
  cd(arg?: string): string | null;
  list(arg?: string): { entries?: VfsEntry[]; error?: string };
  read(arg: string): { content?: string; name?: string; error?: string };
  /** Mutations persisted to localStorage; each returns an error string or null. */
  mkdir(path: string, parents?: boolean): string | null;
  touch(path: string): string | null;
  write(path: string, content: string): string | null;
  rm(path: string, recursive?: boolean, force?: boolean): string | null;

  /* ---- output ---- */
  /** Prints markdown (headings, bullets, inline markup). */
  print(md: string): void;
  /** Prints raw, escaped text preserving whitespace. */
  raw(text: string): void;
  /** Prints one line (inline markup allowed). */
  line(text: string): void;
  /** Prints an error line (stderr: never captured by pipes). */
  error(text: string): void;
  /** Prints a dim system line. */
  sysLine(text: string): void;
  /** Appends already-safe HTML; returns the created element. */
  append(html: string): HTMLElement;
  clear(): void;

  /* ---- timing & interaction ---- */
  sleep(ms: number): Promise<void>;
  /** Typewriter effect into `target`. */
  type(target: HTMLElement, text: string, cps?: number): Promise<void>;
  /** Reads one line interactively (`secret` masks the input). */
  ask(question: string, opts?: { secret?: boolean }): Promise<string>;
  /** Aborted when the user presses Ctrl+C. */
  signal?: AbortSignal;

  /* ---- navigation & windows ---- */
  open(url: string): Window | null;
  /** Opens an in-page iframe window; error string or null. */
  iframe(url: string): string | null;
  theme(name: string): Theme;
  themes: readonly Theme[];
  currentTheme(): Theme;

  /* ---- session ---- */
  su(target?: string): string | null;
  /** Leaves an `su` shell, or closes the window at the top level. */
  exit(): void;
  /** Closes this terminal window unconditionally. */
  close(): void;
  /** Runs another command by name. */
  exec(name: string, args?: string[]): void | Promise<void>;
  /** Runs a full command line headlessly and returns its output. */
  capture(line: string): Promise<CaptureResult>;

  /* ---- background work ---- */
  /** Spawns a Web Worker tracked by the shell (listed by `top`). */
  worker(url: string | URL, name?: string, opts?: WorkerOptions): Worker;
  /** Snapshot of the tracked workers (running and recently finished). */
  workers(): WorkerInfo[];

  llm: ShellLlm;
}
