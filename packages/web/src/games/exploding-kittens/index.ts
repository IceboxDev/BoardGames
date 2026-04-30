import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "exploding-kittens",
  title: "Exploding Kittens",
  bggId: 172225,
  bgg,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./ExplodingKittens")),
  mode: "remote",
  hasMatchHistory: true,
  hasTournament: true,
  tournamentStrategies: [
    { id: "ismcts-v1", label: "IS-MCTS v1" },
    { id: "heuristic-v1", label: "Heuristic v1" },
    { id: "random", label: "Random" },
  ],
  rulesUrl,
} satisfies GameModule;
