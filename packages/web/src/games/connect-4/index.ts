import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Connect4")),
  mode: "remote",
  tournamentResults: () => import("./tournament-results.generated"),
  lobbyConfigComponent: lazy(() => import("./Connect4LobbyConfig")),
  replayComponent: lazy(() => import("./components/GameReplay")),
} satisfies PlayableModule;
