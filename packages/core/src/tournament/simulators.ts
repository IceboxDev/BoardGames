/**
 * Games the local tournament runner can play, loaded lazily so a worker only
 * pulls in the one engine and AI it needs.
 */

import type { TournamentSimulator } from "./simulator";

export const TOURNAMENT_SIMULATORS: Readonly<Record<string, () => Promise<TournamentSimulator>>> = {
  durak: async () => (await import("../games/durak/tournament-runner")).durakSimulator,
  "exploding-kittens": async () =>
    (await import("../games/exploding-kittens/tournament-runner")).explodingKittensSimulator,
  "lost-cities": async () =>
    (await import("../games/lost-cities/tournament-runner")).lostCitiesSimulator,
  "senso-battle-for-japan": async () =>
    (await import("../games/senso-battle-for-japan/tournament-runner")).sensoSimulator,
  "sushi-go": async () => (await import("../games/sushi-go/tournament-runner")).sushiGoSimulator,
  "the-hunger": async () =>
    (await import("../games/the-hunger/tournament-runner")).theHungerSimulator,
};
