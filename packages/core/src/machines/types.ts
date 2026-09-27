import type { AnyActorLogic, EventFromLogic, SnapshotFrom } from "xstate";
import type { ActionValidation } from "./action-validation";
import type { GameManifest } from "./manifest";
import type { GameOutcome } from "./outcome";
import type { StartSeat } from "./seats";

/** Everything the server decides before a game starts. */
export interface StartInput<TConfig> {
  /** Checked against the manifest (`seatingProblem`) before `buildStart` runs. */
  readonly seats: readonly StartSeat[];
  /** Parsed by `manifest.config` from the client's untrusted options. */
  readonly config: TConfig;
  /** Chosen by the server; the game seeds every random step from it. */
  readonly seed: number;
}

/**
 * The contract every server-run game implements. The session manager drives
 * any game through it without knowing which game it is.
 */
export interface GameMachineSpec<
  TMachine extends AnyActorLogic,
  TPlayerView,
  TLegalAction,
  TResult,
  TConfig = unknown,
> {
  machine: TMachine;
  /** The game's static description — the same object the browser imports. */
  manifest: GameManifest<TConfig>;

  /**
   * The START event for a seating the server has already validated. This is
   * the only way a game starts: START never comes from a client, so nothing
   * the client sends can override a seat, a strategy or the seed.
   */
  buildStart(input: StartInput<TConfig>): EventFromLogic<TMachine>;

  getPlayerView(snapshot: SnapshotFrom<TMachine>, player: number): TPlayerView;
  getLegalActions(snapshot: SnapshotFrom<TMachine>, player: number): TLegalAction[];
  getActivePlayer(snapshot: SnapshotFrom<TMachine>): number;
  /** The game's own result, for its game-over screen. */
  getResult(snapshot: SnapshotFrom<TMachine>): TResult | null;
  isGameOver(snapshot: SnapshotFrom<TMachine>): boolean;

  /**
   * How the game ended, in the shape every game shares (see `outcome.ts`) —
   * what match history, ratings and the replay store read. `null` until the
   * game is over.
   */
  getOutcome(snapshot: SnapshotFrom<TMachine>): GameOutcome | null;

  /**
   * The record a replay viewer reads, saved with the outcome when the game
   * ends. Include a `formatVersion` so a viewer can tell old logs apart.
   * `null` until the game is over.
   */
  getReplayLog(snapshot: SnapshotFrom<TMachine>): unknown | null;

  /**
   * Turn an UNTRUSTED client payload into a machine event, or reject it.
   *
   * Required — this is the only thing standing between a hostile WebSocket
   * frame and the game engine, so a new game cannot silently opt out. Build
   * validators with the helpers in `./action-validation.ts`.
   *
   * `player` is the authenticated seat resolved by the server. Any seat field
   * in the returned event MUST be derived from it, never from `raw`.
   */
  validateAction(
    snapshot: SnapshotFrom<TMachine>,
    player: number,
    raw: unknown,
  ): ActionValidation<EventFromLogic<TMachine>>;
}

/** A spec with its type parameters erased — how the server's registry holds them. */
export type AnyGameMachineSpec = GameMachineSpec<AnyActorLogic, unknown, unknown, unknown, unknown>;
