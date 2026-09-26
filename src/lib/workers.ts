/* ------------------------------------------------------------------------- *
 * Web Worker registry.
 *
 * Commands spawn workers through `ctx.worker()` (e.g. `hashcat`) instead of
 * `new Worker()`, so the shell knows what is running: `top` lists them with
 * their state, age and message traffic. A worker leaves the registry a short
 * while after it terminates, so `top` can still show it as finished.
 * ------------------------------------------------------------------------- */

export type WorkerState = 'running' | 'terminated' | 'error';

/** A snapshot of one tracked worker (what `top` renders). */
export interface WorkerInfo {
  id: number;
  /** Human label given by the spawning command (e.g. `hashcat#3`). */
  name: string;
  state: WorkerState;
  /** `performance.now()` at spawn / at termination. */
  started: number;
  ended?: number;
  /** Messages received from the worker. */
  messages: number;
  /** Last error message, if the worker failed. */
  error?: string;
}

/** How long a finished worker stays listed (ms). */
const LINGER_MS = 10_000;

let nextId = 1;
const registry = new Map<number, WorkerInfo>();

/** Drops finished workers that have lingered long enough. */
function prune(now: number): void {
  for (const [id, w] of registry) {
    if (w.ended !== undefined && now - w.ended > LINGER_MS) registry.delete(id);
  }
}

/**
 * Creates a tracked Web Worker. It behaves exactly like `new Worker(url, opts)`;
 * `terminate()` is wrapped so the registry records the end of its life.
 */
export function spawnWorker(url: string | URL, name = 'worker', opts?: WorkerOptions): Worker {
  const worker = new Worker(url, opts);
  const info: WorkerInfo = {
    id: nextId++,
    name,
    state: 'running',
    started: performance.now(),
    messages: 0,
  };
  registry.set(info.id, info);

  worker.addEventListener('message', () => {
    info.messages += 1;
  });
  worker.addEventListener('error', (e) => {
    info.state = 'error';
    info.error = e.message || 'error';
    info.ended ??= performance.now();
  });
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    if (info.state === 'running') info.state = 'terminated';
    info.ended ??= performance.now();
  };
  return worker;
}

/** Snapshot of the tracked workers, oldest first. */
export function listWorkers(): WorkerInfo[] {
  prune(performance.now());
  return [...registry.values()].map((w) => ({ ...w }));
}
