import { lazy } from "react";
import type { PlayableModule } from "../types";

// The Resistance: solo = the Solver (analysis of tabletop games entered by
// hand and of finished online matches), multiplayer = the online game.
export default {
  component: lazy(() => import("./ResistanceGame")),
  mode: "remote",
  soloLabel: "Solver",
  multiplayerDescription: "A room for 5–10 — empty seats can be filled with bots.",
  lobbyConfigComponent: lazy(() => import("./ResistanceLobbyConfig")),
  replayComponent: lazy(() => import("./components/ResistanceReplay")),
} satisfies PlayableModule;
