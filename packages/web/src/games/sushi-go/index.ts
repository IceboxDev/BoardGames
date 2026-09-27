import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./SushiGo")),
  mode: "remote",
  rulesUrl,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
