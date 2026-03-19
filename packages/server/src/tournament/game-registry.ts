import { ALL_STRATEGIES as EK_STRATEGIES } from "@boardgames/core/games/exploding-kittens/ai-strategies";
import { ALL_STRATEGIES as LC_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";

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
};
