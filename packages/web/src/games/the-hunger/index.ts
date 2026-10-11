import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./TheHunger")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./HungerLobbyConfig")),
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
