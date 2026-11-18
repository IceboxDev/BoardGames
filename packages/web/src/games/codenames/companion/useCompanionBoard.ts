import { useEffect, useReducer } from "react";
import { type Board, type BoardAction, BoardSchema, boardReducer } from "./companion-state";

// The companion's board, kept on this phone across reloads and a locked
// screen. Nothing leaves the device: other players have their own.

export const STORAGE_KEY = "codenames-companion:v1";

export function loadBoard(): Board | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = BoardSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function storeBoard(board: Board | null): void {
  try {
    if (board === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Private mode / storage full: the board still works, it just won't survive a reload.
  }
}

export function useCompanionBoard(): [Board | null, (action: BoardAction) => void] {
  const [board, dispatch] = useReducer(boardReducer, null, loadBoard);
  useEffect(() => storeBoard(board), [board]);
  return [board, dispatch];
}
