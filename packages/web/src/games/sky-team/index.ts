import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./SkyTeam")),
  mode: "remote",
  soloLabel: "Solo vs Co-pilot AI",
  hasMatchHistory: true,
  // Button shown now; the co-op AI tournament (which strategy wins more) is
  // coming later, so there are no `tournamentStrategies` yet — the tournament
  // route renders a "coming soon" placeholder until they're added.
  hasTournament: true,
  // Stable scenario for the mp lobby. The lobby route reads this as
  // the initial config when the host clicks Start; no `lobbyConfigComponent`
  // because there's nothing for the user to pick.
  defaultMpConfig: { scenarioId: "yul-montreal" },
} satisfies PlayableModule;
