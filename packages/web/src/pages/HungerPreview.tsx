import { pickAiAction } from "@boardgames/core/games/the-hunger/ai-strategies";
import { applyActionPure, createInitialState } from "@boardgames/core/games/the-hunger/game-engine";
import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { getActivePlayer, getLegalActions } from "@boardgames/core/games/the-hunger/rules";
import type { Action, AIStrategyId, GameState } from "@boardgames/core/games/the-hunger/types";
import { useEffect, useState } from "react";
import GameBoard from "../games/the-hunger/components/GameBoard";
import GameOverScreen from "../games/the-hunger/components/GameOverScreen";

// Dev-only The Hunger lab — the real GameBoard / GameOverScreen driven by the
// core engine and AI in the browser, no auth / WS, so the board can be played
// and captured headlessly: /dev/hunger-preview?players=4&mode=rookie&seed=7
// Seat 0 is you; `&auto=1` lets the AI play your seat too.

function params() {
  const q = new URLSearchParams(window.location.search);
  const players = Math.min(6, Math.max(2, Number(q.get("players") ?? 4)));
  return {
    players,
    mode: q.get("mode") === "rookie" ? ("rookie" as const) : ("elder" as const),
    seed: Number(q.get("seed") ?? 7),
    auto: q.get("auto") === "1",
    /** Fast-forward: let the AI play every seat until this turn. */
    skipTo: Number(q.get("turn") ?? 0),
  };
}

function start(): GameState {
  const p = params();
  const strategies: (AIStrategyId | null)[] = [p.auto ? "heuristic-v1" : null];
  for (let i = 1; i < p.players; i++) strategies.push(i % 2 ? "heuristic-v1" : "random");
  let state = createInitialState({
    playerCount: p.players,
    strategies,
    seed: p.seed,
    options: { mode: p.mode },
  });
  if (p.skipTo > 0) {
    for (let i = 0; i < 20000 && state.phase !== "game-over" && state.turn < p.skipTo; i++) {
      state = applyActionPure(state, getActivePlayer(state), pickAiAction(state));
    }
  }
  return state;
}

export default function HungerPreview() {
  const [state, setState] = useState<GameState>(start);
  const active = getActivePlayer(state);
  const aiTurn = state.phase !== "game-over" && state.players[active]?.type === "ai";

  // biome-ignore lint/correctness/useExhaustiveDependencies: each new state schedules the next AI step
  useEffect(() => {
    if (!aiTurn) return;
    const t = setTimeout(() => {
      setState((s) => applyActionPure(s, getActivePlayer(s), pickAiAction(s)));
    }, 250);
    return () => clearTimeout(t);
  }, [aiTurn, state]);

  const view = buildPlayerView(state, 0);
  if (state.result) {
    return (
      <GameOverScreen
        view={view}
        result={state.result}
        names={[]}
        onMenu={() => setState(start())}
        onPlayAgain={() => setState(start())}
      />
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      <GameBoard
        view={view}
        legalActions={active === 0 ? getLegalActions(state, 0) : []}
        isMyTurn={active === 0}
        isAiThinking={aiTurn}
        playerNames={[]}
        onAction={(action: Action) => setState((s) => applyActionPure(s, 0, action))}
      />
    </div>
  );
}
