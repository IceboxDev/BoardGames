export interface GameRoomConfig {
  minPlayers: number;
  maxPlayers: number;
  supportsAI: boolean;
}

export const gameRoomConfigs: Record<string, GameRoomConfig> = {
  "lost-cities": { minPlayers: 2, maxPlayers: 2, supportsAI: true },
  "exploding-kittens": { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  durak: { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  pandemic: { minPlayers: 2, maxPlayers: 4, supportsAI: false },
  set: { minPlayers: 2, maxPlayers: 2, supportsAI: false },
  "sushi-go": { minPlayers: 2, maxPlayers: 5, supportsAI: false },
  parks: { minPlayers: 2, maxPlayers: 2, supportsAI: true },
};
