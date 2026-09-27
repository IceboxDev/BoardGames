/**
 * A game's static description — everything the lobby, the setup screens, the
 * server's seat checks and the local tournament runner need, and nothing that
 * pulls in the engine or the AI. It is safe to import from the browser.
 *
 * Every server-run game has exactly one, at `games/<slug>/manifest.ts`, listed
 * in `games/manifests.ts`. The game's `GameMachineSpec` carries the same object
 * (`spec.manifest`), so the server and the browser read one description.
 */

import type { z } from "zod";
import type { StartSeat } from "./seats";

export type { StartSeat } from "./seats";

/** Difficulty tiers the setup screens colour AI options by, easiest first. */
export const DIFFICULTY_TIERS = ["Easy", "Medium", "Hard", "Hard+", "Expert", "Master"] as const;
export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

export interface StrategyInfo {
  /** Stable id — recorded in replays, room slots and tournament results. */
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly difficulty: DifficultyTier;
  /** Table sizes this AI can play; absent = every size the game supports. */
  readonly seats?: { readonly min?: number; readonly max?: number };
}

export interface GameManifest<TConfig = unknown> {
  readonly slug: string;
  /** Seats at the table — humans and AI together. */
  readonly seats: { readonly min: number; readonly max: number };
  /** Role name per seat, where the seat index carries meaning (Sky Team, Decrypto). */
  readonly seatNames?: readonly string[];
  /**
   * The AI opponents, easiest first. Empty for games without AI; then every
   * seat must be human.
   */
  readonly strategies: readonly StrategyInfo[];
  /** Preselected AI; must be one of `strategies`. */
  readonly defaultStrategy?: string;
  /**
   * Game options chosen in the lobby or on the solo setup screen. The server
   * parses the client's untrusted config with this before anything else sees
   * it, and `{}` must parse to the defaults.
   */
  readonly config: z.ZodType<TConfig>;
  /** A game-specific seating rule on top of `seats` — a reason, or `null` when fine. */
  readonly validateSeats?: (seats: readonly StartSeat[]) => string | null;
}

/** Identity helper that keeps the config type attached to the manifest. */
export function defineManifest<TConfig>(manifest: GameManifest<TConfig>): GameManifest<TConfig> {
  return manifest;
}

/**
 * A game's options from a value that may be partial or stale (a lobby's
 * in-progress state): the parsed value, or the defaults when it does not fit.
 * The server parses strictly instead (`prepareStart`), naming the bad field.
 */
export function configOrDefaults<TConfig>(manifest: GameManifest<TConfig>, raw: unknown): TConfig {
  const parsed = manifest.config.safeParse(raw ?? {});
  return parsed.success ? parsed.data : manifest.config.parse({});
}

/** The AIs on offer at a table of `seatCount`. */
export function strategiesFor(manifest: GameManifest, seatCount: number): StrategyInfo[] {
  return manifest.strategies.filter(
    (s) =>
      (s.seats?.min ?? 0) <= seatCount && seatCount <= (s.seats?.max ?? Number.POSITIVE_INFINITY),
  );
}

/** The AI a new seat gets at a table of `seatCount`, or `null` when the game has none. */
export function defaultStrategyFor(manifest: GameManifest, seatCount: number): string | null {
  const offered = strategiesFor(manifest, seatCount);
  const preferred = offered.find((s) => s.id === manifest.defaultStrategy);
  return (preferred ?? offered[0])?.id ?? null;
}

/**
 * Check a proposed seating against the manifest. Returns a player-facing
 * reason, or `null` when the seating can start.
 */
export function seatingProblem(manifest: GameManifest, seats: readonly StartSeat[]): string | null {
  const { min, max } = manifest.seats;
  if (seats.length < min) return `Needs at least ${min} players`;
  if (seats.length > max) return `At most ${max} players`;
  if (!seats.some((s) => s.kind === "human")) return "At least one seat must be a person";
  const offered = new Set(strategiesFor(manifest, seats.length).map((s) => s.id));
  for (const seat of seats) {
    if (seat.kind !== "ai") continue;
    if (offered.size === 0) return "This game has no AI players";
    if (!offered.has(seat.strategy))
      return `Unknown AI "${seat.strategy}" at ${seats.length} players`;
  }
  return manifest.validateSeats?.(seats) ?? null;
}
