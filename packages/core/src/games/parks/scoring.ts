import type { Park, PassionId, PlayerState, ResourceType, ScoreBreakdown } from "./types";

function parkRequires(park: Park, r: ResourceType): boolean {
  return park.cost[r] > 0;
}

function parkHasInstantAction(park: Park): boolean {
  // Approximation: "Instant Action" parks are those that grant something on visit.
  if (!park.refund) return false;
  return park.refund.M + park.refund.F + park.refund.S + park.refund.W + park.refund.A > 0;
}

function sumCost(parks: Park[], r: ResourceType): number {
  let total = 0;
  for (const p of parks) total += p.cost[r];
  return total;
}

export function scorePassion(player: PlayerState): number {
  const id: PassionId | null = player.passion;
  if (id === null) return 0;
  // End-game bonus is only awarded if the player explicitly chose this path.
  // "gear" mode trades the end-bonus for ongoing mid-game effects.
  if (player.passionMode !== "end-bonus") return 0;
  switch (id) {
    case "adventure":
      return player.parks.filter(parkHasInstantAction).length;
    case "birdwatching":
      return player.parks.filter((p) => parkRequires(p, "S")).length;
    case "botany":
      return Math.floor(sumCost(player.parks, "F") / 2);
    case "collecting":
      // +1 PT per Gear Card owned at game end.
      return player.gear.length;
    case "forestry":
      return player.parks.filter((p) => parkRequires(p, "F")).length;
    case "kayaking":
      return player.parks.filter((p) => parkRequires(p, "W")).length;
    case "mountaineering":
      return player.parks.filter((p) => parkRequires(p, "M")).length;
    case "rock-climbing":
      return Math.floor(sumCost(player.parks, "M") / 2);
    case "swimming":
      return Math.floor(sumCost(player.parks, "W") / 2);
    case "wildlife":
      return Math.floor(player.photos.length / 3);
  }
}

/** End-game (mfacssww)/6 bonus: count distinct ever-held resource types, divide by 6, floor. */
function endGameDividedBonus(park: Park, player: PlayerState): number {
  if (!park.endGameDividedBonus) return 0;
  // Sum the player's ever-held distinct letters that match the encoded letters.
  // Encoding "(mfacssww)/6" — use cardinality of the multiset that the player matches.
  // Simplification: sum of min(player resourceTypesEverHeld occurrences, encoded letters)
  // — but since "ever held" is a set, we use indicator variables: for each letter
  // in the encoding bag, if the player ever held that resource type, count its
  // multiplicity. Then divide by divisor and floor.
  const enc = park.endGameDividedBonus.letters;
  let total = 0;
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (player.resourceTypesEverHeld.has(r)) total += enc[r];
  }
  return Math.floor(total / park.endGameDividedBonus.divisor);
}

export function scoreParks(player: PlayerState): number {
  let total = 0;
  for (const park of player.parks) {
    total += park.pt;
    total += endGameDividedBonus(park, player);
  }
  return total;
}

export function scorePlayer(player: PlayerState): ScoreBreakdown {
  const parks = scoreParks(player);
  const photos = player.photos.length;
  const passion = scorePassion(player);
  const bonusPT = player.bonusPT;
  return { parks, photos, passion, bonusPT, total: parks + photos + passion + bonusPT };
}
