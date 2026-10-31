import { describe, expect, it } from "vitest";
import { applyMove } from "../engine/apply";
import { parseFen, START_FEN } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { moveToUci } from "../engine/uci";
import { TRAINER_FOLDERS, type TrainerFolder } from "./folders";

const all = (list: readonly TrainerFolder[]): TrainerFolder[] =>
  list.flatMap((f) => [f, ...all(f.children)]);

describe("trainer folders", () => {
  it("every folder is a legal line, unique, named by the convention", () => {
    const folders = all([...TRAINER_FOLDERS.w, ...TRAINER_FOLDERS.b]);
    expect(new Set(folders.map((f) => f.id)).size).toBe(folders.length);
    for (const f of folders) {
      let pos = parseFen(START_FEN);
      for (const uci of f.moves) {
        const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
        expect(move, `${f.name}: ${uci}`).toBeDefined();
        if (move) pos = applyMove(pos, move);
      }
      const ply = f.moves.length - 1;
      const number = Math.floor(ply / 2) + 1;
      expect(f.name.startsWith(ply % 2 === 0 ? `${number}.` : `${number}…`), f.name).toBe(true);
      expect(f.name.length, f.name).toBeLessThanOrEqual(26);
    }
  });

  it("coined names say where they come from", () => {
    const folders = all(TRAINER_FOLDERS.w);
    for (const name of ["1…b5 Pawn Gift", "2…Qh4 Queen Drop", "2…Ke7 Bongcloud"]) {
      expect(folders.find((f) => f.name === name)?.note).toMatch(/^Coined/);
    }
  });
});
