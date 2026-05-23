import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./SushiGo")),
  mode: "remote",
  hasTournament: true,
  tournamentStrategies: [
    { id: "nash", label: "Nash Equilibrium" },
    { id: "minimax", label: "Minimax" },
    { id: "random", label: "Random" },
  ],
  rulesUrl,
} satisfies PlayableModule;
