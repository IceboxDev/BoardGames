import { QUIZ_SOURCES } from "@boardgames/core/quiz/sources";
import { describe, expect, it } from "vitest";
import { HOMEBREW, SOURCE_MARK_IDS, sourceMarkOf } from "./source-marks";

describe("source marks", () => {
  it("gives every source and Homebrew a short name of its own", () => {
    expect(SOURCE_MARK_IDS).toEqual([...QUIZ_SOURCES.map((s) => s.id), HOMEBREW]);
    const shorts = SOURCE_MARK_IDS.map((id) => sourceMarkOf(id).short);
    expect(new Set(shorts).size).toBe(shorts.length);
    for (const s of QUIZ_SOURCES) expect(sourceMarkOf(s.id).short).not.toBe(s.id);
  });
});
