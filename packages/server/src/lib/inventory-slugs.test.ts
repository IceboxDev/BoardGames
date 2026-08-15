import { describe, expect, it } from "vitest";
import { withSlugAdded, withSlugRemoved } from "./inventory-slugs.ts";

describe("withSlugAdded", () => {
  it("appends a new slug and preserves order", () => {
    expect(withSlugAdded(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("is idempotent and dedupes existing entries", () => {
    expect(withSlugAdded(["a", "b", "a"], "b")).toEqual(["a", "b"]);
  });
});

describe("withSlugRemoved", () => {
  it("removes the slug and keeps the rest", () => {
    expect(withSlugRemoved(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("is a no-op (beyond dedupe) when the slug is absent", () => {
    expect(withSlugRemoved(["a", "a", "c"], "x")).toEqual(["a", "c"]);
  });
});
