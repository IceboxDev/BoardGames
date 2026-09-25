import { describe, expect, it } from "vitest";
import { applyReview, newState, type SrsState } from "../srs.ts";
import { cardId, type Stage } from "./catalog.ts";
import {
  cleared,
  currentStage,
  newPlaceFrontier,
  placeDone,
  stageReached,
  unlocked,
  unlockedBy,
} from "./ladder.ts";
import { buildGeoSession, openGroups } from "./session.ts";
import { realCatalog } from "./test-catalog.ts";

const catalog = realCatalog();
const TODAY = "2026-09-25";
const at = { localDate: TODAY, now: "2026-09-25T10:00:00Z" };
const settings = { focus: null };

/** A stage card answered correctly once. */
function passed(placeId: string, stage: Stage): SrsState {
  return applyReview(newState(cardId(placeId, stage), TODAY), "good", at);
}
/** All four stages of a place cleared. */
function done(placeId: string): SrsState[] {
  return ([1, 2, 3, 4] as const).map((s) => passed(placeId, s));
}
const map = (list: SrsState[]) => new Map(list.map((s) => [s.questionId, s]));

describe("stages", () => {
  it("clears a stage on the first correct answer, not on a miss", () => {
    const missed = applyReview(newState("ct:eu:s1", TODAY), "again", at);
    expect(cleared(missed)).toBe(false);
    expect(cleared(passed("ct:eu", 1))).toBe(true);
    // Forgotten right after: back to that stage. Forgotten once graduated: stays cleared.
    expect(cleared(applyReview(passed("ct:eu", 1), "again", at))).toBe(false);
    const graduated = applyReview(passed("ct:eu", 1), "good", at);
    expect(cleared(applyReview(graduated, "again", at))).toBe(true);
  });

  it("climbs one stage at a time", () => {
    const s = map([passed("ct:eu", 1), passed("ct:eu", 2), passed("ct:eu", 4)]);
    expect(stageReached(s, "ct:eu")).toBe(2);
    expect(currentStage(s, "ct:eu")).toBe(3);
    expect(placeDone(s, "ct:eu")).toBe(false);
    expect(currentStage(map(done("ct:eu")), "ct:eu")).toBeNull();
  });
});

describe("unlocking", () => {
  it("opens a continent's countries once all four stages are cleared", () => {
    const de = catalog.byId.get("co:DEU");
    if (!de) throw new Error("DEU");
    expect(unlocked(catalog, map([passed("ct:eu", 1), passed("ct:eu", 2)]), de)).toBe(false);
    expect(unlocked(catalog, map(done("ct:eu")), de)).toBe(true);
    expect(unlockedBy(catalog, new Map(), catalog.byId.get("ct:eu") ?? de)).toHaveLength(46);
  });

  it("opens a subregion's cities once every country in it is cleared", () => {
    const western = catalog.countriesBySubregion.get("sr:western-europe") ?? [];
    const berlin = catalog.citiesByCountry.get("co:DEU")?.[0];
    if (!berlin) throw new Error("Berlin");
    const all = [...done("ct:eu"), ...western.flatMap((c) => done(c.id))];
    expect(unlocked(catalog, map(all), berlin)).toBe(true);
    const allButOne = [...done("ct:eu"), ...western.slice(1).flatMap((c) => done(c.id))];
    expect(unlocked(catalog, map(allButOne), berlin)).toBe(false);
  });

  it("offers the seven continents first, then a cleared continent's countries, big first", () => {
    expect(newPlaceFrontier(catalog, new Map(), settings).map((p) => p.id)).toEqual(
      catalog.continents.map((c) => c.id),
    );
    const f = newPlaceFrontier(catalog, map(done("ct:eu")), settings);
    const first = f.find((p) => p.kind === "country");
    expect(["co:FRA", "co:DEU"]).toContain(first?.id);
  });
});

describe("buildGeoSession", () => {
  const base = { catalog, today: TODAY, seedKey: "u1", settings };

  it("starts all seven continents together", () => {
    const items = buildGeoSession({ ...base, states: [] });
    expect(items.map((i) => i.cardId)).toEqual(catalog.continents.map((c) => `${c.id}:s1`));
  });

  it("starts every country of one continent at once, and no new group while places are climbing", () => {
    const continents = catalog.continents.flatMap((c) => done(c.id));
    const fresh = buildGeoSession({ ...base, states: continents }).filter((i) => i.tier === "new");
    expect(fresh).toHaveLength(catalog.countries.filter((c) => c.continent === "eu").length);
    const climbing = [...continents, passed("co:DEU", 1)];
    const items = buildGeoSession({ ...base, states: climbing });
    expect(items.map((i) => i.cardId)).toEqual(["co:DEU:s2"]);
  });

  it("suggests breadth first but starts whichever open group is picked", () => {
    const western = catalog.countriesBySubregion.get("sr:western-europe") ?? [];
    const states = [
      ...catalog.continents.flatMap((c) => done(c.id)),
      ...catalog.countries.filter((c) => c.continent === "eu").flatMap((c) => done(c.id)),
    ];
    const groups = openGroups(catalog, map(states), settings);
    expect(groups[0].id).toBe("countries:as"); // the next continent's countries before any cities
    expect(groups.map((g) => g.id)).toContain("cities:sr:western-europe");
    const suggested = buildGeoSession({ ...base, states }).filter((i) => i.tier === "new");
    expect(suggested.every((i) => i.placeId.startsWith("co:"))).toBe(true);
    const none = buildGeoSession({ ...base, states, group: null });
    expect(none.filter((i) => i.tier === "new")).toEqual([]);
    const fresh = buildGeoSession({ ...base, states, group: "cities:sr:western-europe" }).filter(
      (i) => i.tier === "new",
    );
    const cities = western.flatMap((c) => catalog.citiesByCountry.get(c.id) ?? []);
    expect(fresh.map((i) => i.placeId).sort()).toEqual(cities.map((c) => c.id).sort());
  });

  it("reviews finished places in their borderless forms only, one card per place", () => {
    const due = done("ct:eu").map((s) => ({ ...s, state: "review" as const, dueDate: TODAY }));
    const items = buildGeoSession({ ...base, states: due }).filter((i) => i.tier !== "new");
    expect(items).toHaveLength(1);
    expect(items[0].tier).toBe("review");
    expect([3, 4]).toContain(items[0].stage);
  });
});
