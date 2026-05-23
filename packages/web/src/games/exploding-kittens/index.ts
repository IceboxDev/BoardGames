import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
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
  replayComponent,
  matchHistoryLabelResolver: (id: string) =>
    AI_STRATEGY_LABELS[id as keyof typeof AI_STRATEGY_LABELS] ?? id,
} satisfies PlayableModule;
