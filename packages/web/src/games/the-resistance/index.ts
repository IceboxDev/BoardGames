import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

// The Resistance: solo = the Solver (analysis of tabletop games entered by
// hand and of finished online matches), multiplayer = the online game.
export default {
  component: lazy(() => import("./ResistanceGame")),
  extraMode: "singleplayer",
  soloMode: "solver",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./ResistanceLobbyConfig")),
  replayComponent: lazy(() => import("./components/ResistanceReplay")),
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
