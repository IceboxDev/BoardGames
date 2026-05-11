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
} satisfies GameModule;
