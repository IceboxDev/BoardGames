import { describe, expect, it } from "vitest";
import { compactAddress } from "./compact-address";

describe("compactAddress", () => {
  it("drops the trailing country and the postal code before the city", () => {
    expect(compactAddress("Musterstraße 118, 60316 Frankfurt am Main, Germany")).toBe(
      "Musterstraße 118, Frankfurt am Main",
    );
  });

  it("handles Deutschland and case-insensitivity", () => {
    expect(compactAddress("Hauptstr. 2, 10115 Berlin, deutschland")).toBe("Hauptstr. 2, Berlin");
  });

  it("never strips house numbers (postal codes only lead a segment)", () => {
    expect(compactAddress("Straße des 17. Juni 1234, 10623 Berlin, Germany")).toBe(
      "Straße des 17. Juni 1234, Berlin",
    );
  });

  it("leaves addresses without country/postal untouched", () => {
    expect(compactAddress("Bar Kollektiv, Frankfurt")).toBe("Bar Kollektiv, Frankfurt");
  });

  it("does not treat a lone country-less address as a country", () => {
    expect(compactAddress("Germany House, Frankfurt")).toBe("Germany House, Frankfurt");
  });
});
