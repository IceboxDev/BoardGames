import { describe, expect, it } from "vitest";
import { QUIZTOPIA_DIFFICULTIES, quiztopiaLossAt } from "../../history/coop-challenge.ts";
import { buildPlayerView } from "./player-view.ts";
import {
  answer,
  ask,
  judge,
  newGame,
  play,
  statuses,
  withBuildings,
  withHelpDeck,
} from "./test-helpers.ts";

describe("buildPlayerView — answer visibility", () => {
  const table = () => withHelpDeck(newGame({ playerCount: 3 }), ["datenleak"]);

  it("only the reader sees the answer before reveal", () => {
    const q = play(table(), 0, { kind: "choose-building", buildingIndex: 0 });
    const answerEn = q.turn.question?.answerEn;
    expect(answerEn).toMatch(/^Answer /);

    const active = buildPlayerView(q, 0);
    expect(active.turn.question?.answerEn).toBeNull();
    expect(active.turn.question?.answerDe).toBeNull();
    expect(active.answerVisible).toBe(false);
    expect(active.turn.question?.en).toMatch(/^Question /);

    const reader = buildPlayerView(q, 2);
    expect(reader.readerSeat).toBe(2);
    expect(reader.turn.question?.answerEn).toBe(answerEn);
    expect(reader.answerVisible).toBe(true);

    expect(buildPlayerView(q, 1).turn.question?.answerEn).toBeNull();
  });

  it("everyone sees the answer after reveal", () => {
    const j = ask(table());
    for (const seat of [0, 1, 2]) {
      const v = buildPlayerView(j, seat);
      expect(v.answerVisible).toBe(true);
      expect(v.turn.question?.answerDe).toMatch(/^Antwort /);
    }
  });

  it("the Datenleak peeker sees the answer and joins the barred list", () => {
    let q = play(table(), 0, { kind: "choose-building", buildingIndex: 0 });
    q = play(q, 1, { kind: "play-help", helpId: "datenleak" });
    const peeker = buildPlayerView(q, 1);
    expect(peeker.answerVisible).toBe(true);
    expect(peeker.turn.peekSeat).toBe(1);
    expect(peeker.turn.plenumBarred).toEqual([2, 1]);
    expect(buildPlayerView(q, 0).answerVisible).toBe(false);
  });

  it("solo hides the answer until reveal", () => {
    const solo = newGame({ playerCount: 1 });
    const q = play(solo, 0, { kind: "choose-building", buildingIndex: 0 });
    const v = buildPlayerView(q, 0);
    expect(v.readerSeat).toBeNull();
    expect(v.turn.plenumBarred).toEqual([]);
    expect(v.answerVisible).toBe(false);
    expect(buildPlayerView(play(q, 0, { kind: "reveal" }), 0).answerVisible).toBe(true);
  });

  it("has no answer to show between questions", () => {
    const v = buildPlayerView(table(), 2);
    expect(v.turn.question).toBeNull();
    expect(v.answerVisible).toBe(false);
  });
});

describe("buildPlayerView — log", () => {
  it("blanks the answers of unjudged entries only", () => {
    const gs = withHelpDeck(newGame({ playerCount: 2 }), ["alternative-fakten"]);
    let q = play(gs, 0, { kind: "choose-building", buildingIndex: 2 });
    q = play(q, 1, { kind: "play-help", helpId: "alternative-fakten" });
    const done = judge(play(q, 0, { kind: "reveal" }), false);
    const log = buildPlayerView(done, 1).questionLog;
    expect(log).toHaveLength(2);
    expect(log[0].correct).toBeNull();
    expect(log[0].answerEn).toBe("");
    expect(log[0].answerDe).toBe("");
    expect(log[0].en).toMatch(/^Question /);
    expect(log[1].correct).toBe(false);
    expect(log[1].answerEn).toMatch(/^Answer /);
    // The state itself keeps every answer.
    expect(done.questionLog[0].answerEn).toMatch(/^Answer /);
  });
});

describe("buildPlayerView — totality and flags", () => {
  it("is total for a seat that is not at the table", () => {
    const j = ask(newGame({ playerCount: 2 }));
    for (const seat of [999, -1, 7]) {
      const v = buildPlayerView(j, seat);
      expect(v.you).toBe(seat);
      expect(v.isYourTurn).toBe(false);
      expect(v.answerVisible).toBe(true);
      expect(v.activeSeat).toBe(0);
    }
    const q = play(newGame({ playerCount: 2 }), 0, { kind: "choose-building", buildingIndex: 0 });
    expect(buildPlayerView(q, 999).answerVisible).toBe(false);
  });

  it("marks the active seat's turn in the four acting phases", () => {
    const gs = newGame({ playerCount: 2 });
    expect(buildPlayerView(gs, 0).isYourTurn).toBe(true);
    expect(buildPlayerView(gs, 1).isYourTurn).toBe(false);
    const q = play(gs, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(buildPlayerView(q, 0).isYourTurn).toBe(true);
    expect(buildPlayerView(play(q, 0, { kind: "reveal" }), 0).isYourTurn).toBe(true);

    const offer = { ...gs, phase: "bakery-offer" as const };
    expect(buildPlayerView(offer, 0)).toMatchObject({
      isYourTurn: true,
      bakeryOffer: true,
      lossPending: false,
    });
    const pending = { ...gs, phase: "loss-pending" as const };
    expect(buildPlayerView(pending, 0)).toMatchObject({
      isYourTurn: false,
      lossPending: true,
      bakeryOffer: false,
    });
    const over = { ...gs, phase: "game-over" as const, outcome: "win" as const };
    expect(buildPlayerView(over, 0)).toMatchObject({ isYourTurn: false, outcome: "win" });
  });

  it("summarises the table", () => {
    const gs = withHelpDeck(
      withBuildings(
        newGame({ playerCount: 3, seats: [0, 2, 4], difficulty: 2, expert: true }),
        statuses(2, 4, 4, 2),
      ),
      ["besetzung", "streik", "datenleak"],
      { used: ["besetzung"], helpOpen: 2 },
    );
    const v = buildPlayerView(gs, 2);
    expect(v).toMatchObject({
      you: 2,
      playerCount: 3,
      seats: [0, 2, 4],
      difficulty: 2,
      difficultyLabel: QUIZTOPIA_DIFFICULTIES[2],
      expert: true,
      activeSeat: 0,
      readerSeat: 4,
      nextSeat: 2,
      won: 4,
      lost: 2,
      required: 10,
      lossAt: quiztopiaLossAt(2),
      inMiddle: 6,
      deckRemaining: 24,
      cardsUsed: 0,
      tipCards: { total: 2, active: 2 },
      bakery: false,
      bakeryComplete: false,
      lastResolution: null,
    });
    expect(v.help).toEqual({
      faceUp: [
        { id: "besetzung", used: true },
        { id: "streik", used: false },
      ],
      hidden: 1,
      deckSize: 3,
    });
  });

  it("hands out copies", () => {
    const gs = answer(newGame({ playerCount: 2 }), true);
    const v = buildPlayerView(gs, 0);
    v.buildings[0] = "lost";
    v.help.faceUp[0].used = true;
    v.questionLog[0].correct = false;
    expect(gs.buildings[0]).not.toBe("lost");
    expect(gs.helpDeck[0].used).toBe(false);
    expect(gs.questionLog[0].correct).toBe(true);
  });
});
