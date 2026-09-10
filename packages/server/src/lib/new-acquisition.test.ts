import { describe, expect, it } from "vitest";
import { isNewAcquisition } from "./new-acquisition.ts";

// A play BEFORE the acquisition doesn't count (played at a friend's, then
// bought it); a play on the acquisition day or later does.

describe("isNewAcquisition", () => {
  it("is new when acquired and never played", () => {
    expect(isNewAcquisition("2026-09-10", null)).toBe(true);
  });

  it("stays new when the only plays predate the acquisition", () => {
    expect(isNewAcquisition("2026-09-10", "2026-09-09 21:30:00")).toBe(true);
  });

  it("stops being new once played on the acquisition day", () => {
    expect(isNewAcquisition("2026-09-10", "2026-09-10 19:00:00")).toBe(false);
  });

  it("stops being new once played later", () => {
    expect(isNewAcquisition("2026-09-10", "2026-10-02 19:00:00")).toBe(false);
  });

  it("is never new without an acquisition date, even unplayed", () => {
    expect(isNewAcquisition(null, null)).toBe(false);
  });
});
