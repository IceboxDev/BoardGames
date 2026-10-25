import { afterEach, describe, expect, it } from "vitest";
import { readSetup, saveSetup } from "./preferences";

afterEach(() => localStorage.clear());

describe("chess setup preferences", () => {
  it("remembers the last setup", () => {
    const setup = {
      strategy: "sf-1800",
      color: "b" as const,
      timeControl: { initialMs: 300_000, incrementMs: 3_000 },
      takebacks: false,
    };
    saveSetup(setup);
    expect(readSetup()).toEqual(setup);
  });
  it("falls back to nothing on a missing or malformed value", () => {
    expect(readSetup()).toBeNull();
    localStorage.setItem("chess:setup:v1", "{not json");
    expect(readSetup()).toBeNull();
    localStorage.setItem("chess:setup:v1", JSON.stringify({ strategy: 3 }));
    expect(readSetup()).toBeNull();
  });
});
