import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";

const STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "Bots pick a random legal move — trades, wonders and all.",
    difficulty: "Easy",
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
];

interface SetupScreenProps {
  onStart: (playerCount: number) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="7 Wonders"
      playerCounts={[3, 4, 5, 6, 7]}
      strategies={STRATEGIES}
      defaultStrategy="random"
      onStart={(playerCount) => onStart(playerCount)}
    />
  );
}
