import { describe, expect, it } from "vitest";
import {
  type BacklogItem,
  BacklogItemSchema,
  backlogProblems,
  parseBacklog,
  serializeBacklog,
} from "./backlog-types.ts";

const item = (over: Partial<BacklogItem> = {}): BacklogItem => ({
  id: "b00001",
  kind: "verify",
  target: "f00001",
  priority: 2,
  status: "open",
  created: "2026-10-23",
  by: "coordinator",
  notes: "",
  links: [],
  ...over,
});

const bank = {
  articles: [
    {
      id: "a0001",
      facts: [{ id: "f00001", wordings: [{ id: "w00001" }] }],
      retired: [
        { id: "f00002", wordings: [{ id: "w00002" }], retiredWordings: [{ id: "w00003" }] },
      ],
    },
  ],
  sources: [{ source: "quiztopia", cards: [{ id: "c001" }] }],
  historySeqs: new Map([["a0001", new Set([1, 2])]]),
};

describe("backlog items", () => {
  it("parses good items and round-trips the jsonl", () => {
    const items = [
      item(),
      item({ id: "b00002", kind: "photo-check", target: "quiztopia/c001", links: ["photo.jpg"] }),
      item({ id: "b00003", status: "done", closedBy: "a0001#2", closedAt: "2026-10-24" }),
      item({ id: "b00004", status: "wontfix", closeReason: "already right" }),
      item({ id: "b00005", kind: "candidate", target: "domain:history", priority: 4 }),
      item({ id: "b00006", kind: "report", target: "report:abc_123" }),
      item({ id: "b00007", target: "a0001:body", run: "handcheck-2026-10-23" }),
    ];
    for (const b of items) expect(BacklogItemSchema.parse(b)).toEqual(b);
    expect(parseBacklog(`${serializeBacklog(items)}\n`)).toEqual(items);
    expect(backlogProblems(items, bank)).toEqual([]);
  });

  it("rejects done without closedBy, wontfix without a reason, bad shapes", () => {
    expect(BacklogItemSchema.safeParse(item({ status: "done" })).success).toBe(false);
    expect(BacklogItemSchema.safeParse(item({ status: "wontfix" })).success).toBe(false);
    expect(BacklogItemSchema.safeParse(item({ priority: 5 })).success).toBe(false);
    expect(BacklogItemSchema.safeParse(item({ id: "b1" })).success).toBe(false);
    expect(BacklogItemSchema.safeParse(item({ target: "nonsense" })).success).toBe(false);
    expect(BacklogItemSchema.safeParse(item({ closedBy: "a0001" })).success).toBe(false);
    expect(() => parseBacklog(`${JSON.stringify(item())}\n{"id":"x"}\n`)).toThrow(/line 2/);
  });

  it("finds duplicates, unknown targets and dangling closedBy", () => {
    const items = [
      item(),
      item(),
      item({ id: "b00002", target: "f09999" }),
      item({ id: "b00003", target: "quiztopia/c999" }),
      item({ id: "b00004", target: "nogame/c001" }),
      item({ id: "b00005", target: "domain:nope" }),
      item({ id: "b00006", status: "done", closedBy: "a0001#7" }),
      item({ id: "b00007", target: "w00003" }),
    ];
    expect(backlogProblems(items, bank)).toEqual([
      "b00001: duplicate backlog id",
      "b00002: unknown target f09999",
      "b00003: unknown card quiztopia/c999",
      "b00004: unknown card nogame/c001",
      "b00005: unknown domain domain:nope",
      "b00006: closedBy a0001#7 is no history entry",
    ]);
  });
});
