import { CITIES, type CityId } from "@boardgames/core/games/codenames-duet/campaign/map";
import type { CampaignSummary } from "@boardgames/core/protocol";

// Words for a mission, shared by the Mission Desk, the lobby, the board and
// the game-over line.

/** "11–0": turns–mistakes, as printed on the map. */
export function missionNumbers(city: CityId): string {
  const c = CITIES[city];
  return `${c.tokens}–${c.mistakes}`;
}

/** The mission's rule in one sentence (rulebook: a bystander with no free mistakes left costs two turns). */
export function missionRule(city: CityId): string {
  const { tokens, mistakes } = CITIES[city];
  if (mistakes >= tokens)
    return `${tokens} turns, and every bystander is free — the standard game.`;
  if (mistakes === 0) return `${tokens} turns. No free mistakes: every bystander costs two turns.`;
  return `${tokens} turns. ${mistakes} free ${mistakes === 1 ? "mistake" : "mistakes"}; after that a bystander costs two turns.`;
}

/**
 * How hard a mission is, 1–5: fewer turns and fewer free mistakes are harder.
 * A guide for choosing, not a rule.
 */
export function missionDifficulty(city: CityId): number {
  const { tokens, mistakes } = CITIES[city];
  const score = 11 - tokens + (Math.min(mistakes, tokens) === tokens ? 0 : (9 - mistakes) * 0.6);
  return Math.max(1, Math.min(5, Math.round(score / 2.2)));
}

export function cityName(city: CityId): string {
  return CITIES[city].name;
}

/** "Berlin, Cairo and Moscow". */
export function listCities(cities: readonly CityId[]): string {
  const names = cities.map(cityName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "Mantas & Ieva", "Mantas & the AI partner". */
export function teamLine(
  campaign: Pick<CampaignSummary, "members" | "partnerKind" | "guestName">,
): string {
  const names = campaign.members.map((m) => m.name);
  if (campaign.partnerKind === "guest" && campaign.guestName) names.push(campaign.guestName);
  if (campaign.partnerKind === "ai") names.push("the AI partner");
  return names.join(" & ");
}
