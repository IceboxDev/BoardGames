import { describe, expect, it } from "vitest";
import { HELP_CARDS, helpCardDef, helpDeckFor } from "./help-cards.ts";
import { HELP_CARD_IDS, type HelpCardId } from "./types.ts";

describe("help cards", () => {
  it("defines every id exactly once, in the canonical order", () => {
    expect(HELP_CARDS.map((c) => c.id)).toEqual([...HELP_CARD_IDS]);
    expect(new Set(HELP_CARDS.map((c) => c.id)).size).toBe(HELP_CARD_IDS.length);
  });

  it("has bilingual names and texts", () => {
    for (const c of HELP_CARDS) {
      expect(c.nameDe.length).toBeGreaterThan(0);
      expect(c.nameEn.length).toBeGreaterThan(0);
      expect(c.textDe.length).toBeGreaterThan(0);
      expect(c.textEn.length).toBeGreaterThan(0);
    }
  });

  it("maps each card to its effect and flags the invented ones", () => {
    const byId = Object.fromEntries(HELP_CARDS.map((c) => [c.id, c]));
    expect(byId.besetzung).toMatchObject({ effect: "return-lost-building", assumed: false });
    expect(byId.datenleak).toMatchObject({ effect: "peek-answer", assumed: false });
    expect(byId.insidertipp).toMatchObject({ effect: "reader-tip", assumed: true });
    expect(byId.benefizvorstellung).toMatchObject({ effect: "reader-mime", assumed: true });
    expect(byId["alternative-fakten"]).toMatchObject({ effect: "redraw-question", assumed: true });
    expect(byId.streik).toMatchObject({ effect: "shield", assumed: true });
  });

  it("helpCardDef looks up by id and throws on garbage", () => {
    expect(helpCardDef("streik").nameEn).toBe("Strike");
    expect(() => helpCardDef("bogus" as HelpCardId)).toThrow(/unknown help card/);
  });

  it("solo keeps only the cards that need nobody else", () => {
    expect(helpDeckFor(1)).toEqual(["besetzung", "alternative-fakten", "streik"]);
    for (const n of [2, 3, 4, 5, 6]) expect(helpDeckFor(n)).toEqual([...HELP_CARD_IDS]);
  });
});
