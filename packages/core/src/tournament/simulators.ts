/**
 * Games the local tournament runner can play, loaded lazily so a worker only
 * pulls in the one engine and AI it needs.
 */

import type { AnyTournamentSimulator } from "./simulator";

export const TOURNAMENT_SIMULATORS: Readonly<
  Record<string, () => Promise<AnyTournamentSimulator>>
> = {
  "7-wonders": async () =>
    (await import("../games/7-wonders/tournament-runner")).sevenWondersSimulator,
  chess: async () => (await import("../games/chess/tournament-runner")).chessSimulator,
  "chess-bughouse": async () =>
    (await import("../games/chess-bughouse/tournament-runner")).bughouseSimulator,
  codenames: async () => (await import("../games/codenames/tournament-runner")).codenamesSimulator,
  "codenames-duet": async () =>
    (await import("../games/codenames-duet/tournament-runner")).duetSimulator,
  "connect-4": async () => (await import("../games/connect-4/tournament-runner")).connect4Simulator,
  decrypto: async () => (await import("../games/decrypto/tournament-runner")).decryptoSimulator,
  durak: async () => (await import("../games/durak/tournament-runner")).durakSimulator,
  "exploding-kittens": async () =>
    (await import("../games/exploding-kittens/tournament-runner")).explodingKittensSimulator,
  go: async () => (await import("../games/go/tournament-runner")).goSimulator,
  "lost-cities": async () =>
    (await import("../games/lost-cities/tournament-runner")).lostCitiesSimulator,
  parks: async () => (await import("../games/parks/tournament-runner")).parksSimulator,
  "senso-battle-for-japan": async () =>
    (await import("../games/senso-battle-for-japan/tournament-runner")).sensoSimulator,
  "sky-team": async () => (await import("../games/sky-team/tournament-runner")).skyTeamSimulator,
  "sushi-go": async () => (await import("../games/sushi-go/tournament-runner")).sushiGoSimulator,
  "the-hunger": async () =>
    (await import("../games/the-hunger/tournament-runner")).theHungerSimulator,
  "the-resistance": async () =>
    (await import("../games/the-resistance/tournament-runner")).resistanceSimulator,
};
