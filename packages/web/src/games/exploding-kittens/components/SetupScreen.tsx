import type { AIStrategyId } from "@boardgames/core/games/exploding-kittens/types";
import {
  AI_STRATEGY_DESCRIPTIONS,
  AI_STRATEGY_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";

const STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: AI_STRATEGY_LABELS.random,
    description: AI_STRATEGY_DESCRIPTIONS.random,
    difficulty: "Easy",
  },
  {
    id: "heuristic-v1",
    label: AI_STRATEGY_LABELS["heuristic-v1"],
    description: AI_STRATEGY_DESCRIPTIONS["heuristic-v1"],
    difficulty: "Medium",
  },
  {
    id: "ismcts-v1",
    label: AI_STRATEGY_LABELS["ismcts-v1"],
    description: AI_STRATEGY_DESCRIPTIONS["ismcts-v1"],
    difficulty: "Hard",
  },
];

interface SetupScreenProps {
  onStart: (playerCount: number, strategies: (AIStrategyId | null)[]) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Exploding Kittens"
      playerCounts={[2, 3, 4, 5]}
      strategies={STRATEGIES}
      defaultStrategy="heuristic-v1"
      onStart={(pc, id) => {
        const strategies: (AIStrategyId | null)[] = [null];
        for (let i = 1; i < pc; i++) strategies.push(id as AIStrategyId);
        onStart(pc, strategies);
      }}
    />
  );
}
