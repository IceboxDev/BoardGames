import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./SetGame")),
  soloMode: "trainer",
  rulesUrl,
  // Custom dual-tab (Trainer + PvP) match-history view — generic
  // `<MatchHistory>` only knows about server-stored matches; trainer
  // runs live in localStorage and need their own table.
  matchHistoryComponent: lazy(() => import("./components/SetMatchHistory")),
} satisfies PlayableModule;
