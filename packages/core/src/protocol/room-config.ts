export interface GameRoomConfig {
  minPlayers: number;
  maxPlayers: number;
  supportsAI: boolean;
  /**
   * Per-slot role names for games where the seat index carries meaning
   * (Sky Team: slot 0 flies as Pilot, slot 1 as Co-Pilot). The lobby
   * renders these as badges on the player rows so it's clear who gets
   * which seat before the game starts. Omit for games with symmetric
   * seats.
   */
  seatNames?: readonly string[];
}

export const gameRoomConfigs: Record<string, GameRoomConfig> = {
  "lost-cities": { minPlayers: 2, maxPlayers: 2, supportsAI: true },
  "exploding-kittens": { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  durak: { minPlayers: 2, maxPlayers: 5, supportsAI: true },
  pandemic: { minPlayers: 2, maxPlayers: 4, supportsAI: false },
  set: { minPlayers: 2, maxPlayers: 2, supportsAI: false },
  "sushi-go": { minPlayers: 2, maxPlayers: 5, supportsAI: false },
  parks: { minPlayers: 2, maxPlayers: 2, supportsAI: true },
  "sky-team": { minPlayers: 2, maxPlayers: 2, supportsAI: true, seatNames: ["Pilot", "Co-Pilot"] },
};
