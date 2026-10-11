import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Connect4")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./Connect4LobbyConfig")),
  replayComponent: lazy(() => import("./components/GameReplay")),
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
