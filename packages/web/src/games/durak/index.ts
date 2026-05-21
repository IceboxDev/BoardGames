import { AI_STRATEGY_LABELS } from "@boardgames/core/games/durak/types";
import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  slug: "durak",
  bggId: 0,
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
  family: { id: "card-games", variant: "Durak" },
  matchHistoryLabelResolver: (id) =>
    AI_STRATEGY_LABELS[id as keyof typeof AI_STRATEGY_LABELS] ?? id,
} satisfies GameModule;
