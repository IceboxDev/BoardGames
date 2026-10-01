import { decideAction } from "@boardgames/core/games/the-resistance/ai-strategies";
import {
  applyAction,
  createInitialState,
  getLegalActions,
  pendingSeats,
} from "@boardgames/core/games/the-resistance/game-engine";
import { buildPlayerView } from "@boardgames/core/games/the-resistance/player-view";
import { tablePosition } from "@boardgames/core/games/the-resistance/rules";
import type { GameState, ResistanceAction } from "@boardgames/core/games/the-resistance/types";
import { createRng } from "@boardgames/core/lib/rng";
import { useEffect, useMemo, useState } from "react";
import { ResistanceBoard } from "../games/the-resistance/components/board/ResistanceBoard";
import { GameOver } from "../games/the-resistance/components/GameOver";
import { ReplayDashboard } from "../games/the-resistance/components/ResistanceReplay";
import { TableEditor } from "../games/the-resistance/components/solver/TableEntry";
import type { SavedTable } from "../games/the-resistance/logic/storage";
import { emptyRecord } from "../games/the-resistance/logic/table-entry";

// Dev-only Resistance lab — the real board and Solver driven by the core
// engine and bots in the browser, no auth / WS, for headless captures:
//   /dev/resistance-preview?players=7&seed=3            — play seat 0 vs bots
//   /dev/resistance-preview?players=7&seed=3&steps=40   — fast-forward 40 bot moves first
//   /dev/resistance-preview?players=7&seed=3&mode=solver — a finished bot game in the Solver
//   /dev/resistance-preview?players=7&seed=3&mode=table  — the tabletop entry screen on it
//   /dev/resistance-preview?mode=table&fresh=1          — a new tabletop game (roster setup)

const NAMES = ["You", "Ada", "Bo", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy"];

function params() {
  const q = new URLSearchParams(window.location.search);
  return {
    players: Math.min(10, Math.max(5, Number(q.get("players") ?? 7))),
    seed: Number(q.get("seed") ?? 3),
    steps: Number(q.get("steps") ?? 0),
    mode:
      q.get("mode") === "solver"
        ? ("solver" as const)
        : q.get("mode") === "table"
          ? ("table" as const)
          : ("board" as const),
    targeting: q.get("targeting") === "1",
  };
}

/** The seat that acts next, or null when a person must. */
function nextBotSeat(gs: GameState): number | null {
  if (gs.phase === "game-over") return null;
  const seats = gs.phase === "proposing" ? [tablePosition(gs.record).leader] : pendingSeats(gs);
  return seats.find((s) => gs.strategies[s] !== null) ?? null;
}

function botStep(gs: GameState, rng: () => number, seat: number): GameState {
  const strategy = gs.strategies[seat] ?? "analyst";
  return applyAction(
    gs,
    seat,
    decideAction(strategy, buildPlayerView(gs, seat), getLegalActions(gs, seat), rng),
  );
}

function start(allBots: boolean): GameState {
  const p = params();
  const rng = createRng(p.seed * 31);
  let gs = createInitialState({
    playerCount: p.players,
    strategies: Array.from({ length: p.players }, (_, i) =>
      i === 0 && !allBots ? null : "analyst",
    ),
    variants: { targeting: p.targeting, blindSpies: false },
    seed: p.seed,
  });
  const limit = allBots ? 10_000 : p.steps;
  for (let i = 0; i < limit; i++) {
    const seat = nextBotSeat(gs);
    if (seat === null) break;
    gs = botStep(gs, rng, seat);
  }
  return gs;
}

export default function ResistancePreview() {
  const p = params();
  if (p.mode === "solver") return <SolverLab />;
  if (p.mode === "table") return <TableLab />;
  return <BoardLab />;
}

function SolverLab() {
  const gs = useMemo(() => start(true), []);
  const log = { ...gs.record, formatVersion: 1 as const, seed: params().seed };
  return <ReplayDashboard record={log} names={NAMES.slice(0, gs.record.playerCount)} />;
}

/** The tabletop entry screen on a bot game's record, roles known from the start. */
function TableLab() {
  const [table, setTable] = useState<SavedTable>(() => {
    if (new URLSearchParams(window.location.search).get("fresh") === "1") {
      return {
        id: "preview",
        title: "New game",
        updatedAt: 0,
        me: null,
        knownSpies: [],
        roster: ["Ada", "Bo"],
        record: emptyRecord(),
      };
    }
    const gs = start(true);
    const names = NAMES.slice(0, gs.record.playerCount);
    return {
      id: "preview",
      title: "Preview game",
      updatedAt: 0,
      me: null,
      knownSpies: [],
      roster: names,
      record: { ...gs.record, names },
    };
  });
  return <TableEditor table={table} onChange={setTable} />;
}

function BoardLab() {
  const [state, setState] = useState<GameState>(() => start(false));
  const rng = useMemo(() => createRng(params().seed * 97), []);
  const bot = nextBotSeat(state);

  // biome-ignore lint/correctness/useExhaustiveDependencies: each new state schedules the next bot step
  useEffect(() => {
    if (bot === null) return;
    const t = setTimeout(() => setState((s) => botStep(s, rng, bot)), 350);
    return () => clearTimeout(t);
  }, [bot, state]);

  const names = NAMES.slice(0, state.record.playerCount);
  const view = buildPlayerView(state, 0);
  if (state.phase === "game-over") {
    return <GameOver view={view} result={null} names={names} actions={[]} />;
  }
  return (
    <ResistanceBoard
      view={view}
      legalActions={getLegalActions(state, 0)}
      names={names}
      isAiThinking={bot !== null}
      onAction={(action: ResistanceAction) => setState((s) => applyAction(s, 0, action))}
    />
  );
}
