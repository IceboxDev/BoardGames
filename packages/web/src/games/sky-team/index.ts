import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "sky-team",
  bggId: 373106,
  accentHex: accent.hex,
  component: lazy(() => import("./SkyTeam")),
  mode: "remote",
  soloLabel: "Solo vs Co-pilot AI",
  hasMatchHistory: false,
  // Stable scenario for the mp lobby. The lobby route reads this as
  // the initial config when the host clicks Start; no `lobbyConfigComponent`
  // because there's nothing for the user to pick.
  defaultMpConfig: { scenarioId: "yul-montreal" },
} satisfies GameModule;
