import { FULL_DECK } from "@boardgames/core/games/senso-battle-for-japan/deck";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardFace from "./CardFace";
import { artNamesFor } from "./card-art";

vi.mock("./card-art", async (importOriginal) => {
  const real = await importOriginal<typeof import("./card-art")>();
  return { ...real, cardArtUrl: vi.fn(() => undefined) };
});

const art = await import("./card-art");
const cardArtUrl = art.cardArtUrl as unknown as ReturnType<typeof vi.fn>;

afterEach(() => cardArtUrl.mockReset());

function face(
  props: Partial<Parameters<typeof CardFace>[0]> & { card: Parameters<typeof CardFace>[0]["card"] },
) {
  return render(<CardFace size="hand" {...props} />).container;
}

describe("CardFace — composition", () => {
  it.each([2, 5, 7, 10])("a %i shows that many pips and both indices", (rank) => {
    const c = face({ card: `takeda-${rank as 2}` });
    expect(c.querySelectorAll("[data-pip]")).toHaveLength(rank);
    const indices = c.querySelectorAll("[data-index]");
    expect(indices).toHaveLength(2);
    expect(indices[1]?.hasAttribute("data-mirrored")).toBe(true);
    for (const i of indices) expect(i.querySelector("[data-rank]")?.textContent).toBe(String(rank));
    expect(c.querySelector('[data-layer="ribbon"]')).not.toBeNull();
  });

  it("a King carries a court figure, an Ace the halo and the large crest", () => {
    const king = face({ card: "oda-13" });
    expect(king.querySelector('[data-layer="court"]')).not.toBeNull();
    expect(king.querySelectorAll("[data-pip]")).toHaveLength(0);
    expect(king.querySelector("[data-rank]")?.textContent).toBe("K");
    const ace = face({ card: "mori-14" });
    expect(ace.querySelector('[data-layer="halo"]')).not.toBeNull();
    expect(ace.querySelector('[data-layer="ace-crest"]')).not.toBeNull();
  });

  it("a Ninja shows its figure, 忍 in both corners and no clan rule colour", () => {
    const c = face({ card: "ninja-jade" });
    expect(c.querySelector('[data-layer="ninja"]')).not.toBeNull();
    expect(c.querySelector('[data-layer="wash"]')).not.toBeNull();
    expect(c.querySelectorAll("[data-rank]")[0]?.textContent).toBe("忍");
  });

  it("a clan-only card has the crest and ribbon but no index", () => {
    const c = face({ card: "uesugi-14", clanOnly: true });
    expect(c.querySelector('[data-layer="crest"]')).not.toBeNull();
    expect(c.querySelectorAll("[data-index]")).toHaveLength(0);
    expect(c.querySelector('[data-layer="ribbon"]')).not.toBeNull();
  });

  it("mini keeps one index and one crest, and drops the ribbon", () => {
    const c = face({ card: "takeda-9", size: "mini" });
    expect(c.querySelectorAll("[data-index]")).toHaveLength(1);
    expect(c.querySelectorAll("[data-pip]")).toHaveLength(0);
    expect(c.querySelector('[data-layer="crest"]')).not.toBeNull();
    expect(c.querySelector('[data-layer="ribbon"]')).toBeNull();
  });

  it("the advantage suit gets the seal and the gold bar under both ranks", () => {
    const c = face({ card: "takeda-7", trump: true });
    expect(c.querySelector('[data-layer="seal"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-layer="trump-bar"]')).toHaveLength(2);
    expect(face({ card: "takeda-7" }).querySelector('[data-layer="seal"]')).toBeNull();
  });
});

describe("CardFace — art and fallbacks", () => {
  it("draws every card of the deck from fallbacks alone, with no <img>", () => {
    for (const card of FULL_DECK) {
      const c = face({ card });
      expect(c.querySelectorAll("img")).toHaveLength(0);
      expect(c.querySelectorAll("[data-fallback]").length).toBeGreaterThan(0);
    }
  });

  it("swaps a layer to its art the moment the block exists", () => {
    cardArtUrl.mockImplementation((name: string) =>
      name === "crest-takeda-sm" ? "/x.webp" : undefined,
    );
    const c = face({ card: "takeda-7" });
    // 7 pips + the crest in both corner indices.
    expect(c.querySelectorAll("img")).toHaveLength(9);
    for (const img of c.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toBe("/x.webp");
    }
    expect(c.querySelectorAll('[data-fallback="crest-takeda-sm"]')).toHaveLength(0);
    expect(c.querySelector('[data-fallback="kanji-takeda"]')).not.toBeNull();
  });

  it("lists the blocks a card needs so the gallery can flag the missing ones", () => {
    expect(artNamesFor("takeda-7")).toContain("crest-takeda-sm");
  });
});
