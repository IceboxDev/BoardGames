import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./SushiGo")),
  rulesUrl,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
