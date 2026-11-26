import { describe, expect, it } from "vitest";
import type { TreeBuild } from "../useTreeBuild";
import { buildLabel } from "./status-text";

const build = (over: Partial<TreeBuild>): TreeBuild =>
  ({
    phase: "building",
    progress: null,
    indexing: null,
    tree: null,
    error: null,
    farm: null,
    askingFarm: false,
    catchUp: null,
    ...over,
  }) as TreeBuild;

describe("build status line", () => {
  it("counts the farm's results taken in, never a pass's positions", () => {
    expect(buildLabel(build({ catchUp: { done: 5779, total: 8473, etaSeconds: 3600 } }))).toBe(
      "Adding the farm's results · 5,779 of 8,473 · about 60 min left",
    );
    expect(buildLabel(build({ catchUp: { done: 10, total: 20, etaSeconds: null } }))).toBe(
      "Adding the farm's results · 10 of 20",
    );
  });

  it("says plainly what a build does without a catch-up, and nothing when idle", () => {
    expect(buildLabel(build({}))).toBe("Building your tree");
    expect(buildLabel(build({ askingFarm: true }))).toBe("Fetching the farm's results");
    expect(buildLabel(build({ phase: "idle" }))).toBe("Not built yet.");
  });
});
