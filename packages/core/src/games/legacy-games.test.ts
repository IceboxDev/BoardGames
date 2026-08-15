import { describe, expect, it } from "vitest";
import { isLegacyDestructible } from "./legacy-games.ts";

describe("isLegacyDestructible", () => {
  it("accepts every EXIT box slug", () => {
    expect(isLegacyDestructible("exit-abandoned-cabin")).toBe(true);
    expect(isLegacyDestructible("exit-secret-lab")).toBe(true);
  });

  it("accepts the Medical Mysteries one-shots", () => {
    expect(isLegacyDestructible("medical-mysteries-nyc")).toBe(true);
    expect(isLegacyDestructible("medical-mysteries-miami")).toBe(true);
  });

  it("rejects the EXIT anchor and ordinary catalog games", () => {
    expect(isLegacyDestructible("exit")).toBe(false);
    expect(isLegacyDestructible("lost-cities")).toBe(false);
    expect(isLegacyDestructible("deck-french-suited")).toBe(false);
  });
});
