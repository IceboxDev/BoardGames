import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "durak",
  title: "Durak",
  bggId: 17329,
  bgg,
  accentHex: accent.hex,
  backgroundImage,
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
} satisfies GameModule;
