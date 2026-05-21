import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  slug: "set",
  bggId: 1198,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./SetGame")),
  mode: "remote",
  soloLabel: "Trainer",
  hasMatchHistory: true,
  rulesUrl,
  // Custom dual-tab (Trainer + PvP) match-history view — generic
  // `<MatchHistory>` only knows about server-stored matches; trainer
  // runs live in localStorage and need their own table.
  matchHistoryComponent: lazy(() => import("./components/SetMatchHistory")),
} satisfies GameModule;
