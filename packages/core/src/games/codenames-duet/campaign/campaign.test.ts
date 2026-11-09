import { describe, expect, it } from "vitest";
import { CAMPAIGN_START, CITIES, CITY_IDS, type CityId, neighboursOf, ROUTES } from "./map";
import { campaignProgress, canAttempt, cityStatus, opensOnWin } from "./progress";

describe("mission map", () => {
  it("is the printed sheet: 26 cities, 25 routes, every city reachable from Prague", () => {
    expect(CITY_IDS).toHaveLength(26);
    expect(ROUTES).toHaveLength(25);
    const seen = new Set<CityId>([CAMPAIGN_START]);
    const queue: CityId[] = [CAMPAIGN_START];
    while (queue.length) {
      const id = queue.shift() as CityId;
      for (const n of neighboursOf(id)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(26);
  });

  it("starts in Prague 9–9 with Berlin, Cairo and Moscow next (rulebook)", () => {
    expect(CITIES.prague).toMatchObject({ tokens: 9, mistakes: 9 });
    expect([...neighboursOf("prague")].sort()).toEqual(["berlin", "cairo", "moscow"]);
  });

  it("never asks for more mistakes than tokens", () => {
    for (const c of Object.values(CITIES)) expect(c.mistakes).toBeLessThanOrEqual(c.tokens);
  });
});

describe("campaign progress", () => {
  it("opens only Prague before the first win", () => {
    const p = campaignProgress([]);
    expect(p.open).toEqual(["prague"]);
    expect(canAttempt("berlin", [])).toBe(false);
  });

  it("a win clears the city and opens its neighbours; a loss opens nothing", () => {
    const lost = [{ city: "prague" as const, won: false }];
    expect(campaignProgress(lost).open).toEqual(["prague"]);
    const won = [...lost, { city: "prague" as const, won: true }];
    const p = campaignProgress(won);
    expect([...p.cleared]).toEqual(["prague"]);
    expect([...p.open].sort()).toEqual(["berlin", "cairo", "moscow"]);
    expect(p.gamesPlayed).toBe(2);
    expect(p.wins).toBe(1);
    expect(p.triesByCity.prague).toBe(2);
  });

  it("lets a cleared mission be replayed, never a locked one", () => {
    const games = [{ city: "prague" as const, won: true }];
    expect(canAttempt("prague", games)).toBe(true);
    expect(cityStatus("prague", campaignProgress(games))).toBe("cleared");
    expect(canAttempt("paris", games)).toBe(false);
    expect(opensOnWin("berlin", games).sort()).toEqual(["london", "paris"]);
  });
});
