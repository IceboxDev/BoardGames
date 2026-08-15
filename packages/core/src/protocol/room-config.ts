import { DECRYPTO_AI_MODELS } from "../games/decrypto/ai/models";

export interface GameRoomConfig {
  minPlayers: number;
  maxPlayers: number;
  supportsAI: boolean;
  /**
   * Per-slot role names for games where the seat index carries meaning
   * (Sky Team: slot 0 flies as Pilot, slot 1 as Co-Pilot; Decrypto: slots
   * 0-1 are the White team, 2-3 the Black team). The lobby renders these
   * as badges on the player rows so it's clear who gets which seat before
   * the game starts. Omit for games with symmetric seats.
   */
  seatNames?: readonly string[];
  /**
   * Selectable engines for AI slots. When present, the lobby renders a
   * picker on each AI slot instead of the historical hardcoded
   * "heuristic-v1"; the chosen id rides on `RoomSlot.aiStrategy` (for
   * Decrypto the ids are GPT model names).
   */
  botStrategies?: readonly { id: string; label: string }[];
}

export const gameRoomConfigs: Record<string, GameRoomConfig> = {
  "7-wonders": { minPlayers: 3, maxPlayers: 7, supportsAI: true },
  // Fixed seat convention: 0-1 White, 2-3 Black. Filling only seats 0-2
  // (leaving the last open) starts the official 3-player Interceptor variant
  // with seat 2 as the solo interceptor. AI slot ids are GPT model names.
  decrypto: {
    minPlayers: 1,
    maxPlayers: 4,
    supportsAI: true,
    seatNames: ["White 1", "White 2", "Black 1", "Black 2"],
    botStrategies: DECRYPTO_AI_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  "lost-cities": { minPlayers: 2, maxPlayers: 2, supportsAI: true },
  "exploding-kittens": { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  durak: { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  pandemic: { minPlayers: 2, maxPlayers: 4, supportsAI: false },
  set: { minPlayers: 2, maxPlayers: 2, supportsAI: false },
  "sushi-go": { minPlayers: 2, maxPlayers: 5, supportsAI: false },
  parks: { minPlayers: 2, maxPlayers: 2, supportsAI: true },
  "sky-team": { minPlayers: 2, maxPlayers: 2, supportsAI: true, seatNames: ["Pilot", "Co-Pilot"] },
};
