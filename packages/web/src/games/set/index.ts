import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
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
} satisfies PlayableModule;
