import type { AIEngine } from "@boardgames/core/games/lost-cities/types";
import { AI_ENGINE_DESCRIPTIONS, AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";

const STRATEGIES: StrategyOption[] = [
  {
    id: "ismcts-v1",
    label: AI_ENGINE_LABELS["ismcts-v1"],
    description: AI_ENGINE_DESCRIPTIONS["ismcts-v1"],
    difficulty: "Easy",
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
  {
    id: "ismcts-v4",
    label: AI_ENGINE_LABELS["ismcts-v4"],
    description: AI_ENGINE_DESCRIPTIONS["ismcts-v4"],
    difficulty: "Medium",
    accentColor: "#f59e0b",
    badgeClass: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
  {
    id: "ismcts-v5",
    label: AI_ENGINE_LABELS["ismcts-v5"],
    description: AI_ENGINE_DESCRIPTIONS["ismcts-v5"],
    difficulty: "Hard",
    accentColor: "#ef4444",
    badgeClass: "bg-red-500/15 text-red-400 ring-red-500/30",
  },
  {
    id: "ismcts-v6",
    label: AI_ENGINE_LABELS["ismcts-v6"],
    description: AI_ENGINE_DESCRIPTIONS["ismcts-v6"],
    difficulty: "Hard+",
    accentColor: "#a855f7",
    badgeClass: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
];

interface SetupScreenProps {
  onSelect: (engine: AIEngine) => void;
}

export default function SetupScreen({ onSelect }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Lost Cities"
      strategies={STRATEGIES}
      defaultStrategy="ismcts-v4"
      onStart={(_pc, id) => onSelect(id as AIEngine)}
    />
  );
}
