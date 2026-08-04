import type { AnyActorLogic, EventFromLogic, SnapshotFrom } from "xstate";
import type { ActionValidation } from "./action-validation";

export interface GameMachineSpec<
  TMachine extends AnyActorLogic,
  TPlayerView,
  TLegalAction,
  TResult,
> {
  machine: TMachine;
  getPlayerView(snapshot: SnapshotFrom<TMachine>, player: number): TPlayerView;
  getLegalActions(snapshot: SnapshotFrom<TMachine>, player: number): TLegalAction[];
  getActivePlayer(snapshot: SnapshotFrom<TMachine>): number;
  getResult(snapshot: SnapshotFrom<TMachine>): TResult | null;
  isGameOver(snapshot: SnapshotFrom<TMachine>): boolean;
  getReplayLog?(snapshot: SnapshotFrom<TMachine>): unknown | null;

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
