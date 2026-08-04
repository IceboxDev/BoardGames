/**
 * Last-resort process containment.
 *
 * This server runs every live game in ONE process, so a single uncaught
 * exception evicts every player on the box. Node's default for both
 * `uncaughtException` and (since v15) `unhandledRejection` is to print and
 * exit — which is exactly that worst case.
 *
 * Policy:
 *   - An isolated fault is logged and SURVIVED. Every known throw path is
 *     contained closer to its source (action validation → `safeApply` →
 *     per-session error observer), so reaching here means a bug, and dropping
 *     everyone's game because one async tail misbehaved is the worse outcome.
 *   - A BURST of faults means the process really is in a bad state — the case
 *     Node's "undefined state" warning is about. Then we hand control back to
 *     the supervisor (Railway restarts on failure) rather than limping on.
 *
 * The counter is what makes surviving defensible: without it "never exit" is
 * just ignoring the warning.
 */

export interface ProcessGuardOptions {
  /**
   * Invoked when the fault rate says the process should be replaced. Expected
   * to drain connections and exit non-zero.
   */
  onFatal: (reason: string) => void;
  /** Faults tolerated inside `windowMs` before `onFatal` fires. */
  maxFaultsPerWindow?: number;
  windowMs?: number;
  /** Injected in tests. */
  now?: () => number;
}

export interface ProcessGuards {
  /** Number of faults still inside the current window. Exposed for tests. */
  faultCount(): number;
  /** Remove the listeners this installed. */
  uninstall(): void;
}

const DEFAULT_MAX_FAULTS = 10;
const DEFAULT_WINDOW_MS = 60_000;

export function installProcessGuards(options: ProcessGuardOptions): ProcessGuards {
  const maxFaults = options.maxFaultsPerWindow ?? DEFAULT_MAX_FAULTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;

  let faults: number[] = [];
  let fatal = false;

  const record = (kind: string, error: unknown): void => {
    console.error(`[process] ${kind}:`, error);

    const cutoff = now() - windowMs;
    faults = faults.filter((at) => at > cutoff);
    faults.push(now());

    if (faults.length > maxFaults && !fatal) {
      fatal = true;
      options.onFatal(
        `${faults.length} unhandled faults within ${Math.round(windowMs / 1000)}s — restarting`,
      );
    }
  };

  const onUncaught = (error: unknown): void => record("uncaughtException", error);
  const onRejection = (reason: unknown): void => record("unhandledRejection", reason);

  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);

  return {
    faultCount: () => faults.length,
    uninstall: () => {
      process.off("uncaughtException", onUncaught);
      process.off("unhandledRejection", onRejection);
    },
  };
}
