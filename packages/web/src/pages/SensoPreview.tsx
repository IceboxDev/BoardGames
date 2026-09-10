import { pickAiAction } from "@boardgames/core/games/senso-battle-for-japan/ai-strategies";
import {
  applyAction,
  createInitialState,
  settleTrick,
} from "@boardgames/core/games/senso-battle-for-japan/game-engine";
import { buildPlayerView } from "@boardgames/core/games/senso-battle-for-japan/player-view";
import {
  getActivePlayer,
  getLegalActions,
} from "@boardgames/core/games/senso-battle-for-japan/rules";
import type { GameState } from "@boardgames/core/games/senso-battle-for-japan/types";
import { useEffect, useMemo, useState } from "react";
import "../games/senso-battle-for-japan/senso.css";
import GameBoard from "../games/senso-battle-for-japan/components/GameBoard";
import GameOverScreen from "../games/senso-battle-for-japan/components/GameOverScreen";
import type { PickerState } from "../games/senso-battle-for-japan/logic/reward-picker";

// Dev-only Sensō board preview — the real GameBoard / GameOverScreen fed a
// deterministic mid-game state driven through the actual core engine and AI,
// no auth / WS. Exists so laptop + phone layouts can be captured headlessly
// (the DecryptoPreview pattern): /dev/senso-preview?scene=<name>&frame=WxH
// Scenes: trick | settle | rewards | rewards-balance | rewards-emperor | rewards-emperor-clan |
//         rewards-spectate | bonus | gameover | replay (advances one reward
//         every 700 ms — exercises cube animation; the engine board is printed)

const NAMES: (string | null)[] = ["Mantas", null, "Aydan", null, null];

/** Drive every seat with the AI until `stop` holds (or the game ends). */
function driveUntil(state: GameState, stop: (s: GameState) => boolean, maxSteps = 6000): GameState {
  for (let i = 0; i < maxSteps && state.phase !== "game-over"; i++) {
    if (stop(state)) return state;
    if (state.phase === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const seat = getActivePlayer(state);
    applyAction(state, pickAiAction(state, seat, state.players[seat].aiStrategy ?? "heuristic-v1"));
  }
  return state;
}

function fourPlayer(seed: number): GameState {
  return createInitialState(4, [null, "heuristic-v1", "aggressive", "random"], seed);
}

/** A 5-player game where the local seat drew the Emperor. */
function emperorGame(): GameState {
  for (let seed = 1; seed < 200; seed++) {
    const s = createInitialState(
      5,
      [null, "heuristic-v1", "aggressive", "random", "heuristic-v1"],
      seed,
    );
    if (s.players[0].clan === null) return s;
  }
  throw new Error("no Emperor seed found");
}

interface Scene {
  state: GameState;
  picker?: PickerState;
}

const SCENES: Record<string, () => Scene> = {
  trick: () => ({
    state: driveUntil(
      fourPlayer(7),
      (s) => s.round >= 2 && s.phase === "trick" && s.turn === 0 && s.table.length >= 2,
    ),
  }),
  settle: () => ({
    state: driveUntil(fourPlayer(7), (s) => s.round >= 2 && s.phase === "trick-settle"),
  }),
  rewards: () => ({
    state: driveUntil(
      fourPlayer(7),
      (s) => s.phase === "rewards" && s.rewardQueue[0]?.player === 0,
    ),
  }),
  "rewards-balance": () => ({
    state: driveUntil(
      fourPlayer(7),
      (s) => s.phase === "rewards" && s.rewardQueue[0]?.player === 0,
    ),
    picker: { step: "balance-source" },
  }),
  "rewards-emperor": () => ({
    state: driveUntil(
      emperorGame(),
      (s) => s.phase === "rewards" && s.rewardQueue[0]?.player === 0,
    ),
  }),
  "rewards-emperor-clan": () => ({
    state: driveUntil(
      emperorGame(),
      (s) => s.phase === "rewards" && s.rewardQueue[0]?.player === 0,
    ),
    picker: { step: "clan", kind: "balance" },
  }),
  "rewards-spectate": () => ({
    state: driveUntil(
      fourPlayer(7),
      (s) => s.phase === "rewards" && s.rewardQueue[0]?.player !== 0 && s.affected.length > 0,
    ),
  }),
  bonus: () => ({
    state: driveUntil(fourPlayer(7), (s) => s.phase === "bonus" && s.bonusQueue[0] === 0),
  }),
  gameover: () => ({ state: driveUntil(fourPlayer(7), () => false) }),
};

function countBoardChanges(state: GameState): number {
  return state.log.filter((e) => e.kind === "reward" || e.kind === "bonus").length;
}

/** The deterministic game replayed up to its n-th board-changing reward. */
function stateAfterRewards(n: number): GameState {
  return driveUntil(fourPlayer(7), (s) => countBoardChanges(s) >= n);
}

function boardLetters(state: GameState): string {
  return state.board
    .map((squares, r) => `${r + 1}:${squares.map((c) => (c ? c[0] : ".")).join("")}`)
    .join("  ");
}

function ReplayScene() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 700);
    return () => clearInterval(id);
  }, []);
  const state = useMemo(() => stateAfterRewards(step), [step]);
  const view = buildPlayerView(state, 0);
  return (
    <div className="flex h-screen flex-col bg-surface-950">
      <pre className="shrink-0 px-3 py-1 text-3xs text-fg-muted">{`step ${step} · engine ${boardLetters(state)}`}</pre>
      <GameBoard
        view={view}
        legalActions={[]}
        isMyTurn={false}
        isAiThinking={false}
        playerNames={NAMES}
        onAction={() => {}}
      />
    </div>
  );
}

export default function SensoPreview() {
  const params = new URLSearchParams(window.location.search);
  // ?frame=WxH — render inside an iframe of that CSS size so a headless
  // browser (500px minimum window width) still lays out a true phone viewport.
  const frame = params.get("frame");
  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + window.location.search.replace(/[?&]frame=[^&]*/, "")}
        style={{ width: w || 390, height: h || 844, border: "1px solid #333" }}
      />
    );
  }

  const sceneName = params.get("scene") ?? "rewards";
  if (sceneName === "replay") return <ReplayScene />;
  const build = SCENES[sceneName] ?? SCENES.rewards;
  const { state, picker } = build();
  const view = buildPlayerView(state, 0);
  const legal = getActivePlayer(state) === 0 ? getLegalActions(state) : [];

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {state.phase === "game-over" && state.result ? (
        <GameOverScreen view={view} result={state.result} names={NAMES} onMenu={() => {}} />
      ) : (
        <GameBoard
          view={view}
          legalActions={legal}
          isMyTurn={getActivePlayer(state) === 0}
          isAiThinking={false}
          playerNames={NAMES}
          onAction={() => {}}
          initialPickerState={picker}
        />
      )}
    </div>
  );
}
