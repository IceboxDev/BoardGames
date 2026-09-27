import { describe, expect, it } from "vitest";
import { createRng, rngFrom, rngStateFromSeed, shuffle } from "./rng";

describe("rngFrom", () => {
  it("draws the same sequence as createRng for the same seed", () => {
    const closure = createRng(1234);
    const carrier = { rngState: rngStateFromSeed(1234) };
    const fromState = rngFrom(carrier);
    for (let i = 0; i < 20; i++) expect(fromState()).toBe(closure());
  });

  it("keeps its whole state in the carrier, so a JSON copy resumes the sequence", () => {
    const carrier = { rngState: rngStateFromSeed(99) };
    const rng = rngFrom(carrier);
    rng();
    rng();
    const copy = JSON.parse(JSON.stringify(carrier)) as typeof carrier;
    expect(rngFrom(copy)()).toBe(rng());
  });

  it("makes a seeded shuffle reproducible", () => {
    const deck = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(deck, rngFrom({ rngState: rngStateFromSeed(7) }));
    const b = shuffle(deck, rngFrom({ rngState: rngStateFromSeed(7) }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(deck);
  });
});
