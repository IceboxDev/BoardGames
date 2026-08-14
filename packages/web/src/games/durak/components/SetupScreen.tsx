import type { AIStrategyId } from "@boardgames/core/games/durak/types";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "@boardgames/core/games/durak/types";
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
];

interface SetupScreenProps {
  onStart: (playerCount: number, strategyId: AIStrategyId) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Durak"
      playerCounts={[2, 3, 4, 5]}
      strategies={STRATEGIES}
      defaultStrategy="heuristic-v1"
      onStart={(pc, id) => onStart(pc, id as AIStrategyId)}
    />
  );
}
