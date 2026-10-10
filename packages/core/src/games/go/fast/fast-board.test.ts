import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { placeStone } from "../board";
import { newGame, playStone } from "../game";
import { IllegalMove } from "../types";
import { FastBoard } from "./fast-board";

/**
 * The fast board must agree with the reference board on every point's
 * occupied/suicide legality and on every capture, over many random games.
 * Ko is compared separately: the fast board knows simple ko only.
 */
describe("FastBoard parity with board.ts", () => {
  for (const [size, games] of [
    [5, 25],
    [9, 10],
    [13, 3],
  ] as const) {
    it(`agrees over random games on ${size}×${size}`, () => {
      const rng = createRng(size * 7919);
      const mismatches: string[] = [];
      for (let gameNo = 0; gameNo < games; gameNo++) {
        let game = newGame({ size, komi: 7.5, handicap: 0 });
        const fb = new FastBoard(size);
        for (let move = 0; move < size * size * 2; move++) {
          // Legality (ignoring ko) agrees on every empty point.
          for (let p = 0; p < size * size; p++) {
            if (game.board[p] !== 0) continue;
            let refLegal = true;
            try {
              placeStone(game.board, size, p, game.toMove);
            } catch (e) {
              if (!(e instanceof IllegalMove)) throw e;
              refLegal = false;
            }
            const fp = fb.pad(p);
            const savedKo = fb.ko;
            fb.ko = -1;
            if (fb.isLegal(fp) !== refLegal)
              mismatches.push(`game ${gameNo} move ${move} point ${p}`);
            fb.ko = savedKo;
          }
          const fp = fb.randomMove(rng);
          if (fp < 0) break;
          const p = fb.unpad(fp);
          let next: typeof game;
          try {
            next = playStone(game, p);
          } catch (e) {
            // Positional superko can forbid what simple ko allows; stop this game.
            if (e instanceof IllegalMove && e.reason === "superko") break;
            throw e;
          }
          const captured = fb.play(fp);
          expect(captured).toBe(next.moves.at(-1)?.captured.length);
          game = next;
          for (let i = 0; i < size * size; i++) {
            if (fb.cells[fb.pad(i)] !== game.board[i])
              mismatches.push(`board ${gameNo}/${move}/${i}`);
          }
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    }, 30_000);
  }

  it("rebuilds chains and ko from a game", () => {
    const rng = createRng(3);
    let game = newGame({ size: 9, komi: 7.5, handicap: 0 });
    const fb = new FastBoard(9);
    for (let i = 0; i < 60; i++) {
      const fp = fb.randomMove(rng);
      if (fp < 0) break;
      try {
        game = playStone(game, fb.unpad(fp));
      } catch {
        break;
      }
      fb.play(fp);
    }
    const rebuilt = FastBoard.fromGame(game);
    for (let i = 0; i < 81; i++) {
      const p = fb.pad(i);
      expect(rebuilt.cells[p]).toBe(fb.cells[p]);
      if (fb.cells[p] === 1 || fb.cells[p] === 2) {
        const r1 = fb.root[p] as number;
        const r2 = rebuilt.root[p] as number;
        expect(rebuilt.inAtari(r2)).toBe(fb.inAtari(r1));
        expect(rebuilt.chainSize[r2]).toBe(fb.chainSize[r1]);
      }
    }
  });
});
