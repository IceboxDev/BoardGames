import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./TheHunger")),
  mode: "remote",
  soloLabel: "Solo vs Vampires",
  tournamentResults: () => import("./tournament-results.generated"),
  lobbyConfigComponent: lazy(() => import("./HungerLobbyConfig")),
} satisfies PlayableModule;
