// ---------------------------------------------------------------------------
// Rebuilding a finished game from its replay log, and a behaviour report.
//
// A stored replay keeps the seed, options, strategies and the engine's log —
// not the actions. The engine is deterministic from the seed, so the actions
// are recovered by a depth-first search over legal actions, keeping only those
// whose log entries match the recorded ones. Choices that log nothing (a
// Mission keep logs only a count) are steered by the final breakdown and the
// Instants the seat fired later, and backtracked if they go wrong.
//
// The behaviour counters mirror cpp/the-hunger/src/behave.cpp, so a human's
// games and the bots' benches are measured the same way.
// ---------------------------------------------------------------------------

import { graphFor, space } from "./board";
import { cardDef } from "./content/cards";
import { applyActionPure, createInitialState, TURNS } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { Action, AIStrategyId, GameOptions, GameState, LogEntry, Region } from "./types";

export interface StoredReplay {
  seed: number;
  options: Partial<GameOptions>;
  strategies: (AIStrategyId | null)[];
  log: LogEntry[];
  breakdown: { missions: { id: string }[] }[];
}

export interface RebuiltStep {
  /** State before the action. */
  state: GameState;
  seat: number;
  action: Action;
  /** How many legal actions the seat had. */
  options: number;
}

/** The game's action sequence, or null if the log cannot be matched. */
export function rebuildReplay(rep: StoredReplay, maxCalls = 2_000_000): RebuiltStep[] | null {
  const target = rep.log.map((e) => JSON.stringify(e));
  const start = createInitialState({
    playerCount: rep.strategies.length,
    strategies: rep.strategies,
    seed: rep.seed,
    options: rep.options,
  });
  const matches = (s: GameState, from: number) => {
    if (s.log.length > target.length) return false;
    for (let i = from; i < s.log.length; i++)
      if (JSON.stringify(s.log[i]) !== target[i]) return false;
    return true;
  };
  if (!matches(start, 0)) return null;
  const allowed = rep.breakdown.map(
    (b, p) =>
      new Set([
        ...b.missions.map((m) => m.id),
        ...rep.log.flatMap((e) => (e.t === "instant" && e.p === p ? [e.mission] : [])),
      ]),
  );
  const path: RebuiltStep[] = [];
  let calls = 0;
  const dfs = (s: GameState, idle: number): boolean => {
    if (++calls > maxCalls) return false;
    if (s.phase === "game-over") return s.log.length === target.length;
    if (idle > 6) return false;
    const seat = getActivePlayer(s);
    const legal = [...getLegalActions(s, seat)];
    // Mission keeps log only a count: prefer sets that hold what the seat fires
    // later as an Instant, then sets inside its final breakdown.
    const future = new Set(
      rep.log
        .slice(s.log.length)
        .flatMap((e) => (e.t === "instant" && e.p === seat ? [e.mission] : [])),
    );
    const miss = (a: Action) =>
      a.type !== "keep-missions"
        ? 0
        : 100 * [...future].filter((m) => !a.keep.includes(m)).length +
          a.keep.filter((m) => !allowed[seat]?.has(m)).length;
    legal.sort((x, y) => miss(x) - miss(y));
    for (const action of legal) {
      let next: GameState;
      try {
        next = applyActionPure(s, seat, action);
      } catch {
        continue;
      }
      if (!matches(next, s.log.length)) continue;
      path.push({ state: s, seat, action, options: legal.length });
      if (dfs(next, next.log.length > s.log.length ? 0 : idle + 1)) return true;
      path.pop();
      if (calls > maxCalls) return false;
    }
    return false;
  };
  return dfs(start, 0) ? path : null;
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

const REGIONS: Region[] = ["castle", "cemetery", "mountains", "plains", "forest"];

export interface SeatBehaviour {
  won: number;
  survived: boolean;
  score: number;
  roseTurn: number | null;
  labyrinth: boolean;
  tavern: boolean;
  tavernHunts: number;
  tavernCards: number;
  chests: number;
  digests: number;
  missionDraws: Record<Region, number>;
  hunts: number;
  humans: number;
  familiars: number;
  powers: number;
  confuse: number;
  earlyFamPow: number;
  earlyConfuse: number;
  /** Turn starts per phase (turns 1–5, 6–10, 11–15) × region. */
  turnRegion: Record<Region, number>[];
  maxCastleDist: number;
  parasolTurns: number;
}

const zeroRegions = (): Record<Region, number> => ({
  castle: 0,
  cemetery: 0,
  mountains: 0,
  plains: 0,
  forest: 0,
});

/** Per-seat behaviour over a rebuilt game (same definitions as behave.cpp). */
export function behaviourOf(steps: readonly RebuiltStep[], end: GameState): SeatBehaviour[] {
  const g = graphFor(end.options);
  const n = end.players.length;
  const seats: SeatBehaviour[] = Array.from({ length: n }, () => ({
    won: 0,
    survived: false,
    score: 0,
    roseTurn: null,
    labyrinth: false,
    tavern: false,
    tavernHunts: 0,
    tavernCards: 0,
    chests: 0,
    digests: 0,
    missionDraws: zeroRegions(),
    hunts: 0,
    humans: 0,
    familiars: 0,
    powers: 0,
    confuse: 0,
    earlyFamPow: 0,
    earlyConfuse: 0,
    turnRegion: [zeroRegions(), zeroRegions(), zeroRegions()],
    maxCastleDist: 0,
    parasolTurns: 0,
  }));
  const phaseOf = (turn: number) => (turn <= 5 ? 0 : turn <= 10 ? 1 : 2);
  const states = [...steps.map((s) => s.state), end];
  steps.forEach((step, k) => {
    const before = step.state;
    const after = states[k + 1];
    const st = seats[step.seat];
    for (let i = 0; i < n; i++) {
      const started =
        after.current?.player === i && (before.current?.player !== i || before.turn !== after.turn);
      if (started) {
        seats[i].turnRegion[phaseOf(Math.min(after.turn, TURNS))][
          space(g, after.players[i].pos).region
        ]++;
      }
      const pos = after.players[i].pos;
      if (pos === g.labyrinth) seats[i].labyrinth = true;
      if (space(g, pos).effect === "tavern") seats[i].tavern = true;
      seats[i].maxCastleDist = Math.max(seats[i].maxCastleDist, g.castleDist.get(pos) ?? 0);
    }
    const a = step.action;
    if (a.type === "hunt-rose") st.roseTurn = before.turn;
    if (a.type === "hunt-tavern") {
      st.tavernHunts++;
      st.tavernCards += before.tavern.length;
    }
    for (const [id, token] of Object.entries(before.chests))
      if (token !== null && after.chests[id] === null) st.chests++;
    st.digests +=
      after.players[step.seat].digested.length - before.players[step.seat].digested.length;
    const source = before.current?.missionPick?.source;
    if (a.type === "keep-missions" && source) st.missionDraws[space(g, source).region]++;
    if (a.type === "hunt") {
      st.hunts++;
      const early = before.turn <= 5;
      for (const id of before.track[a.row][a.col]) {
        const d = cardDef(id);
        if (d.type === "human") st.humans++;
        if (d.type === "familiar" || d.type === "power") {
          if (d.type === "familiar") st.familiars++;
          else st.powers++;
          if (early) st.earlyFamPow++;
        }
        if (d.keywords.includes("confuse")) {
          st.confuse++;
          if (early) st.earlyConfuse++;
        }
      }
    }
    if (a.type === "end-turn" && before.current?.extraTurn) st.parasolTurns++;
  });
  const r = end.result;
  if (r) {
    for (let i = 0; i < n; i++) {
      seats[i].won = r.winners.includes(i) ? 1 / r.winners.length : 0;
      seats[i].survived = r.breakdown[i].fate !== "ashes";
      seats[i].score = r.scores[i];
    }
  }
  return seats;
}

export { REGIONS };
