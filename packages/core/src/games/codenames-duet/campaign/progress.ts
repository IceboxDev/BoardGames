/**
 * Where a campaign stands, derived from its games and nothing else: a city is
 * cleared once any game there was won; a city is open when it is Prague or
 * next to a cleared city. Missions can be replayed (rulebook: "you will find
 * a few favorite missions and replay them"), so a cleared city stays playable.
 */

import { CAMPAIGN_START, CITY_IDS, type CityId, neighboursOf } from "./map";

/** The least a progress calculation needs to know about one game. */
export interface CampaignGameFact {
  readonly city: CityId;
  readonly won: boolean;
}

export type CityStatus = "cleared" | "open" | "locked";

export interface CampaignProgress {
  readonly cleared: ReadonlySet<CityId>;
  /** Not yet cleared, and playable now. */
  readonly open: readonly CityId[];
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly triesByCity: Readonly<Partial<Record<CityId, number>>>;
}

export function campaignProgress(games: readonly CampaignGameFact[]): CampaignProgress {
  const cleared = new Set<CityId>();
  const triesByCity: Partial<Record<CityId, number>> = {};
  let wins = 0;
  for (const game of games) {
    triesByCity[game.city] = (triesByCity[game.city] ?? 0) + 1;
    if (game.won) {
      wins++;
      cleared.add(game.city);
    }
  }
  const open = CITY_IDS.filter((id) => !cleared.has(id) && reachable(id, cleared));
  return { cleared, open, gamesPlayed: games.length, wins, triesByCity };
}

function reachable(id: CityId, cleared: ReadonlySet<CityId>): boolean {
  return id === CAMPAIGN_START || neighboursOf(id).some((n) => cleared.has(n));
}

export function cityStatus(id: CityId, progress: CampaignProgress): CityStatus {
  if (progress.cleared.has(id)) return "cleared";
  return reachable(id, progress.cleared) ? "open" : "locked";
}

/** May this mission be played now? Any open city, or a cleared one again. */
export function canAttempt(id: CityId, games: readonly CampaignGameFact[]): boolean {
  return cityStatus(id, campaignProgress(games)) !== "locked";
}

/** Cities a win at `id` would open, given the games so far. */
export function opensOnWin(id: CityId, games: readonly CampaignGameFact[]): CityId[] {
  const before = campaignProgress(games);
  const after = campaignProgress([...games, { city: id, won: true }]);
  return after.open.filter((c) => !before.open.includes(c));
}
