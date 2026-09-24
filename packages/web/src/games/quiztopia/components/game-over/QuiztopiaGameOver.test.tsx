import type {
  QuestionLogEntry,
  QuiztopiaPlayerView,
  QuiztopiaResult,
} from "@boardgames/core/games/quiztopia/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitReviewsBulk = vi.fn((_body: unknown) =>
  Promise.resolve({ ok: true as const, applied: 0, skipped: 0, states: [] }),
);
vi.mock("../../api", () => ({
  submitReviewsBulk: (body: unknown) => submitReviewsBulk(body),
  todayKey: () => "2026-09-24",
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

import QuiztopiaGameOver from "./QuiztopiaGameOver";

function entry(
  turn: number,
  questionId: string,
  correct: boolean | null,
  activeSeat: number,
): QuestionLogEntry {
  return {
    turn,
    cardRef: questionId.slice(0, 4),
    questionId,
    categoryIndex: Number(questionId.slice(6, 8)) - 1,
    en: `Question ${turn}?`,
    de: `Frage ${turn}?`,
    answerEn: correct === null ? "" : `Answer ${turn}`,
    answerDe: correct === null ? "" : `Antwort ${turn}`,
    activeSeat,
    readerSeat: (activeSeat + 2) % 3,
    correct,
    shielded: false,
    buildingBefore: "bright",
    buildingAfter: correct ? "won" : "dark",
    helpPlayed: [],
    tipFlips: 0,
    plenum: false,
    penalties: 0,
    bakery: false,
  };
}

const LOG: QuestionLogEntry[] = [
  entry(1, "c001-s04-q0", true, 0),
  entry(2, "c002-s07-q1", false, 1),
  entry(3, "f001-s02-q0", false, 2), // fixture id — never a review, never practised
  entry(4, "c003-s01-q0", null, 0), // redrawn — never judged
  entry(5, "c002-s07-q1", false, 1), // the same miss twice practises once
];

const BUILDINGS: QuiztopiaPlayerView["buildings"] = [
  "won",
  "dark",
  "bright",
  "won",
  "lost",
  "bright",
  "dark",
  "bright",
  "bright",
  "dark",
  "bright",
  "dark",
];

const VIEW: QuiztopiaPlayerView = {
  you: 0,
  playerCount: 3,
  seats: [0, 1, 2],
  difficulty: 2,
  difficultyLabel: "Wahnsinn",
  expert: true,
  deck: "original",
  language: "en",
  phase: "game-over",
  activeSeat: 1,
  readerSeat: 0,
  nextSeat: 2,
  buildings: BUILDINGS,
  won: 2,
  lost: 1,
  required: 10,
  lossAt: 3,
  inMiddle: 9,
  deckRemaining: 0,
  cardsUsed: 24,
  help: { faceUp: [{ id: "besetzung", used: false }], hidden: 5, deckSize: 6 },
  tipCards: { total: 2, active: 1 },
  turn: {
    index: 6,
    buildingIndex: null,
    question: null,
    revealed: false,
    tipFlips: 0,
    plenum: false,
    plenumBarred: [],
    peekSeat: null,
    readerHint: null,
    shield: false,
    helpPlayed: [],
    penalties: 0,
    discards: 0,
  },
  answerVisible: false,
  isYourTurn: false,
  bakery: false,
  bakeryOffer: false,
  lossPending: false,
  bakeryComplete: false,
  lastResolution: null,
  questionLog: LOG,
  outcome: "loss-deck",
};

const RESULT: QuiztopiaResult = {
  outcome: "loss-deck",
  bakery: false,
  bakeryComplete: false,
  won: 2,
  lost: 1,
  required: 10,
  questionsAsked: 4,
  cardsUsed: 24,
  difficulty: 2,
  difficultyLabel: "Wahnsinn",
  expert: true,
  deck: "original",
  playerCount: 3,
  seed: 1,
  perCategory: Array.from({ length: 12 }, (_, i) =>
    i === 3
      ? { asked: 1, correct: 1 }
      : i === 6
        ? { asked: 2, correct: 0 }
        : { asked: 0, correct: 0 },
  ),
};

function renderScreen(view: QuiztopiaPlayerView | null = VIEW, roomCode: string | null = "ABCD") {
  return render(
    <MemoryRouter>
      <QuiztopiaGameOver
        result={RESULT}
        view={view}
        seatNames={["Mantas", "Anna", "Lena"]}
        roomCode={roomCode}
        onBackToMenu={() => {}}
        onOpenTrainer={() => {}}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  submitReviewsBulk.mockClear();
  navigate.mockClear();
});

describe("QuiztopiaGameOver", () => {
  it("posts the judged, real questions as game reviews exactly once", () => {
    const { rerender } = renderScreen();
    expect(submitReviewsBulk).toHaveBeenCalledTimes(1);
    expect(submitReviewsBulk).toHaveBeenCalledWith({
      reviews: [
        {
          clientId: "game:ABCD:1",
          questionId: "c001-s04-q0",
          grade: "good",
          localDate: "2026-09-24",
          source: "game",
          roomCode: "ABCD",
        },
        {
          clientId: "game:ABCD:2",
          questionId: "c002-s07-q1",
          grade: "again",
          localDate: "2026-09-24",
          source: "game",
          roomCode: "ABCD",
        },
        {
          clientId: "game:ABCD:5",
          questionId: "c002-s07-q1",
          grade: "again",
          localDate: "2026-09-24",
          source: "game",
          roomCode: "ABCD",
        },
      ],
    });
    rerender(
      <MemoryRouter>
        <QuiztopiaGameOver
          result={RESULT}
          view={{ ...VIEW }}
          seatNames={["Mantas", "Anna", "Lena"]}
          roomCode="ABCD"
          onBackToMenu={() => {}}
          onOpenTrainer={() => {}}
        />
      </MemoryRouter>,
    );
    expect(submitReviewsBulk).toHaveBeenCalledTimes(1);
  });

  it("posts nothing without a room code or a view", () => {
    renderScreen(VIEW, null);
    renderScreen(null, "ABCD");
    expect(submitReviewsBulk).not.toHaveBeenCalled();
  });

  it("practises only the real misses, each once", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Practice 1 miss" }));
    expect(navigate).toHaveBeenCalledWith("/play/quiztopia/solo/study?ids=c002-s07-q1");
  });

  it("names the outcome and the table", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Out of questions" })).toBeInTheDocument();
    expect(
      screen.getByText("Wahnsinn · Expert · 2 won · 1 lost · 4 questions"),
    ).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("2 answered · 0 right")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show the questions/ }));
    expect(screen.getAllByRole("link", { name: "Wiki →" })).toHaveLength(4);
  });
});
