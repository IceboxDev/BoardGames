import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "sushi-go",
  title: "Sushi Go!",
  bggId: 133473,
  bgg,
  accentHex: accent.hex,
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
} satisfies GameModule;
