import type { AnyActorLogic, SnapshotFrom } from "xstate";

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
}
