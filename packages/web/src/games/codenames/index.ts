import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Codenames")),
  mode: "remote",
  soloLabel: "Solo with AI agents",
  multiplayerDescription:
    "A room for 4–8 — two teams, each with a spymaster. Empty seats can be filled with AI agents.",
  lobbyConfigComponent: lazy(() => import("./CodenamesLobbyConfig")),
  replayComponent: lazy(() => import("./components/CodenamesReplay")),
} satisfies PlayableModule;
