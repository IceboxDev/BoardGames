import type { GameAction, MetaAction } from "@boardgames/core/games/pandemic/types";

type DispatchAction = GameAction | MetaAction;

export type GameDispatch = (action: DispatchAction) => void;
