import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "durak",
  title: "Durak",
  description: "Classic Russian card game of attack, defense, and strategic shedding",
  subtitle: "The classic Russian card game of attack and defense",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-emerald-500/30",
    hoverBg: "group-hover:bg-emerald-500/5",
    arrow: "group-hover:text-emerald-400",
    gradient: "from-emerald-950/80 to-green-950/80",
  },
  component: lazy(() => import("./Durak")),
  mode: "remote",
  hasMatchHistory: true,
  hasTournament: true,
  tournamentStrategies: [
    { id: "random", label: "Random" },
    { id: "heuristic-v1", label: "Heuristic v1" },
  ],
  tournamentShowScoreDiff: false,
  rulesUrl,
} satisfies GameDefinition;
