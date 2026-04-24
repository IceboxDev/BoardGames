import type { StrategyId } from "@boardgames/core/games/sushi-go/ai/strategy";
import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";

const TWO_PLAYER_STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "Picks a random card each turn.",
    difficulty: "Easy",
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
  {
    id: "minimax",
    label: "Minimax",
    description: "Classic sequential search with alpha-beta pruning. Strong but exploitable.",
    difficulty: "Hard",
    accentColor: "#ef4444",
    badgeClass: "bg-red-500/15 text-red-400 ring-red-500/30",
  },
  {
    id: "nash",
    label: "Nash Equilibrium",
    description:
      "Game-theoretically optimal. Solves each turn as a simultaneous-move zero-sum game.",
    difficulty: "Expert",
    accentColor: "#a855f7",
    badgeClass: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
];

const MULTI_PLAYER_STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "All bots pick random cards each turn.",
    difficulty: "Easy",
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
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
