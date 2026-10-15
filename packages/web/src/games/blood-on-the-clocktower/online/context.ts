import {
  type PlayerAction,
  type StorytellerAction,
  StorytellerActionSchema,
  type StorytellerMove,
} from "@boardgames/core/games/blood-on-the-clocktower/online/actions";
import type {
  BotcView,
  PlayerView,
  StorytellerView,
} from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { createContext, useContext } from "react";
import type { GameOverAction } from "../../../components/game-over";

/** A Storyteller action without its `rev` — the sender stamps the one on screen. */
export type StAction = StorytellerMove;

export interface BotcOnlineApi {
  readonly view: BotcView;
  /** Send one of this seat's own moves. */
  readonly act: (action: PlayerAction) => void;
  /** Send a Storyteller move, stamped with the revision this screen shows. */
  readonly st: (action: StAction) => void;
  /** The server's last refusal ("The Grimoire changed — try again"). */
  readonly error: string | null;
  /** The game-over buttons (Back to Menu, View Replay). */
  readonly endActions: readonly GameOverAction[];
}

export const BotcOnlineContext = createContext<BotcOnlineApi | null>(null);

export function useBotc(): BotcOnlineApi {
  const api = useContext(BotcOnlineContext);
  if (!api) throw new Error("useBotc outside <BotcOnlineContext>");
  return api;
}

/** The Storyteller's API (throws on a player's screen — a wiring bug). */
export function useStoryteller(): BotcOnlineApi & { view: StorytellerView } {
  const api = useBotc();
  const view = api.view;
  if (view.role !== "storyteller") throw new Error("not the Storyteller");
  return { ...api, view };
}

/** A player's API. */
export function usePlayer(): BotcOnlineApi & { view: PlayerView } {
  const api = useBotc();
  const view = api.view;
  if (view.role !== "player") throw new Error("not a player");
  return { ...api, view };
}

/** The wire action: `action` with `rev`, checked against the schema the server parses with. */
export function stamp(action: StAction, rev: number): StorytellerAction {
  return StorytellerActionSchema.parse({ ...action, rev });
}
