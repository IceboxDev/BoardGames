import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { GameModule, ReplayProps } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  slug: "exploding-kittens",
  bggId: 172225,
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
  bggOverrides: { maxPlayers: "infinity" },
  replayComponent,
  matchHistoryLabelResolver: (id) =>
    AI_STRATEGY_LABELS[id as keyof typeof AI_STRATEGY_LABELS] ?? id,
} satisfies GameModule;
