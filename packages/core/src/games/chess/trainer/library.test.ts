import { describe, expect, it } from "vitest";
import {
  addFolder,
  addLine,
  allLines,
  EMPTY_LIBRARY,
  findItem,
  LIBRARY_MAX_DEPTH,
  LibrarySchema,
  moveItem,
  removeItem,
  renameItem,
} from "./library";

const base = () => {
  let lib = addFolder(EMPTY_LIBRARY, "w", null, "sicilian", "vs Sicilian");
  lib = addFolder(lib, "w", "sicilian", "alapin1", "Alapin");
  lib = addLine(lib, "w", "alapin1", "line0001", "Alapin main line", ["e2e4", "c7c5", "c2c3"]);
  lib = addFolder(lib, "w", null, "french", "vs French");
  return lib;
};

describe("trainer library", () => {
  it("adds folders and lines where asked and finds them", () => {
    const lib = base();
    expect(LibrarySchema.parse(lib)).toEqual(lib);
    const at = findItem(lib, "line0001");
    expect(at?.color).toBe("w");
    expect(at?.parents.map((p) => p.name)).toEqual(["vs Sicilian", "Alapin"]);
    expect(at?.item).toMatchObject({ kind: "line", moves: "e2e4 c7c5 c2c3" });
    expect(allLines(lib).map((l) => l.line.name)).toEqual(["Alapin main line"]);
  });

  it("refuses a duplicate id, an unknown parent, a line as parent and the other colour", () => {
    const lib = base();
    expect(addFolder(lib, "w", null, "french", "again")).toBe(lib);
    expect(addFolder(lib, "w", "nowhere", "newone", "x")).toBe(lib);
    expect(addFolder(lib, "w", "line0001", "newone", "x")).toBe(lib);
    expect(addFolder(lib, "b", "sicilian", "newone", "x")).toBe(lib);
  });

  it("renames and removes (a folder with everything in it)", () => {
    const lib = renameItem(base(), "french", "  vs French Defence ");
    expect(findItem(lib, "french")?.item.name).toBe("vs French Defence");
    expect(renameItem(lib, "french", "   ")).toBe(lib);
    const gone = removeItem(lib, "sicilian");
    expect(findItem(gone, "line0001")).toBeNull();
    expect(gone.roots.w.map((i) => i.id)).toEqual(["french"]);
  });

  it("moves items between folders, but never into their own subtree", () => {
    const lib = base();
    const moved = moveItem(lib, "line0001", "french");
    expect(findItem(moved, "line0001")?.parents.map((p) => p.id)).toEqual(["french"]);
    expect(moveItem(lib, "sicilian", "alapin1")).toBe(lib);
    expect(moveItem(lib, "sicilian", "sicilian")).toBe(lib);
    expect(moveItem(lib, "alapin1", null).roots.w.map((i) => i.id)).toEqual([
      "sicilian",
      "french",
      "alapin1",
    ]);
  });

  it("caps nesting depth", () => {
    let lib = EMPTY_LIBRARY;
    let parent: string | null = null;
    for (let d = 0; d < LIBRARY_MAX_DEPTH; d++) {
      lib = addFolder(lib, "b", parent, `folder${d}`, `F${d}`);
      parent = `folder${d}`;
    }
    expect(addFolder(lib, "b", parent, "toodeep", "x")).toBe(lib);
    const r = LibrarySchema.safeParse({
      formatVersion: 1,
      roots: { w: [{ kind: "line", id: "bad", name: "x", moves: "" }], b: [] },
    });
    expect(r.error?.issues[0]?.path).toEqual(["roots", "w", 0, "id"]);
  });
});
