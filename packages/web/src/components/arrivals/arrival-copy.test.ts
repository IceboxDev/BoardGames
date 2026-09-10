import { describe, expect, it } from "vitest";
import {
  arrivalEyebrow,
  arrivalSubheader,
  arrivalTitle,
  collectionHint,
  ctaDestination,
  ctaLabel,
  joinNames,
  thanksSentence,
  voterLabel,
} from "./arrival-copy";
import type { ArrivalCard } from "./arrival-view-model";

const card = (
  slug: string,
  title: string,
  purchaser: { id: string; name: string },
): ArrivalCard => ({
  slug,
  title,
  accentHex: "#d36830",
  purchaser: { ...purchaser, image: null, accentHex: null },
  votes: 3,
  voters: [],
  photoSrc: "/x",
  placeholder: "data:image/webp;base64,x",
  width: 4,
  height: 5,
});

const mantas = { id: "u1", name: "Mantas Kandratavičius" };
const paul = { id: "u2", name: "Paul Otto" };
const juliane = { id: "u3", name: "Juliane Meyer" };

const one = [card("arcs", "Arcs", mantas)];
const two = [card("arcs", "Arcs", mantas), card("wingspan", "Wingspan", paul)];
const three = [...two, card("cascadia", "Cascadia", juliane)];
const sameOwner = [card("arcs", "Arcs", mantas), card("wingspan", "Wingspan", mantas)];

describe("headline copy", () => {
  it("counts games in words and names the single one", () => {
    expect(arrivalEyebrow(1)).toBe("New arrival");
    expect(arrivalEyebrow(3)).toBe("New arrivals");
    expect(arrivalTitle(one)).toBe("Arcs just arrived");
    expect(arrivalTitle(two)).toBe("Two new games just arrived");
    expect(arrivalTitle(three)).toBe("Three new games just arrived");
  });

  it("lists distinct purchasers by first name", () => {
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(arrivalSubheader(three)).toBe(
      "The group voted, Mantas, Paul and Juliane bought — here's what's new on the shelf.",
    );
    expect(arrivalSubheader(sameOwner)).toContain("Mantas bought");
  });
});

describe("thanksSentence", () => {
  it("thanks one purchaser and the voters, singular for one game", () => {
    expect(thanksSentence(one, { voterCount: 6, votesCast: 15 }, null)).toEqual({
      names: "Mantas",
      rest: " for buying it, and to the 6 players whose votes chose it.",
    });
  });

  it("pluralises for several games and lists every purchaser", () => {
    expect(thanksSentence(three, { voterCount: 6, votesCast: 15 }, null)).toEqual({
      names: "Mantas, Paul and Juliane",
      rest: " for buying them, and to the 6 players whose votes chose them.",
    });
  });

  it("speaks to the viewer when they are the sole purchaser, and handles one voter", () => {
    expect(thanksSentence(sameOwner, { voterCount: 1, votesCast: 2 }, "u1")).toEqual({
      names: "you",
      rest: " for buying them, and to the one player whose vote chose them.",
    });
    expect(thanksSentence(two, { voterCount: 4, votesCast: 8 }, "u1").names).toBe(
      "Mantas and Paul",
    );
  });
});

describe("collection hint, CTA label and destination", () => {
  it("single purchaser, viewer is someone else", () => {
    expect(collectionHint(one, "u9")).toBe("Now in Mantas's collection");
    expect(ctaLabel(one, "u9")).toBe("See Mantas's collection");
    expect(ctaDestination(one, "u9")).toBe("/u/u1/collection");
  });

  it("single purchaser who is the viewer", () => {
    expect(collectionHint(one, "u1")).toBe("Now in your collection");
    expect(ctaLabel(one, "u1")).toBe("See your collection");
    expect(ctaDestination(one, "u1")).toBe("/u/u1/collection");
  });

  it("several purchasers, viewer among them", () => {
    expect(collectionHint(two, "u2")).toBe("Now in your collections");
    expect(ctaLabel(two, "u2")).toBe("See your collection");
    expect(ctaDestination(two, "u2")).toBe("/u/u2/collection");
  });

  it("several purchasers, viewer not among them", () => {
    expect(collectionHint(two, "u9")).toBe("Now in their collections");
    expect(ctaLabel(two, "u9")).toBe("Browse the catalog");
    expect(ctaDestination(two, "u9")).toBe("/games");
    expect(ctaDestination(two, null)).toBe("/games");
  });
});

describe("voterLabel", () => {
  it("agrees in number", () => {
    expect(voterLabel(1, 1)).toBe("1 vote from 1 player");
    expect(voterLabel(6, 6)).toBe("6 votes from 6 players");
  });
});
