import { describe, expect, it } from "vitest";
import { fallbackJudge } from "./fallback";

const judge = (clue: string, clash: string) =>
  fallbackJudge({ model: "codenames-medium", language: "en", clue, clash });

describe("the stand-in judge", () => {
  it("allows the rulebook's 'don't be too strict' examples", () => {
    expect(judge("sparrow", "ROW").allow).toBe(true);
    expect(judge("land", "ENGLAND").allow).toBe(true);
    expect(judge("earth", "EAR").allow).toBe(true);
    expect(judge("planet", "PLAN").allow).toBe(true);
  });

  it("refuses a real compound part and a word buried inside a form", () => {
    expect(judge("horse", "HORSESHOE").allow).toBe(false);
    expect(judge("shoe", "HORSESHOE").allow).toBe(false);
    expect(judge("unhorsed", "HORSE").allow).toBe(false);
    expect(judge("moonlight", "MOON").allow).toBe(false);
  });

  it("always gives a reason and marks itself the stand-in", () => {
    const ruling = judge("sparrow", "ROW");
    expect(ruling.reason).toBeTruthy();
    expect(ruling.standIn).toBe(true);
  });
});
