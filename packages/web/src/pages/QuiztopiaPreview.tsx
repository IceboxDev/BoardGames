import { applyAction } from "@boardgames/core/games/quiztopia/engine";
import { buildPlayerView } from "@boardgames/core/games/quiztopia/player-view";
import { createFixtureQuestionSource } from "@boardgames/core/games/quiztopia/question-source";
import { toResult } from "@boardgames/core/games/quiztopia/replay-log";
import { getLegalActions } from "@boardgames/core/games/quiztopia/rules";
import { createGame } from "@boardgames/core/games/quiztopia/setup";
import {
  type BuildingStatus,
  type HelpCardId,
  type QuiztopiaAction,
  type QuiztopiaGameState,
  QuiztopiaStartConfigSchema,
} from "@boardgames/core/games/quiztopia/types";
import { createRng } from "@boardgames/core/lib/rng";
import QuiztopiaBoard from "../games/quiztopia/components/board/QuiztopiaBoard";
import QuiztopiaGameOver from "../games/quiztopia/components/game-over/QuiztopiaGameOver";

// Dev-only Quiztopia preview — the real board / game-over screen fed a
// state built by walking the actual engine through a scripted game (the
// fixture question source, a seeded rng), no auth/WS. Exists so phone-width
// regressions can be reproduced headlessly (the DecryptoPreview pattern):
//   /dev/quiztopia-preview?scene=<name>&seat=<n>&frame=WxH
// Scenes: board | reader | judge | expert | plenum | bakery | besetzung |
//         gameover | gameover-loss

const NAMES = ["Mantas", "Anna", "Lena"];
const SOURCE = createFixtureQuestionSource(30);
const DEPS = { source: SOURCE };

type Gs = QuiztopiaGameState;

function newGame(opts: { playerCount?: number; expert?: boolean; difficulty?: number } = {}): Gs {
  const cfg = QuiztopiaStartConfigSchema.parse({
    playerCount: 3,
    deck: "original",
    language: "en",
    seed: 11,
    ...opts,
  });
  return createGame(cfg, { source: SOURCE, rng: createRng(11) });
}

const play = (gs: Gs, seat: number, action: QuiztopiaAction): Gs =>
  applyAction(gs, seat, action, DEPS);

function pick(gs: Gs, prefer: BuildingStatus): Gs {
  const fallback: BuildingStatus = prefer === "dark" ? "bright" : "dark";
  const i = gs.buildings.includes(prefer)
    ? gs.buildings.indexOf(prefer)
    : gs.buildings.indexOf(fallback);
  return play(gs, gs.turn.activeSeat, { kind: "choose-building", buildingIndex: i });
}

const reveal = (gs: Gs): Gs => play(gs, gs.turn.activeSeat, { kind: "reveal" });
const judge = (gs: Gs, correct: boolean): Gs =>
  play(gs, gs.turn.activeSeat, { kind: "judge", correct });
const answer = (gs: Gs, correct: boolean, on: BuildingStatus): Gs =>
  judge(reveal(pick(gs, on)), correct);

/** Someone other than the active seat (and, if possible, the reader). */
function bystander(gs: Gs): number {
  return (
    gs.seats.find((s) => s !== gs.turn.activeSeat && s !== gs.turn.readerSeat) ??
    gs.seats.find((s) => s !== gs.turn.activeSeat) ??
    gs.turn.activeSeat
  );
}

function withHelpDeck(gs: Gs, ids: HelpCardId[]): Gs {
  return { ...gs, helpDeck: ids.map((id) => ({ id, used: false })), helpOpen: 1 };
}

/** Three turns in: one won, one lost (a help card turned), one lit. */
function midGame(): Gs {
  let gs = newGame();
  gs = answer(gs, true, "bright");
  gs = answer(gs, false, "dark");
  gs = answer(gs, true, "dark");
  return gs;
}

/** Eight won, nothing lost — the bakery offer. */
function bakeryOffer(): Gs {
  let gs = newGame({ difficulty: 0 });
  for (let i = 0; i < 7; i++) gs = answer(gs, true, "bright");
  gs = answer(gs, true, "dark"); // dark → lit
  gs = answer(gs, true, "bright"); // → won, 8 of 8
  return gs;
}

/** Five dark buildings lost with Besetzung face-up: the loss on hold. */
function lossPending(): Gs {
  let gs = withHelpDeck(newGame({ difficulty: 0 }), [
    "besetzung",
    "streik",
    "datenleak",
    "insidertipp",
    "benefizvorstellung",
    "alternative-fakten",
  ]);
  for (let i = 0; i < 5; i++) gs = answer(gs, false, "dark");
  return gs;
}

interface Scene {
  build: () => Gs;
  /** Default viewing seat (`?seat=` overrides). */
  seat: number | ((gs: Gs) => number);
}

const SCENES: Record<string, Scene> = {
  // Seat 0's turn to pick a building.
  board: { build: midGame, seat: 0 },
  // Seat 0 reads for Anna: the private answer strip.
  reader: {
    build: () => pick(answer(newGame(), true, "bright"), "dark"),
    seat: 0,
  },
  // Seat 0 revealed and must judge.
  judge: { build: () => reveal(pick(midGame(), "bright")), seat: 0 },
  // Expert: Anna answers alone, one tip already flipped; seat 0 may flip.
  expert: {
    build: () => {
      let gs = newGame({ expert: true, difficulty: 0 });
      gs = answer(gs, true, "bright");
      gs = pick(gs, "dark");
      gs = play(gs, bystander(gs), { kind: "flip-tip-card" });
      return gs;
    },
    seat: 0,
  },
  // Expert: the second flip opened the Plenum.
  plenum: {
    build: () => {
      let gs = newGame({ expert: true, difficulty: 0 });
      gs = pick(gs, "dark");
      gs = play(gs, bystander(gs), { kind: "flip-tip-card" });
      gs = play(gs, bystander(gs), { kind: "flip-tip-card" });
      return gs;
    },
    seat: 1,
  },
  bakery: { build: bakeryOffer, seat: (gs) => gs.turn.activeSeat },
  besetzung: { build: lossPending, seat: 0 },
  gameover: {
    build: () => {
      const gs = bakeryOffer();
      return play(gs, gs.turn.activeSeat, { kind: "bakery", accept: false });
    },
    seat: 0,
  },
  "gameover-loss": {
    build: () => play(lossPending(), 0, { kind: "accept-loss" }),
    seat: 0,
  },
};

export default function QuiztopiaPreview() {
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

  const sceneName = params.get("scene") ?? "board";
  const scene = SCENES[sceneName] ?? (SCENES.board as Scene);
  const gs = scene.build();
  const seatParam = params.get("seat");
  const seat =
    seatParam !== null && Number.isInteger(Number(seatParam))
      ? Number(seatParam)
      : typeof scene.seat === "function"
        ? scene.seat(gs)
        : scene.seat;
  const view = buildPlayerView(gs, seat);
  const legalActions = getLegalActions(gs, seat);

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {gs.outcome !== null ? (
        <QuiztopiaGameOver
          result={toResult(gs)}
          view={view}
          seatNames={NAMES}
          roomCode={null}
          onBackToMenu={() => {}}
          onOpenTrainer={() => {}}
        />
      ) : (
        <QuiztopiaBoard view={view} legalActions={legalActions} seatNames={NAMES} send={() => {}} />
      )}
    </div>
  );
}
