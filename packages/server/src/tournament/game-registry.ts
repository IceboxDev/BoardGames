import { ALL_STRATEGIES as DURAK_STRATEGIES } from "@boardgames/core/games/durak/ai-strategies";
import { ALL_STRATEGIES as EK_STRATEGIES } from "@boardgames/core/games/exploding-kittens/ai-strategies";
import { ALL_STRATEGIES as LC_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";
import { ALL_STRATEGIES as SG_STRATEGIES } from "@boardgames/core/games/sushi-go/ai/strategy";

export interface GameTournamentEntry {
  strategies: { id: string; label: string }[];
}

export const tournamentRegistry: Record<string, GameTournamentEntry> = {
  "lost-cities": {
    strategies: LC_STRATEGIES.map((s) => ({ id: s.id, label: s.label })),
  },
  "exploding-kittens": {
    strategies: EK_STRATEGIES.map((s) => ({ id: s.id, label: s.label })),
  },
  "sushi-go": {
    strategies: SG_STRATEGIES.map((s) => ({ id: s.id, label: s.label })),
  },
  durak: {
    strategies: DURAK_STRATEGIES.map((s) => ({ id: s.id, label: s.label })),
  },
};
