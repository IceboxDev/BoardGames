import type { CodenamesScanResponse } from "@boardgames/core/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  boardReducer,
  cardAt,
  companionGridCards,
  teamCounts,
  unsureCount,
} from "./companion-state";
import { loadBoard, STORAGE_KEY } from "./useCompanionBoard";

function scan(): CodenamesScanResponse {
  const cells = Array.from({ length: 25 }, (_, i) => ({
    word: `W${i}`,
    sure: true,
    cover: null as "red" | "blue" | "bystander" | null,
  }));
  cells[0] = { word: "STRAẞE", sure: true, cover: null };
  cells[1] = { word: "GR0SSE", sure: false, cover: null };
  cells[2] = { word: "", sure: true, cover: "red" };
  return { language: "de", cells };
}

const scanned = () => boardReducer(null, { type: "scanned", scan: scan() });

afterEach(() => localStorage.clear());

describe("companion board", () => {
  it("starts from the scan, covers already on the table included", () => {
    const board = scanned();
    expect(board?.cells[0]?.word).toBe("STRAẞE");
    expect(board?.covers[2]).toBe("red");
    expect(board?.language).toBe("de");
    expect(board && unsureCount(board)).toBe(1);
  });

  it("covers and clears a card, and counts agents left once the starter is known", () => {
    let board = scanned();
    board = boardReducer(board, { type: "cover", card: 5, cover: "blue" });
    board = boardReducer(board, { type: "cover", card: 6, cover: "bystander" });
    if (!board) throw new Error("no board");
    expect(teamCounts(board)).toEqual([
      { team: 0, covered: 1, left: null },
      { team: 1, covered: 1, left: null },
    ]);
    board = boardReducer(board, { type: "setStarter", starter: 1 });
    if (!board) throw new Error("no board");
    expect(teamCounts(board).map((t) => t.left)).toEqual([7, 8]);
    board = boardReducer(board, { type: "cover", card: 5, cover: null });
    expect(board?.covers[5]).toBeNull();
  });

  it("toggles a mark, and a fixed word is no longer in doubt", () => {
    let board = boardReducer(scanned(), { type: "mark", card: 3 });
    expect(board?.marks[3]).toBe(true);
    board = boardReducer(board, { type: "mark", card: 3 });
    expect(board?.marks[3]).toBe(false);
    board = boardReducer(board, { type: "fixWord", card: 1, word: " grösse " });
    expect(board?.cells[1]).toEqual({ word: "GRÖSSE", sure: true });
    // A blank fix changes nothing.
    expect(boardReducer(board, { type: "fixWord", card: 1, word: "  " })).toBe(board);
  });

  it("turns the grid round: the last card shows first", () => {
    const board = boardReducer(scanned(), { type: "rotate" });
    if (!board) throw new Error("no board");
    expect(cardAt(board, 0)).toBe(24);
    const cards = companionGridCards(board, 24);
    expect(cards[0]).toMatchObject({ word: "W24", selected: true });
    expect(cards[24]).toMatchObject({ word: "STRAẞE" });
    expect(cards[22]).toMatchObject({ cover: "red" });
    expect(cards[23]).toMatchObject({ unsure: true });
  });

  it("survives a reload, and ignores a stored board it can't read", () => {
    const board = scanned();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    expect(loadBoard()).toEqual(board);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cells: [] }));
    expect(loadBoard()).toBeNull();
    expect(boardReducer(board, { type: "reset" })).toBeNull();
  });
});
