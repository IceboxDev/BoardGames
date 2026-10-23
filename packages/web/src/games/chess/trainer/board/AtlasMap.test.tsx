import type { Learning } from "@boardgames/core/games/chess/trainer/drill";
import { TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasMap } from "./AtlasMap";
import { flatten } from "./folder-tree";

const top = flatten(TRAINER_FOLDERS.w).filter((p) => p.parents.length === 0);
const first = top[0];

const l = (over: Partial<Learning>): Learning => ({
  learnt: 0,
  learning: 0,
  fresh: 0,
  due: 0,
  practisedToday: 0,
  pending: 0,
  pendingLines: 0,
  unasked: 0,
  unreached: 0,
  ...over,
});

beforeEach(() => {
  // jsdom has no layout: report a fixed box for the map.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private readonly cb: (e: { contentRect: { width: number; height: number } }[]) => void,
      ) {}
      observe() {
        this.cb([{ contentRect: { width: 800, height: 600 } }]);
      }
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("AtlasMap", () => {
  it("draws a block per folder with what you know, and selects one on click", () => {
    if (!first) throw new Error("no folders");
    const onSelect = vi.fn();
    render(
      <AtlasMap
        folders={[first]}
        learning={
          new Map([
            [
              first.folder.id,
              l({ learnt: 4, learning: 2, fresh: 10, due: 3, pending: 5, pendingLines: 5 }),
            ],
          ])
        }
        games={null}
        blocked={new Map()}
        showSmall={false}
        onShowSmall={() => {}}
        popularity={new Map()}
        selected={null}
        onSelect={onSelect}
        onOpen={() => {}}
      />,
    );
    const tile = screen.getByRole("button", {
      name: /4 of 16 moves learnt, 2 learning, 3 due today/,
    });
    expect(tile.textContent).toContain("4/16 learnt");
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith(first.folder.id);
  });

  it("says when there is nothing to learn yet", () => {
    render(
      <AtlasMap
        folders={top}
        learning={new Map()}
        games={null}
        blocked={new Map()}
        showSmall={false}
        onShowSmall={() => {}}
        popularity={new Map()}
        selected={null}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/Nothing here to learn yet/)).toBeTruthy();
  });
});
