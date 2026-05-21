import { describe, expect, it } from "vitest";
import { synthesizeGuestEmail } from "./guest-email";

describe("synthesizeGuestEmail", () => {
  const FIXED_SUFFIX = "abc12345";
  const fixed = () => FIXED_SUFFIX;

  it("returns null when first name is blank", () => {
    expect(synthesizeGuestEmail("", "Smith", fixed)).toBeNull();
    expect(synthesizeGuestEmail("   ", "Smith", fixed)).toBeNull();
  });

  it("returns null when last name is blank", () => {
    expect(synthesizeGuestEmail("Lina", "", fixed)).toBeNull();
    expect(synthesizeGuestEmail("Lina", "  ", fixed)).toBeNull();
  });

  it("composes display name as 'First Last'", () => {
    expect(synthesizeGuestEmail("Lina", "Smith", fixed)?.name).toBe("Lina Smith");
  });

  it("trims surrounding whitespace before composing", () => {
    expect(synthesizeGuestEmail("  Lina  ", " Smith ", fixed)?.name).toBe("Lina Smith");
  });

  it("lowercases the slug and inserts the suffix", () => {
    expect(synthesizeGuestEmail("Lina", "Smith", fixed)?.email).toBe(
      `guest.lina.smith.${FIXED_SUFFIX}@guest.local`,
    );
  });

  it("replaces disallowed characters with a single hyphen", () => {
    expect(synthesizeGuestEmail("Anna-Lise", "Müller", fixed)?.email).toBe(
      `guest.anna-lise.m-ller.${FIXED_SUFFIX}@guest.local`,
    );
  });

  it("collapses runs of disallowed characters into one hyphen", () => {
    expect(synthesizeGuestEmail("Anna  Lise", "Smith", fixed)?.email).toBe(
      `guest.anna-lise.smith.${FIXED_SUFFIX}@guest.local`,
    );
  });

  it("trims leading and trailing hyphens from the slug", () => {
    // Names made entirely of disallowed chars would become "-" — the trim
    // step removes those edge hyphens so the slug doesn't bracket itself.
    const result = synthesizeGuestEmail("!Lina!", "Smith", fixed);
    expect(result?.email).toBe(`guest.lina-.smith.${FIXED_SUFFIX}@guest.local`);
  });

  it("falls back to 'player' when the slug normalizes to an empty string", () => {
    // Both inputs are characters that get stripped, leaving the slug empty.
    const result = synthesizeGuestEmail("@@@", "###", fixed);
    expect(result?.email).toBe(`guest.player.${FIXED_SUFFIX}@guest.local`);
  });

  it("uses the global crypto.randomUUID by default when no suffix fn is supplied", () => {
    const result = synthesizeGuestEmail("Lina", "Smith");
    expect(result?.email).toMatch(/^guest\.lina\.smith\.[0-9a-f]{8}@guest\.local$/);
  });
});
