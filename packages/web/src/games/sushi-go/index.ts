import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "sushi-go",
  title: "Sushi Go!",
  description: "Pick and pass cards to build the best sushi meal",
  subtitle: "Pick and pass cards to build the best sushi meal",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-orange-500/30",
    hoverBg: "group-hover:bg-orange-500/5",
    arrow: "group-hover:text-orange-400",
    gradient: "from-orange-950/80 to-amber-950/80",
  },
  component: lazy(() => import("./SushiGo")),
  mode: "remote",
  hasTournament: true,
  tournamentStrategies: [
    { id: "nash", label: "Nash Equilibrium" },
    { id: "minimax", label: "Minimax" },
    { id: "random", label: "Random" },
  ],
  rulesUrl,
} satisfies GameDefinition;
