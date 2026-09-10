// The end-of-game ladder in one pure function, shared by the engine
// (`scoring.ts`) and the match-history recorder so a hand-recorded night and
// an online game agree on who won: most points wins; a tie falls back to
// cubes on the map; a tie that still persists crowns a seated Emperor —
// "whether the Emperor Faction was playing or not" (a ruling, see
// `RULINGS.emperorWinsTiesOnlyIfTied`) — and with no Emperor at the table it
// is a draw. Placements put the winners first, so the Emperor taking the
// throne from outside the tie is rank 1 even below the top score.

import { RULINGS } from "./rulings";
import { CLAN_LABELS, CLANS } from "./types";

export type SensoTiebreak = "score" | "cubes" | "emperor" | "draw";

export interface StandingEntry {
  score: number;
  /** Cubes on the map at game end — 0 for the Emperor, who owns none. */
  cubes: number;
  emperor: boolean;
}

export interface SensoStandings {
  /** ≥ 1 entry; > 1 only on an unbreakable draw. */
  winners: number[];
  tiebreak: SensoTiebreak;
  /** `placements[i]` = 1-based standard-competition rank of entry i. */
  placements: number[];
}

export function resolveStandings(entries: readonly StandingEntry[]): SensoStandings {
  if (entries.length === 0) return { winners: [], tiebreak: "draw", placements: [] };
  const indices = entries.map((_, i) => i);
  const top = Math.max(...entries.map((e) => e.score));
  let tied = indices.filter((i) => entries[i].score === top);
  let tiebreak: SensoTiebreak = "score";
  if (tied.length > 1) {
    const topCubes = Math.max(...tied.map((i) => entries[i].cubes));
    tied = tied.filter((i) => entries[i].cubes === topCubes);
    tiebreak = "cubes";
  }
  if (tied.length > 1) {
    const emperor = indices.find((i) => entries[i].emperor);
    if (emperor !== undefined && (tied.includes(emperor) || !RULINGS.emperorWinsTiesOnlyIfTied)) {
      tied = [emperor];
      tiebreak = "emperor";
    } else {
      tiebreak = "draw";
    }
  }
  return { winners: tied, tiebreak, placements: placementsOf(entries, tied) };
}

/** Winners share rank 1; everyone else follows by (score, cubes, Emperor), ties sharing a rank. */
function placementsOf(entries: readonly StandingEntry[], winners: readonly number[]): number[] {
  const winnerSet = new Set(winners);
  const key = (i: number) => [entries[i].score, entries[i].cubes, entries[i].emperor ? 1 : 0];
  const sameKey = (a: number, b: number) => key(a).every((v, k) => v === key(b)[k]);
  const rest = entries
    .map((_, i) => i)
    .filter((i) => !winnerSet.has(i))
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return kb[k] - ka[k];
      return a - b;
    });
  const placements: number[] = entries.map(() => 1);
  let rank = winners.length + 1;
  rest.forEach((i, pos) => {
    const prev = rest[pos - 1];
    if (pos > 0 && prev !== undefined && !sameKey(prev, i)) rank = winners.length + pos + 1;
    placements[i] = rank;
  });
  return placements;
}

// ── Factions, as the match recorder names them ─────────────────────────

export const EMPEROR_FACTION = "Emperor";
export const CLAN_FACTIONS: readonly string[] = CLANS.map((clan) => CLAN_LABELS[clan]);

/** The factions a table of `playerCount` seats can hold: the four clans, plus the Emperor at five. */
export function factionsForTable(playerCount: number): readonly string[] {
  return playerCount >= 5 ? [...CLAN_FACTIONS, EMPEROR_FACTION] : CLAN_FACTIONS;
}
