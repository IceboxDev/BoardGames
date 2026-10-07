import { describe, expect, it } from "vitest";
import {
  CreateReportBodySchema,
  ISSUES_FOR,
  REPORT_MESSAGE_MAX,
  ResolveReportsBodySchema,
} from "./quiztopia-reports.ts";

const question = { kind: "question", id: "c001-s01-q2" } as const;
const article = { kind: "article", id: "c001-s01" } as const;

describe("CreateReportBodySchema", () => {
  it("accepts a question report and drops an empty message", () => {
    const parsed = CreateReportBodySchema.parse({
      target: question,
      issue: "wrong-answer",
      language: "de",
      message: "   ",
      surface: "trainer",
    });
    expect(parsed).toEqual({
      target: question,
      issue: "wrong-answer",
      language: "de",
      message: undefined,
      surface: "trainer",
    });
  });

  it("refuses an issue the target can't have", () => {
    const r = CreateReportBodySchema.safeParse({
      target: article,
      issue: "wrong-answer",
      language: "en",
      surface: "wiki",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["issue"]);
  });

  it("requires a message for 'other'", () => {
    const r = CreateReportBodySchema.safeParse({
      target: article,
      issue: "other",
      language: "en",
      message: "",
      surface: "wiki",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["message"]);
  });

  it("caps the message and checks the target id", () => {
    const long = CreateReportBodySchema.safeParse({
      target: question,
      issue: "typo",
      language: "en",
      message: "x".repeat(REPORT_MESSAGE_MAX + 1),
      surface: "journal",
    });
    expect(long.success).toBe(false);
    const badId = CreateReportBodySchema.safeParse({
      target: { kind: "question", id: "c001-s01" },
      issue: "typo",
      language: "en",
      surface: "journal",
    });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["target", "id"]);
  });

  it("offers every issue for some target, 'other' for both", () => {
    expect(ISSUES_FOR.question).toContain("other");
    expect(ISSUES_FOR.article).toContain("other");
  });
});

describe("ResolveReportsBodySchema", () => {
  it("takes ids, a final status and an optional note", () => {
    expect(ResolveReportsBodySchema.parse({ ids: [1, 2], status: "fixed" })).toEqual({
      ids: [1, 2],
      status: "fixed",
      note: undefined,
    });
    expect(ResolveReportsBodySchema.safeParse({ ids: [], status: "fixed" }).success).toBe(false);
    expect(ResolveReportsBodySchema.safeParse({ ids: [1], status: "open" }).success).toBe(false);
  });
});
