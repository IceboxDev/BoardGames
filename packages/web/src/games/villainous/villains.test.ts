import { describe, expect, it } from "vitest";
import { VILLAINOUS_EDITION_LABELS, VILLAINOUS_EDITIONS, villainsForEdition } from "./villains";

describe("villainsForEdition", () => {
  it("returns the four Introduction to Evil villains", () => {
    expect(villainsForEdition("Introduction to Evil")).toEqual([
      "Captain Hook",
      "Maleficent",
      "Prince John",
      "Ursula",
    ]);
  });

  it("returns the six The Worst Takes It All villains", () => {
    expect(villainsForEdition("The Worst Takes It All")).toEqual([
      "Captain Hook",
      "Jafar",
      "Maleficent",
      "Prince John",
      "Queen of Hearts",
      "Ursula",
    ]);
  });

  it("falls back to the full six-villain superset for an unset or unknown edition", () => {
    const superset = VILLAINOUS_EDITIONS["The Worst Takes It All"];
    expect(villainsForEdition(undefined)).toEqual(superset);
    expect(villainsForEdition("Not An Edition")).toEqual(superset);
  });
});

describe("VILLAINOUS_EDITIONS", () => {
  it("lists both editions as labels", () => {
    expect(VILLAINOUS_EDITION_LABELS).toEqual(["Introduction to Evil", "The Worst Takes It All"]);
  });

  it("Introduction to Evil is a strict subset of The Worst Takes It All", () => {
    const superset = new Set(VILLAINOUS_EDITIONS["The Worst Takes It All"]);
    for (const villain of VILLAINOUS_EDITIONS["Introduction to Evil"]) {
      expect(superset.has(villain)).toBe(true);
    }
  });
});
