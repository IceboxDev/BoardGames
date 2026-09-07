import type { AIStrategyId } from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  AI_STRATEGY_DESCRIPTIONS,
  AI_STRATEGY_LABELS,
} from "@boardgames/core/games/senso-battle-for-japan/types";
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
    id: "aggressive",
    label: AI_STRATEGY_LABELS.aggressive,
    description: AI_STRATEGY_DESCRIPTIONS.aggressive,
    difficulty: "Hard",
  },
  {
    id: "shogun",
    label: AI_STRATEGY_LABELS.shogun,
    description: AI_STRATEGY_DESCRIPTIONS.shogun,
    difficulty: "Hard+",
  },
  {
    id: "tenka",
    label: AI_STRATEGY_LABELS.tenka,
    description: AI_STRATEGY_DESCRIPTIONS.tenka,
    difficulty: "Expert",
  },
];

interface SetupScreenProps {
  onStart: (playerCount: number, strategyId: AIStrategyId) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Sensō: Battle for Japan"
      playerCounts={[2, 3, 4, 5]}
      defaultPlayerCount={3}
      strategies={STRATEGIES}
      defaultStrategy="tenka"
      onStart={(pc, id) => onStart(pc, id as AIStrategyId)}
    />
  );
}
