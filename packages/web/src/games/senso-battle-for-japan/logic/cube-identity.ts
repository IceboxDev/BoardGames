import type { Board, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLANS } from "@boardgames/core/games/senso-battle-for-japan/types";

// The engine's board is `(Clan | null)[][]` — cubes have no identity. To let a
// moved cube glide instead of remounting, reconcile the previous frame's ids
// against the new board: unchanged squares keep their id, a vanished + an
// appeared cube of one clan is a move, the rest are placements / retirements.
// Every legal action moves at most one cube per clan (plus at most a one-square
// gravity shift), so the pairing is exact frame to frame.

export interface CubePosition {
  clan: Clan;
  region: number;
  square: number;
}

export type CubeMap = Map<string, CubePosition>;

function nextId(clan: Clan, used: Set<string>): string {
  for (let i = 0; ; i++) {
    const id = `${clan}#${i}`;
    if (!used.has(id)) return id;
  }
}

export function reconcileCubeIds(prev: CubeMap | null, board: Board): CubeMap {
  const next: CubeMap = new Map();
  const used = new Set<string>(prev ? prev.keys() : []);

  for (const clan of CLANS) {
    const current: { region: number; square: number }[] = [];
    board.forEach((squares, region) => {
      squares.forEach((cube, square) => {
        if (cube === clan) current.push({ region, square });
      });
    });
    const previous = [...(prev ?? new Map<string, CubePosition>())].filter(
      ([, p]) => p.clan === clan,
    );

    // 1. Exact matches keep their id.
    const unmatchedPrev = new Map(previous);
    const unmatchedCurrent: { region: number; square: number }[] = [];
    for (const pos of current) {
      const hit = [...unmatchedPrev].find(
        ([, p]) => p.region === pos.region && p.square === pos.square,
      );
      if (hit) {
        next.set(hit[0], { clan, ...pos });
        unmatchedPrev.delete(hit[0]);
      } else {
        unmatchedCurrent.push(pos);
      }
    }
    // 2. Pair the rest: same region first (gravity shift), then anything (a move).
    for (const pos of unmatchedCurrent) {
      let hit = [...unmatchedPrev].find(([, p]) => p.region === pos.region);
      if (!hit) hit = [...unmatchedPrev][0];
      if (hit) {
        next.set(hit[0], { clan, ...pos });
        unmatchedPrev.delete(hit[0]);
      } else {
        const id = nextId(clan, used);
        used.add(id);
        next.set(id, { clan, ...pos });
      }
    }
    // 3. Leftover previous ids are retired (they exit).
  }
  return next;
}
