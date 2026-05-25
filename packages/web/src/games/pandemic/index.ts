import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/img/background.png";
import rulesUrl from "./assets/img/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./Pandemic")),
  mode: "remote",
  soloLabel: "Solo",
  rulesUrl,
  hasMatchHistory: true,
  // Button shown now; the co-op AI tournament (which strategy wins more) is
  // coming later, so there are no `tournamentStrategies` yet — the tournament
  // route renders a "coming soon" placeholder until they're added.
  hasTournament: true,
  lobbyConfigComponent: lazy(() => import("./PandemicLobbyConfig")),
  defaultMpConfig: { difficulty: 4 },
} satisfies PlayableModule;
