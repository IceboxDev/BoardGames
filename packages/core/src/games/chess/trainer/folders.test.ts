import { describe, expect, it } from "vitest";
import { applyMove } from "../engine/apply";
import { parseFen, START_FEN } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { moveToUci } from "../engine/uci";
import { fixedChoices, TRAINER_FOLDERS, type TrainerFolder } from "./folders";

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

  it("fixes your moves on the way into the farm's folders", () => {
    const fixed = fixedChoices("w").map((f) => `${f.moves.join(" ")}|${f.uci}`);
    expect(fixed).toContain("|e2e4");
    expect(fixed).toContain("e2e4 e7e5 g1f3 b8c6|f1b5");
    expect(fixed).toContain("e2e4 c7c6|d2d4");
    expect(fixed).toContain("e2e4 e7e5 g1f3 g8f6|f3e5");
    expect(new Set(fixed.map((f) => f.split("|")[0])).size).toBe(fixed.length);
  });
});
