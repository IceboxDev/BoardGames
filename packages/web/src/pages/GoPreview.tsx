import { chooseTsMove } from "@boardgames/core/games/go/ai/choose";
import { estimateDeadStones } from "@boardgames/core/games/go/estimate";
import { buildPlayerView } from "@boardgames/core/games/go/machine";
import { GoConfigSchema } from "@boardgames/core/games/go/manifest";
import {
  applyAction,
  applyAiMove,
  type GoSession,
  legalActionsFor,
  setProposal,
  startSession,
} from "@boardgames/core/games/go/session";
import type { GoAction } from "@boardgames/core/games/go/view";
import { useEffect, useState } from "react";
import GameBoard from "../games/go/components/GameBoard";
import GameOverScreen from "../games/go/components/GameOverScreen";
import { TIME_PRESETS, type TimePreset } from "../games/go/logic/options";

// Dev-only Go lab — the real board driven by the core session and the Pebble
// bot in the browser, no auth / WS, for headless captures:
//   /dev/go-preview?size=9                 — play Black against Pebble
//   /dev/go-preview?size=19&steps=120      — fast-forward 120 bot moves first
//   /dev/go-preview?size=9&steps=200&mode=scoring — straight into the scoring phase
//   /dev/go-preview?size=9&steps=200&mode=over    — the game-over screen
//   /dev/go-preview?time=rapid&handicap=4&size=19 — clock and handicap

const NAMES = ["You", "Pebble"];

function params() {
  const q = new URLSearchParams(window.location.search);
  const time = (q.get("time") ?? "none") as TimePreset;
  return {
    config: GoConfigSchema.parse({
      size: Number(q.get("size") ?? 9),
      handicap: Number(q.get("handicap") ?? 0),
      timeControl: (TIME_PRESETS[time] ?? TIME_PRESETS.none).control,
    }),
    steps: Number(q.get("steps") ?? 0),
    mode: q.get("mode") ?? "play",
  };
}

function botMove(s: GoSession, seed: number): GoSession {
  const point = chooseTsMove(s.game, "heuristic", { timeMs: 0, seed });
  return applyAction(
    s,
    s.game.toMove,
    point === null ? { type: "pass" } : { type: "play", point },
    Date.now(),
  );
}

function initial(): GoSession {
  const { config, steps, mode } = params();
  let s = startSession(config, [null, "heuristic"], 1, Date.now());
  for (let i = 0; i < steps && !s.scoring && !s.end; i++) s = botMove(s, i);
  if (mode === "scoring" || mode === "over") {
    while (!s.scoring && !s.end) s = applyAction(s, s.game.toMove, { type: "pass" }, Date.now());
    s = setProposal(s, estimateDeadStones(s.game, 200), Date.now());
  }
  if (mode === "over" && s.scoring && !s.end) {
    s = applyAction(s, 0, { type: "accept-score", key: "" }, Date.now());
  }
  return s;
}

export default function GoPreview() {
  const [s, setS] = useState<GoSession>(initial);

  // Pebble answers when it is White's move.
  useEffect(() => {
    if (s.end || s.scoring || s.game.toMove !== 1) return;
    const t = setTimeout(() => {
      const point = chooseTsMove(s.game, "heuristic", { timeMs: 0, seed: s.game.moves.length });
      setS((cur) => applyAiMove(cur, point, false, Date.now()));
    }, 250);
    return () => clearTimeout(t);
  }, [s]);

  const view = buildPlayerView(s, 0, Date.now());
  const send = (action: GoAction) => setS((cur) => applyAction(cur, 0, action, Date.now()));

  if (view.result) {
    return <GameOverScreen view={view} names={NAMES} actions={[]} />;
  }
  return (
    <div className="flex h-dvh flex-col bg-surface-950">
      <GameBoard view={view} legal={legalActionsFor(s, 0)} names={NAMES} vsAi send={send} />
    </div>
  );
}
