import type { ClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type { ClueNote, GuessNote } from "@boardgames/core/games/codenames/notes";
import { buildPlayerView } from "@boardgames/core/games/codenames/player-view";
import {
  applyClue,
  applyEndTurn,
  applyGuess,
  attachGuessNote,
  createGame,
} from "@boardgames/core/games/codenames/rules";
import type { CodenamesState, Team, ViewPhase } from "@boardgames/core/games/codenames/types";
import { buildDuetView } from "@boardgames/core/games/codenames-duet/player-view";
import {
  applyClue as applyDuetClue,
  applyEndTurn as applyDuetEnd,
  applyGuess as applyDuetGuess,
  attachGuessNote as attachDuetNote,
  createDuet,
  guesserOf,
} from "@boardgames/core/games/codenames-duet/rules";
import type { DuetState, DuetViewPhase } from "@boardgames/core/games/codenames-duet/types";
import CodenamesBoard from "../games/codenames/components/GameBoard";
import CodenamesOver from "../games/codenames/components/GameOverScreen";
import DuetBoard from "../games/codenames-duet/components/GameBoard";
import DuetOver from "../games/codenames-duet/components/GameOverScreen";

// Dev-only Codenames / Duet preview — the real boards and debriefs fed games
// played through the actual core rules (scripted clues, notes and touches),
// no auth/WS/AI. /dev/codenames-preview?scene=<name>&frame=WxH
// Scenes: clue | guess | watch | over | duet-clue | duet-guess | duet-over

const AI = "codenames-expert";
const REASONS = [
  "Both are things a king keeps close; nothing else on the table is royal, and the assassin (GHOST) is far from it.",
  "Water links them cleanly. HOTEL has a pool, but it's a bystander, so the risk is small.",
  "Birds of prey. OWL is the danger — it's theirs — but EAGLE and CRANE read first.",
  "Everything that grows: our last three. They're about to win, so I'm going for all of it.",
];

function cardsOf(state: CodenamesState, team: Team | "bystander"): number[] {
  return state.key.flatMap((k, i) => (k === team && !state.revealed[i] ? [i] : []));
}

const LINKS = ["a crown sits on it", "kings keep one close", "found in every castle"];

function clueNote(targets: number[], turn: number, leftover: number[] = []): ClueNote {
  return {
    targets,
    links: targets.map((card, i) => ({ card, why: LINKS[(i + turn) % LINKS.length] ?? "" })),
    leftover,
    reasoning: REASONS[turn % REASONS.length] ?? null,
    considered: [],
    testRead: null,
    standIn: false,
    cost: { calls: 2, usd: 0.012 },
    traceIds: [],
  };
}

function guessNote(cards: number[]): GuessNote {
  return {
    picks: cards.map((card, i) => ({
      card,
      confidence: Math.max(0.3, 0.92 - i * 0.18),
      why: i === 0 ? "the strongest fit by far" : "fits, though less directly",
    })),
    reasoning: "Read the clue literally first, then took the leftover from our earlier clue.",
    standIn: false,
    cost: { calls: 1, usd: 0.003 },
    traceIds: [],
  };
}

/** One scripted turn: a clue for `n` own cards, the touches, and an optional miss. */
function playTurn(state: CodenamesState, n: number, miss: boolean, turn: number): CodenamesState {
  const team = state.currentTeam;
  const targets = cardsOf(state, team).slice(0, n);
  const owed = turn % 3 === 2 ? cardsOf(state, team).slice(n, n + 1) : [];
  let s = applyClue(
    state,
    team,
    { word: ["crown", "ocean", "talon", "garden"][turn % 4] ?? "zqx", count: n as ClueCount },
    clueNote(targets, turn, owed),
  );
  const touches = miss ? [...targets.slice(0, n - 1), cardsOf(s, "bystander")[0] ?? 0] : targets;
  s = attachGuessNote(s, guessNote(touches));
  for (const card of touches) {
    if (s.phase !== "guessing" || s.currentTeam !== team) break;
    s = applyGuess(s, 2 + team, card);
  }
  if (s.phase === "guessing" && s.currentTeam === team) s = applyEndTurn(s, 2 + team);
  return s;
}

function classicScene(scene: string): { state: CodenamesState; phase: ViewPhase; seat: number } {
  let s = createGame({
    seed: 11,
    // The viewer: spymaster (seat 0) for the clue scenes, operative (seat 2) otherwise.
    ai: scene === "clue" || scene === "watch" ? [null, AI, AI, AI] : [AI, AI, null, AI],
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  s = playTurn(s, 2, false, 0);
  s = playTurn(s, 3, true, 1);
  if (scene === "clue" || scene === "guess" || scene === "watch") {
    if (s.currentTeam !== 0) s = playTurn(s, 2, true, 2);
    if (scene === "clue") return { state: s, phase: "clue", seat: 0 };
    const targets = cardsOf(s, 0).slice(0, 3);
    s = applyClue(s, 0, { word: "ocean", count: 3 }, clueNote(targets, 1));
    s = applyGuess(s, 2, targets[0] ?? 0);
    return { state: s, phase: "guessing", seat: scene === "watch" ? 0 : 2 };
  }
  let turn = 2;
  while (s.phase !== "over" && turn < 20) {
    s = playTurn(s, Math.min(3, cardsOf(s, s.currentTeam).length), turn % 3 === 2, turn);
    turn++;
  }
  return { state: s, phase: "over", seat: 2 };
}

function duetScene(scene: string): { state: DuetState; phase: DuetViewPhase; seat: number } {
  let s = createDuet({
    seed: 5,
    ai: [null, AI],
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  const agentsOn = (side: 0 | 1) =>
    s.key.flatMap((p, i) => (p[side] === "agent" && !s.found[i] ? [i] : []));
  const turn = (n: number, k: number) => {
    const giver = s.giver;
    const targets = agentsOn(giver).slice(0, n);
    s = applyDuetClue(
      s,
      giver,
      { word: ["harbour", "winter", "circus"][k % 3] ?? "zqx", count: n },
      clueNote(targets, k),
    );
    s = attachDuetNote(s, guessNote(targets));
    for (const card of targets) {
      if (s.phase !== "guessing") break;
      s = applyDuetGuess(s, guesserOf(s), card);
    }
    if (s.phase === "guessing") s = applyDuetEnd(s, guesserOf(s));
  };
  turn(2, 0);
  turn(3, 1);
  if (scene === "duet-clue") {
    if (s.giver !== 0) turn(2, 2);
    return { state: s, phase: "clue", seat: 0 };
  }
  if (scene === "duet-guess") {
    if (s.giver !== 1) turn(2, 2);
    const targets = agentsOn(1).slice(0, 2);
    s = applyDuetClue(s, 1, { word: "winter", count: 2 }, clueNote(targets, 1));
    s = applyDuetGuess(s, 0, targets[0] ?? 0);
    return { state: s, phase: "guessing", seat: 0 };
  }
  let k = 2;
  while (s.phase !== "over" && k < 30) {
    turn(3, k);
    k++;
  }
  return { state: s, phase: "over", seat: 0 };
}

export default function CodenamesPreview() {
  const params = new URLSearchParams(window.location.search);
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
  const scene = params.get("scene") ?? "guess";
  const names = [null, null, null, null];

  if (scene.startsWith("duet")) {
    const { state, phase, seat } = duetScene(scene);
    const view = buildDuetView(state, phase, seat);
    return (
      <div className="flex h-screen flex-col bg-surface-950">
        {phase === "over" ? (
          <DuetOver view={view} names={[null, null]} actions={[]} />
        ) : (
          <DuetBoard view={view} names={[null, null]} onAction={() => {}} error={null} />
        )}
      </div>
    );
  }

  const { state, phase, seat } = classicScene(scene);
  const view = buildPlayerView(state, phase, seat);
  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {phase === "over" ? (
        <CodenamesOver
          view={view}
          names={names}
          actions={[
            { label: "Play again", onClick: () => {}, variant: "primary" },
            { label: "Back to games", onClick: () => {}, variant: "secondary" },
          ]}
        />
      ) : (
        <CodenamesBoard view={view} names={names} onAction={() => {}} error={null} />
      )}
    </div>
  );
}
