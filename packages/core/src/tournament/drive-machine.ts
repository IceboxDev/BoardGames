/**
 * Play one all-AI game through the game's own machine — the code the server's
 * session manager runs — for games whose AI loop lives in the machine (rolls,
 * automated steps, injected agents) rather than in a pure engine a simulator
 * can call directly. Pass a machine with its pacing delays provided as 0.
 */

import { type AnyActorLogic, createActor, type EventFromLogic, type SnapshotFrom } from "xstate";
import type { GameOutcome } from "../machines/outcome";
import type { GameMachineSpec } from "../machines/types";

export interface DriveOptions<TConfig> {
  /** `strategies[seat]` — every seat is an AI. */
  readonly strategies: readonly string[];
  readonly seed: number;
  readonly config: TConfig;
  /** Wall-clock cap for the whole game; the game rejects past it. */
  readonly timeoutMs: number;
}

export interface DriveHooks<TMachine extends AnyActorLogic> {
  /** Adjust the START the spec built — e.g. Decrypto's pacing `beats`, which travel in it. */
  readonly start?: (event: EventFromLogic<TMachine>) => EventFromLogic<TMachine>;
  /** Ends the game early with the signal's reason — an agent failure the machine would retry. */
  readonly signal?: AbortSignal;
}

export function playMachineToEnd<TMachine extends AnyActorLogic, TConfig>(
  spec: GameMachineSpec<TMachine, unknown, unknown, unknown, TConfig>,
  machine: TMachine,
  { strategies, seed, config, timeoutMs }: DriveOptions<TConfig>,
  hooks: DriveHooks<TMachine> = {},
): Promise<GameOutcome> {
  return new Promise((resolve, reject) => {
    const actor = createActor(machine);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      actor.stop();
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`game did not finish in ${timeoutMs} ms`))),
      timeoutMs,
    );
    const check = (snapshot: SnapshotFrom<TMachine>) => {
      if (!spec.isGameOver(snapshot)) return;
      const outcome = spec.getOutcome(snapshot);
      finish(() =>
        outcome ? resolve(outcome) : reject(new Error("game over without an outcome")),
      );
    };
    hooks.signal?.addEventListener("abort", () =>
      finish(() => reject(toError(hooks.signal?.reason))),
    );
    actor.subscribe({
      next: check,
      error: (err) => finish(() => reject(toError(err))),
    });
    actor.start();
    const start = spec.buildStart({
      seats: strategies.map((strategy) => ({ kind: "ai", strategy })),
      config,
      seed,
    });
    actor.send(hooks.start ? hooks.start(start) : start);
    check(actor.getSnapshot());
  });
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
