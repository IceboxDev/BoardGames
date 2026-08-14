import type { StrategyId } from "@boardgames/core/games/sushi-go/ai/strategy";
import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";

const TWO_PLAYER_STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "Picks a random card each turn.",
    difficulty: "Easy",
  },
  {
    id: "minimax",
    label: "Minimax",
    description: "Classic sequential search with alpha-beta pruning. Strong but exploitable.",
    difficulty: "Hard",
  },
  {
    id: "nash",
    label: "Nash Equilibrium",
    description:
      "Game-theoretically optimal. Solves each turn as a simultaneous-move zero-sum game.",
    difficulty: "Expert",
  },
];

const MULTI_PLAYER_STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "All bots pick random cards each turn.",
    difficulty: "Easy",
  },
];

interface SetupScreenProps {
  onStart: (playerCount: number, strategyId: StrategyId) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Sushi Go!"
      playerCounts={[2, 3, 4, 5]}
      strategies={(pc) => (pc === 2 ? TWO_PLAYER_STRATEGIES : MULTI_PLAYER_STRATEGIES)}
      defaultStrategy="nash"
      onStart={(pc, id) => onStart(pc, id as StrategyId)}
    />
  );
}
