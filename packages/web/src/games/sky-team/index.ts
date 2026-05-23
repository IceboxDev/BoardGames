import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./SkyTeam")),
  mode: "remote",
  soloLabel: "Solo vs Co-pilot AI",
  hasMatchHistory: false,
  // Stable scenario for the mp lobby. The lobby route reads this as
  // the initial config when the host clicks Start; no `lobbyConfigComponent`
  // because there's nothing for the user to pick.
  defaultMpConfig: { scenarioId: "yul-montreal" },
} satisfies PlayableModule;
