import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

// Solo = the Storyteller companion: a phone Grimoire for a game played at a
// real table (`companion/`). Multiplayer = the fully online game: one
// Storyteller and 5–20 players on their own screens, run by the server
// (`core/.../machine.ts`, UI in `online/`). Singleplayer = that same online
// game alone, every other seat a stand-in bot (`solo/bots`).
export default {
  component: lazy(() => import("./ClocktowerGame")),
  extraMode: "singleplayer",
  extraModePath: "solo/bots",
  soloMode: "companion",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./BotcLobbyConfig")),
  replayComponent: lazy(() => import("./online/BotcReplay")),
  matchHistoryComponent: lazy(() => import("./ClocktowerMatchHistory")),
} satisfies PlayableModule;
