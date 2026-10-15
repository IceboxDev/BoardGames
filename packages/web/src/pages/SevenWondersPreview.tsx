import { randomLegalAction } from "@boardgames/core/games/7-wonders/ai/random";
import {
  applyPendingAction,
  applyReveal,
  applySelection,
  applySideChoice,
  createInitialState,
} from "@boardgames/core/games/7-wonders/game-engine";
import { buildPlayerView } from "@boardgames/core/games/7-wonders/machine";
import { getLegalActions } from "@boardgames/core/games/7-wonders/rules";
import { determineWinner, scoreFinal } from "@boardgames/core/games/7-wonders/scoring";
import type {
  GameState,
  SevenWondersAction,
  SideMode,
} from "@boardgames/core/games/7-wonders/types";
import { createRng, type Rng } from "@boardgames/core/lib/rng";
import { useEffect, useMemo, useState } from "react";
import DiscardPickerOverlay from "../games/7-wonders/components/DiscardPickerOverlay";
import GameBoard from "../games/7-wonders/components/GameBoard";
import GameOverScreen from "../games/7-wonders/components/GameOverScreen";
import SidePicker from "../games/7-wonders/components/SidePicker";
import type { ViewId } from "../games/7-wonders/logic/table";

// Dev-only 7 Wonders lab — the real GameBoard driven by the core engine in the
// browser, no auth / WS, so the board can be played and captured headlessly:
//   /dev/seven-wonders-preview?players=5&edifice=1&seed=3&turn=12&view=table
// Seat 0 is you; the rest play random legal moves. `turn=N` fast-forwards N
// reveals with every seat random; `auto=1` lets the AI play your seat too;
// `side=A|B|choose` (choose opens the side picker); `war=1` replays the latest war on load; `frame=WxH` renders in
// an iframe of that CSS size (phone shots — headless windows can't go < 500px);
// `built=1` shows every Edifice project as built (their finished art);
// `over=1` plays the game out and shows the results screen; `pick=1` opens
// Halikarnassos's discard pick over the board (with the peek toggle).

function params() {
  const q = new URLSearchParams(window.location.search);
  const view = q.get("view");
  return {
    players: Math.min(7, Math.max(3, Number(q.get("players") ?? 5))),
    seed: Number(q.get("seed") ?? 3),
    edifice: q.get("edifice") === "1",
    side: (["A", "B", "choose"].includes(q.get("side") ?? "")
      ? q.get("side")
      : "random") as SideMode,
    turns: Number(q.get("turn") ?? 0),
    auto: q.get("auto") === "1",
    war: q.get("war") === "1",
    built: q.get("built") === "1",
    over: q.get("over") === "1",
    pick: q.get("pick") === "1",
    view: (["city", "table", "overview", "edifice", "chains"].includes(view ?? "")
      ? view
      : undefined) as ViewId | undefined,
  };
}

/** One step of every seat that isn't waiting on you. */
function step(state: GameState, rng: Rng, human: boolean): GameState {
  if (state.phase === "revealing") return applyReveal(state);
  if (state.phase === "choosing-sides") {
    let s = state;
    for (let i = 1; i < s.playerCount; i++) {
      if (s.phase === "choosing-sides" && s.sideChoices?.[i] === null) {
        s = applySideChoice(s, i, { type: "choose-side", side: s.players[i].side });
      }
    }
    return s;
  }
  if (state.phase === "pending") {
    const p = state.pendingQueue[0]?.playerIndex ?? 0;
    if (p === 0 && human) return state;
    const a = randomLegalAction(state, p, rng);
    return a ? applyPendingAction(state, p, a) : state;
  }
  if (state.phase === "selecting") {
    let s = state;
    for (let i = 0; i < s.playerCount; i++) {
      if (s.selections[i] !== null || (i === 0 && human)) continue;
      const a = randomLegalAction(s, i, rng);
      if (a) s = applySelection(s, i, a);
    }
    return s;
  }
  return state;
}

function start(rng: Rng): GameState {
  const p = params();
  let state = createInitialState({
    playerCount: p.players,
    seed: p.seed,
    sideMode: p.side,
    edifice: p.edifice,
  });
  let reveals = 0;
  const turns = p.over ? Number.POSITIVE_INFINITY : p.turns;
  for (let i = 0; i < 5000 && reveals < turns && state.phase !== "game-over"; i++) {
    if (state.phase === "revealing") reveals++;
    state = step(state, rng, false);
  }
  return state;
}

const asContext = (gameState: GameState) => ({
  gameState,
  strategies: [],
  humanPlayers: [0],
  pendingAiSelections: null,
});

export default function SevenWondersPreview() {
  const p = useMemo(params, []);
  const rng = useMemo(() => createRng(p.seed * 7919 + 1), [p.seed]);
  const [state, setState] = useState<GameState>(() => start(rng));
  const frame = new URLSearchParams(window.location.search).get("frame");

  // The others pick at once; the reveal follows a beat later, as on the server.
  useEffect(() => {
    if (state.phase === "game-over") return;
    const t = setTimeout(
      () => setState((s) => step(s, rng, !p.auto)),
      state.phase === "revealing" ? 900 : 300,
    );
    return () => clearTimeout(t);
  }, [state, rng, p.auto]);

  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    const inner = new URLSearchParams(window.location.search);
    inner.delete("frame");
    const qs = inner.toString();
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + (qs ? `?${qs}` : "")}
        style={{ width: w || 360, height: h || 640, border: "1px solid #333" }}
      />
    );
  }

  const real = buildPlayerView(asContext(state), 0);
  const view = p.built
    ? { ...real, edifices: real.edifices?.map((e) => ({ ...e, status: "built" as const })) }
    : real;
  const over = state.phase === "game-over";
  if (p.over && over) {
    const breakdowns = scoreFinal(state);
    return (
      <div className="flex h-dvh flex-col">
        <GameOverScreen
          result={{
            breakdowns,
            totals: breakdowns.map((b) => b.total),
            winner: determineWinner(state, breakdowns),
          }}
          view={view}
          myIndex={0}
          seatNames={["You"]}
          actions={[
            { label: "Play again", variant: "primary", onClick: () => {} },
            { label: "Back to menu", variant: "secondary", onClick: () => {} },
          ]}
        />
      </div>
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      <GameBoard
        view={view}
        myIndex={0}
        legalActions={over ? [] : getLegalActions(state, 0)}
        onAction={(action: SevenWondersAction) =>
          setState((s) =>
            s.phase === "pending" ? applyPendingAction(s, 0, action) : applySelection(s, 0, action),
          )
        }
        isGameOver={over}
        initialView={p.view}
        replayWar={p.war}
      />
      {state.phase === "choosing-sides" && (
        <SidePicker
          view={view}
          myIndex={0}
          seatNames={["You"]}
          onAction={(action) => setState((s) => applySideChoice(s, 0, action))}
        />
      )}
      {p.pick && (
        <DiscardPickerOverlay
          pickActions={[...new Set(state.discard)].map((cardId) => ({
            type: "pick-discard" as const,
            cardId,
          }))}
          onPick={() => {}}
          onSkip={() => {}}
        />
      )}
    </div>
  );
}
