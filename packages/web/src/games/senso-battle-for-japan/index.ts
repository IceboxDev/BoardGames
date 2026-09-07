import { ALL_STRATEGIES } from "@boardgames/core/games/senso-battle-for-japan/ai-strategies";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/senso-battle-for-japan/types";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Senso")),
  mode: "remote",
  soloLabel: "Solo vs clan AI",
  hasMatchHistory: true,
  replayComponent,
  hasTournament: true,
  tournamentStrategies: ALL_STRATEGIES.map((s) => ({ id: s.id, label: s.label })),
  tournamentShowScoreDiff: false,
  tournamentPlayerCounts: [2, 3, 4, 5],
  matchHistoryLabelResolver: (id: string) =>
    AI_STRATEGY_LABELS[id as keyof typeof AI_STRATEGY_LABELS] ?? id,
} satisfies PlayableModule;
