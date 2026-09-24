import { describe, expect, it } from "vitest";
import { QUIZTOPIA_REQUIRED, quiztopiaLossAt } from "../../history/coop-challenge.ts";
import { endTurn, startTurn } from "./engine.ts";
import { buildReplayLog, toResult } from "./replay-log.ts";
import { answerVisibleTo, getLegalActions, lostCount, wonCount } from "./rules.ts";
import {
  answer,
  ask,
  buildingWith,
  judge,
  newGame,
  play,
  statuses,
  withBuildings,
  withHelpDeck,
} from "./test-helpers.ts";
import type { QuiztopiaGameState } from "./types.ts";

/** A table with nothing face-up that could add help actions. */
function quiet(gs: QuiztopiaGameState): QuiztopiaGameState {
  return withHelpDeck(gs, ["streik", "besetzung", "datenleak", "insidertipp"], {
    used: ["streik"],
  });
}

describe("applyAction — legality", () => {
  it("throws on anything getLegalActions does not list", () => {
    const gs = quiet(newGame({ playerCount: 2 }));
    expect(() => play(gs, 1, { kind: "choose-building", buildingIndex: 0 })).toThrow(/illegal/);
    expect(() => play(gs, 0, { kind: "reveal" })).toThrow(/illegal/);
    expect(() => play(gs, 5, { kind: "reveal" })).toThrow(/illegal/);
    expect(() => play(gs, 0, { kind: "play-help", helpId: "streik" })).toThrow(/illegal/);
    const banked = withBuildings(gs, statuses(2, 7, 3, 0));
    expect(() => play(banked, 0, { kind: "choose-building", buildingIndex: 11 })).toThrow();
  });

  it("never mutates its input", () => {
    const gs = quiet(newGame({ playerCount: 2 }));
    const before = JSON.stringify(gs);
    const next = answer(gs, true);
    expect(JSON.stringify(gs)).toBe(before);
    expect(next).not.toBe(gs);
    expect(next.turn).not.toBe(gs.turn);
  });
});

describe("a turn", () => {
  it("choose-building draws the top card's set for that building", () => {
    const gs = quiet(newGame({ playerCount: 2 }));
    const top = gs.drawPile[0];
    const q = play(gs, 0, { kind: "choose-building", buildingIndex: 4 });
    expect(q.phase).toBe("question");
    expect(q.turn.buildingIndex).toBe(4);
    expect(q.turn.question?.cardRef).toBe(top);
    expect(q.turn.question?.categoryIndex).toBe(4);
    expect(q.turn.question?.questionId).toBe(`${top}-s05-q0`);
    expect(q.turn.revealed).toBe(false);
    expect(q.drawPile).toHaveLength(23);
    expect(q.cardsUsed).toBe(1);
  });

  it("reveal moves to judge; judging logs and passes play to the left", () => {
    const gs = quiet(newGame({ playerCount: 3, seats: [0, 2, 5] }));
    const q = play(gs, 0, { kind: "choose-building", buildingIndex: 4 });
    const j = play(q, 0, { kind: "reveal" });
    expect(j.phase).toBe("judge");
    expect(j.turn.revealed).toBe(true);

    const next = judge(j, true);
    expect(next.phase).toBe("choose-building");
    expect(next.turn.index).toBe(2);
    expect(next.turn.activeSeat).toBe(2);
    expect(next.turn.readerSeat).toBe(0);
    expect(next.turn.question).toBeNull();
    expect(next.turn.buildingIndex).toBeNull();

    expect(next.questionLog).toHaveLength(1);
    const entry = next.questionLog[0];
    expect(entry).toMatchObject({
      turn: 1,
      cardRef: gs.drawPile[0],
      categoryIndex: 4,
      activeSeat: 0,
      readerSeat: 5,
      correct: true,
      shielded: false,
      buildingBefore: gs.buildings[4],
      helpPlayed: [],
      tipFlips: 0,
      plenum: false,
      penalties: 0,
      bakery: false,
    });
    expect(entry.answerEn).toBe(q.turn.question?.answerEn);
    expect(next.lastResolution).toEqual({
      turn: 1,
      buildingIndex: 4,
      correct: true,
      before: gs.buildings[4],
      after: gs.buildings[4] === "dark" ? "bright" : "won",
      shielded: false,
    });
  });

  it("wraps the rotation and keeps the reader to the right", () => {
    let gs = quiet(newGame({ playerCount: 3 }));
    gs = answer(gs, true);
    gs = answer(gs, true);
    expect(gs.turn.activeSeat).toBe(2);
    expect(gs.turn.readerSeat).toBe(1);
    gs = answer(gs, true);
    expect(gs.turn.activeSeat).toBe(0);
    expect(gs.turn.readerSeat).toBe(2);
    expect(gs.turn.index).toBe(4);
  });

  it("startTurn/endTurn are exported and pure", () => {
    const gs = quiet(newGame({ playerCount: 2 }));
    const t = startTurn(gs, 1, 7);
    expect(t.turn).toMatchObject({ index: 7, activeSeat: 1, readerSeat: 0 });
    expect(gs.turn.index).toBe(1);
    const e = endTurn(gs);
    expect(e.turn.index).toBe(2);
    expect(e.turn.activeSeat).toBe(1);
  });
});

describe("building transitions", () => {
  const table = () => withBuildings(quiet(newGame({ playerCount: 2 })), statuses(6, 6, 0, 0));

  it("correct: dark → bright", () => {
    const gs = table();
    const bi = buildingWith(gs, "dark");
    expect(answer(gs, true, bi).buildings[bi]).toBe("bright");
  });

  it("correct: bright → won", () => {
    const gs = table();
    const bi = buildingWith(gs, "bright");
    expect(answer(gs, true, bi).buildings[bi]).toBe("won");
  });

  it("wrong: dark → lost", () => {
    const gs = table();
    const bi = buildingWith(gs, "dark");
    expect(answer(gs, false, bi).buildings[bi]).toBe("lost");
  });

  it("wrong: bright → dark", () => {
    const gs = table();
    const bi = buildingWith(gs, "bright");
    expect(answer(gs, false, bi).buildings[bi]).toBe("dark");
  });

  it("Streik leaves a wrong answer without consequence and says so", () => {
    const gs = withHelpDeck(table(), ["streik"]);
    const bi = buildingWith(gs, "dark");
    const j = play(ask(gs, bi), 1, { kind: "play-help", helpId: "streik" });
    expect(j.turn.shield).toBe(true);
    const next = judge(j, false);
    expect(next.buildings[bi]).toBe("dark");
    expect(next.lastResolution?.shielded).toBe(true);
    expect(next.questionLog[0]).toMatchObject({
      correct: false,
      shielded: true,
      helpPlayed: ["streik"],
    });
    expect(next.helpDeck[0]).toEqual({ id: "streik", used: true });
  });

  it("a correct answer under Streik still counts", () => {
    const gs = withHelpDeck(table(), ["streik"]);
    const bi = buildingWith(gs, "bright");
    const j = play(ask(gs, bi), 1, { kind: "play-help", helpId: "streik" });
    const next = judge(j, true);
    expect(next.buildings[bi]).toBe("won");
    expect(next.lastResolution?.shielded).toBe(false);
  });
});

describe("help card reveal", () => {
  it("a building going to the dark side turns the next help card face up", () => {
    const gs = withHelpDeck(withBuildings(newGame({ playerCount: 2 }), statuses(6, 6, 0, 0)), [
      "streik",
      "besetzung",
      "datenleak",
      "insidertipp",
      "benefizvorstellung",
      "alternative-fakten",
    ]);
    const lost = answer(gs, false, buildingWith(gs, "dark"));
    expect(lost.helpOpen).toBe(2);
    const setback = answer(gs, false, buildingWith(gs, "bright"));
    expect(setback.helpOpen).toBe(1);
    const won = answer(gs, true, buildingWith(gs, "bright"));
    expect(won.helpOpen).toBe(1);
  });

  it("caps at the deck size and revival never lowers it", () => {
    const solo = withHelpDeck(
      withBuildings(newGame({ playerCount: 1, difficulty: 0 }), statuses(6, 6, 0, 0)),
      ["streik", "alternative-fakten", "besetzung"],
      { helpOpen: 3 },
    );
    const lost = answer(solo, false, buildingWith(solo, "dark"));
    expect(lost.helpOpen).toBe(3);
    const bi = buildingWith(lost, "lost");
    const revived = play(lost, 0, { kind: "play-help", helpId: "besetzung", buildingIndex: bi });
    expect(revived.helpOpen).toBe(3);
  });
});

describe("help effects", () => {
  it("Besetzung returns a lost building to the middle, dark", () => {
    const gs = withHelpDeck(withBuildings(newGame({ playerCount: 3 }), statuses(2, 5, 3, 2)), [
      "besetzung",
    ]);
    const bi = buildingWith(gs, "lost");
    const next = play(gs, 1, { kind: "play-help", helpId: "besetzung", buildingIndex: bi });
    expect(next.buildings[bi]).toBe("dark");
    expect(lostCount(next)).toBe(1);
    expect(next.phase).toBe("choose-building");
    expect(next.turn.helpPlayed).toEqual(["besetzung"]);
    expect(next.helpDeck[0].used).toBe(true);
    expect(getLegalActions(next, 1)).toEqual([]);
    // The revived building is choosable right away.
    expect(getLegalActions(next, 0)).toContainEqual({ kind: "choose-building", buildingIndex: bi });
  });

  it("Datenleak lets the peeker see the answer", () => {
    const gs = withHelpDeck(newGame({ playerCount: 3 }), ["datenleak"]);
    const q = play(gs, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(answerVisibleTo(q, 1)).toBe(false);
    const peeked = play(q, 1, { kind: "play-help", helpId: "datenleak" });
    expect(peeked.turn.peekSeat).toBe(1);
    expect(answerVisibleTo(peeked, 1)).toBe(true);
    expect(answerVisibleTo(peeked, 0)).toBe(false);
  });

  it("Insidertipp and Benefizvorstellung set the reader's hint", () => {
    const deck = withHelpDeck(newGame({ playerCount: 2 }), ["insidertipp", "benefizvorstellung"], {
      helpOpen: 2,
    });
    const q = play(deck, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(play(q, 0, { kind: "play-help", helpId: "insidertipp" }).turn.readerHint).toBe("word");
    expect(play(q, 1, { kind: "play-help", helpId: "benefizvorstellung" }).turn.readerHint).toBe(
      "mime",
    );
  });

  it("Alternative Fakten logs the dropped question unjudged and redraws for the same building", () => {
    const gs = withHelpDeck(newGame({ playerCount: 3 }), ["alternative-fakten", "datenleak"], {
      helpOpen: 2,
    });
    const [first, second] = gs.drawPile;
    let q = play(gs, 0, { kind: "choose-building", buildingIndex: 3 });
    q = play(q, 1, { kind: "play-help", helpId: "datenleak" });
    const redrawn = play(q, 2, { kind: "play-help", helpId: "alternative-fakten" });
    expect(redrawn.phase).toBe("question");
    expect(redrawn.turn.buildingIndex).toBe(3);
    expect(redrawn.turn.question?.cardRef).toBe(second);
    expect(redrawn.turn.question?.categoryIndex).toBe(3);
    expect(redrawn.turn.discards).toBe(1);
    expect(redrawn.turn.peekSeat).toBe(1);
    expect(redrawn.cardsUsed).toBe(2);
    expect(redrawn.drawPile).toHaveLength(22);
    expect(redrawn.questionLog).toHaveLength(1);
    expect(redrawn.questionLog[0]).toMatchObject({
      turn: 1,
      cardRef: first,
      categoryIndex: 3,
      correct: null,
      buildingBefore: gs.buildings[3],
      buildingAfter: gs.buildings[3],
    });
    const done = judge(play(redrawn, 0, { kind: "reveal" }), true);
    expect(done.questionLog).toHaveLength(2);
    expect(done.questionLog[1]).toMatchObject({ cardRef: second, correct: true });
    expect(done.questionLog[1].helpPlayed).toEqual(["datenleak", "alternative-fakten"]);
  });

  it("each card is played once", () => {
    const gs = withHelpDeck(newGame({ playerCount: 2 }), ["streik", "besetzung"]);
    const j = play(ask(gs), 1, { kind: "play-help", helpId: "streik" });
    const next = judge(j, true);
    expect(getLegalActions(ask(next), 0)).not.toContainEqual({
      kind: "play-help",
      helpId: "streik",
    });
  });

  it("solo never has the three multi-player cards", () => {
    const ids = newGame({ playerCount: 1 }).helpDeck.map((c) => c.id);
    expect(ids).not.toContain("datenleak");
    expect(ids).not.toContain("insidertipp");
    expect(ids).not.toContain("benefizvorstellung");
  });
});

describe("win and loss", () => {
  it.each([0, 1, 2, 3])("tier %i wins at the required count once a building was lost", (d) => {
    const required = QUIZTOPIA_REQUIRED[d];
    const gs = withBuildings(
      quiet(newGame({ playerCount: 2, difficulty: d })),
      statuses(11 - required, 1, required - 1, 1),
    );
    const end = answer(gs, true, buildingWith(gs, "bright"));
    expect(end.outcome).toBe("win");
    expect(end.phase).toBe("game-over");
    expect(wonCount(end)).toBe(required);
    expect(end.bakery).toBe(false);
    expect(getLegalActions(end, 0)).toEqual([]);
  });

  it.each([0, 1, 2, 3])("tier %i loses at lossAt lost buildings", (d) => {
    const lossAt = quiztopiaLossAt(d);
    const gs = withHelpDeck(
      withBuildings(
        newGame({ playerCount: 2, difficulty: d }),
        statuses(1, 12 - lossAt, 0, lossAt - 1),
      ),
      ["besetzung"],
      { used: ["besetzung"] },
    );
    const end = answer(gs, false, buildingWith(gs, "dark"));
    expect(end.outcome).toBe("loss-buildings");
    expect(lostCount(end)).toBe(lossAt);
  });

  it("one short of lossAt keeps playing", () => {
    const lossAt = quiztopiaLossAt(0);
    const gs = withBuildings(
      quiet(newGame({ difficulty: 0 })),
      statuses(2, 12 - lossAt, 0, lossAt - 2),
    );
    const next = answer(gs, false, buildingWith(gs, "dark"));
    expect(next.outcome).toBeNull();
    expect(next.phase).toBe("choose-building");
  });

  it("runs out of questions after the 24th card", () => {
    let gs = quiet(newGame({ playerCount: 2 }));
    const bi = buildingWith(gs, "dark");
    for (let i = 0; i < 24; i++) {
      expect(gs.outcome).toBeNull();
      gs = answer(gs, i % 2 === 0, bi);
    }
    expect(gs.outcome).toBe("loss-deck");
    expect(gs.cardsUsed).toBe(24);
    expect(gs.drawPile).toEqual([]);
    expect(gs.questionLog).toHaveLength(24);
  });

  it("a mid-turn discard that empties the holder still lets the question play", () => {
    const base = quiet(newGame({ playerCount: 2, expert: true }));
    const gs = { ...base, drawPile: base.drawPile.slice(0, 2), tipCards: { total: 4, active: 0 } };
    let q = play(gs, 0, { kind: "choose-building", buildingIndex: buildingWith(gs, "dark") });
    q = play(q, 1, { kind: "reactivate-tip" });
    expect(q.drawPile).toEqual([]);
    expect(q.phase).toBe("question");
    const end = judge(play(q, 0, { kind: "reveal" }), true);
    expect(end.outcome).toBe("loss-deck");
    expect(end.cardsUsed).toBe(2);
  });
});

describe("the whole bakery", () => {
  const atSeven = () =>
    withBuildings(quiet(newGame({ playerCount: 2, difficulty: 0 })), statuses(4, 1, 7, 0));

  it("offers the run when the win comes with no building lost", () => {
    const gs = atSeven();
    const offer = answer(gs, true, buildingWith(gs, "bright"));
    expect(offer.phase).toBe("bakery-offer");
    expect(offer.outcome).toBeNull();
    expect(wonCount(offer)).toBe(8);
    expect(offer.turn.activeSeat).toBe(0);
    expect(getLegalActions(offer, 0).map((a) => a.kind)).toEqual(["bakery", "bakery"]);
    expect(getLegalActions(offer, 1)).toEqual([]);
  });

  it("declining banks the win", () => {
    const gs = atSeven();
    const end = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: false,
    });
    expect(end.outcome).toBe("win");
    expect(end.bakery).toBe(false);
    expect(end.bakeryComplete).toBe(false);
  });

  it("accepting continues with the next seat and marks the run", () => {
    const gs = atSeven();
    const run = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: true,
    });
    expect(run.bakery).toBe(true);
    expect(run.phase).toBe("choose-building");
    expect(run.turn.activeSeat).toBe(1);
    expect(run.turn.index).toBe(2);
    expect(run.outcome).toBeNull();
  });

  it("winning all twelve completes the bakery", () => {
    const gs = atSeven();
    let run = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: true,
    });
    while (run.outcome === null) {
      const bi = run.buildings.includes("bright")
        ? buildingWith(run, "bright")
        : buildingWith(run, "dark");
      run = answer(run, true, bi);
    }
    expect(run.outcome).toBe("win");
    expect(run.bakeryComplete).toBe(true);
    expect(wonCount(run)).toBe(12);
    expect(run.questionLog.at(-1)?.bakery).toBe(true);
  });

  it("the run ends at the first lost building, still a win", () => {
    const gs = atSeven();
    const run = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: true,
    });
    const end = answer(run, false, buildingWith(run, "dark"));
    expect(end.outcome).toBe("win");
    expect(end.bakeryComplete).toBe(false);
    expect(lostCount(end)).toBe(1);
  });

  it("a setback (bright → dark) does not end the run", () => {
    const gs = atSeven();
    let run = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: true,
    });
    run = answer(run, true, buildingWith(run, "dark"));
    run = answer(run, false, buildingWith(run, "bright"));
    expect(run.outcome).toBeNull();
    expect(run.bakery).toBe(true);
  });

  it("the run ends when the holder runs dry", () => {
    const gs = atSeven();
    const run = play(answer(gs, true, buildingWith(gs, "bright")), 0, {
      kind: "bakery",
      accept: true,
    });
    const last = { ...run, drawPile: run.drawPile.slice(0, 1) };
    const end = answer(last, true, buildingWith(last, "dark"));
    expect(end.outcome).toBe("win");
    expect(end.bakeryComplete).toBe(false);
  });

  it("is not offered after a loss or with no cards left", () => {
    const withLoss = withBuildings(quiet(newGame({ difficulty: 0 })), statuses(3, 1, 7, 1));
    expect(answer(withLoss, true, buildingWith(withLoss, "bright")).outcome).toBe("win");
    const dry = { ...atSeven(), drawPile: atSeven().drawPile.slice(0, 1) };
    expect(answer(dry, true, buildingWith(dry, "bright")).outcome).toBe("win");
  });
});

describe("loss-pending (Besetzung on the losing answer)", () => {
  const lossAt = quiztopiaLossAt(0);
  const onTheBrink = () =>
    withHelpDeck(
      withBuildings(
        newGame({ playerCount: 3, difficulty: 0 }),
        statuses(1, 12 - lossAt, 0, lossAt - 1),
      ),
      ["streik", "besetzung"],
      { used: ["streik"] },
    );

  it("holds the loss while a face-up Besetzung and cards remain", () => {
    const gs = onTheBrink();
    const pending = answer(gs, false, buildingWith(gs, "dark"));
    expect(pending.phase).toBe("loss-pending");
    expect(pending.outcome).toBeNull();
    expect(pending.helpOpen).toBe(2);
    expect(lostCount(pending)).toBe(lossAt);
  });

  it("accept-loss by any seat ends the game", () => {
    const gs = onTheBrink();
    const pending = answer(gs, false, buildingWith(gs, "dark"));
    const end = play(pending, 2, { kind: "accept-loss" });
    expect(end.outcome).toBe("loss-buildings");
    expect(end.phase).toBe("game-over");
  });

  it("Besetzung revives a building and play passes on", () => {
    const gs = onTheBrink();
    const pending = answer(gs, false, buildingWith(gs, "dark"));
    const bi = buildingWith(pending, "lost");
    const revived = play(pending, 1, { kind: "play-help", helpId: "besetzung", buildingIndex: bi });
    expect(revived.buildings[bi]).toBe("dark");
    expect(lostCount(revived)).toBe(lossAt - 1);
    expect(revived.phase).toBe("choose-building");
    expect(revived.outcome).toBeNull();
    expect(revived.turn.activeSeat).toBe(1);
    expect(revived.turn.index).toBe(2);
    expect(revived.helpDeck[1].used).toBe(true);
  });

  it("goes straight to the loss with no cards left or Besetzung spent", () => {
    const gs = onTheBrink();
    const dry = { ...gs, drawPile: gs.drawPile.slice(0, 1) };
    expect(answer(dry, false, buildingWith(dry, "dark")).outcome).toBe("loss-buildings");
    const spent = withHelpDeck(gs, ["streik", "besetzung"], { used: ["streik", "besetzung"] });
    expect(answer(spent, false, buildingWith(spent, "dark")).outcome).toBe("loss-buildings");
  });
});

describe("expert mode", () => {
  const expert = () => quiet(newGame({ playerCount: 3, expert: true, difficulty: 0 }));
  const toQuestion = (gs: QuiztopiaGameState) =>
    play(gs, 0, { kind: "choose-building", buildingIndex: buildingWith(gs, "dark") });

  it("flips spend tip cards and the second opens the plenum", () => {
    let q = toQuestion(expert());
    q = play(q, 1, { kind: "flip-tip-card" });
    expect(q.tipCards).toEqual({ total: 4, active: 3 });
    expect(q.turn.tipFlips).toBe(1);
    expect(q.turn.plenum).toBe(false);
    q = play(q, 2, { kind: "flip-tip-card" });
    expect(q.tipCards?.active).toBe(2);
    expect(q.turn.tipFlips).toBe(2);
    expect(q.turn.plenum).toBe(true);
    const done = judge(play(q, 0, { kind: "reveal" }), true);
    expect(done.questionLog[0]).toMatchObject({ tipFlips: 2, plenum: true });
    expect(done.tipCards?.active).toBe(2);
  });

  it("a question answered alone earns a tip card back, capped at the total", () => {
    const gs = { ...expert(), tipCards: { total: 4, active: 2 } };
    const regained = answer(gs, true);
    expect(regained.tipCards).toEqual({ total: 4, active: 3 });
    expect(answer(expert(), true).tipCards).toEqual({ total: 4, active: 4 });
    expect(answer(gs, false).tipCards?.active).toBe(2);
  });

  it("a flipped tip breaks 'alone'; a penalty does not", () => {
    const gs = { ...expert(), tipCards: { total: 4, active: 2 } };
    const flipped = play(toQuestion(gs), 1, { kind: "flip-tip-card" });
    expect(judge(play(flipped, 0, { kind: "reveal" }), true).tipCards?.active).toBe(1);
    const penalised = play(toQuestion(gs), 1, { kind: "penalty", severity: "tip" });
    expect(penalised.turn.tipFlips).toBe(0);
    expect(judge(play(penalised, 0, { kind: "reveal" }), true).tipCards?.active).toBe(2);
  });

  it("reactivation discards a question card for a tip card", () => {
    const gs = { ...expert(), tipCards: { total: 4, active: 0 } };
    const q = toQuestion(gs);
    const re = play(q, 2, { kind: "reactivate-tip" });
    expect(re.tipCards).toEqual({ total: 4, active: 1 });
    expect(re.drawPile).toHaveLength(q.drawPile.length - 1);
    expect(re.cardsUsed).toBe(q.cardsUsed + 1);
    expect(re.turn.discards).toBe(1);
  });

  it("penalties flip what is there and discard for the shortfall", () => {
    const q = toQuestion(expert());
    const tip = play(q, 0, { kind: "penalty", severity: "tip" });
    expect(tip.tipCards?.active).toBe(3);
    expect(tip.turn.discards).toBe(0);
    expect(tip.turn.penalties).toEqual([{ severity: "tip", by: 0 }]);

    const blurt = play(q, 2, { kind: "penalty", severity: "answer" });
    expect(blurt.tipCards?.active).toBe(2);
    expect(blurt.turn.penalties).toEqual([{ severity: "answer", by: 2 }]);

    const one = { ...q, tipCards: { total: 4, active: 1 } };
    const short = play(one, 1, { kind: "penalty", severity: "answer" });
    expect(short.tipCards?.active).toBe(0);
    expect(short.turn.discards).toBe(1);
    expect(short.drawPile).toHaveLength(q.drawPile.length - 1);

    const none = { ...q, tipCards: { total: 4, active: 0 } };
    expect(play(none, 1, { kind: "penalty", severity: "answer" }).turn.discards).toBe(2);

    const lastCard = { ...none, drawPile: q.drawPile.slice(0, 1) };
    const drained = play(lastCard, 1, { kind: "penalty", severity: "answer" });
    expect(drained.turn.discards).toBe(1);
    expect(drained.drawPile).toEqual([]);
    expect(drained.cardsUsed).toBe(q.cardsUsed + 1);
  });

  it("penalties are counted on the log entry", () => {
    const q = play(toQuestion(expert()), 1, { kind: "penalty", severity: "tip" });
    const done = judge(
      play(play(q, 0, { kind: "reveal" }), 2, { kind: "penalty", severity: "answer" }),
      false,
    );
    expect(done.questionLog[0].penalties).toBe(2);
  });
});

describe("result and replay", () => {
  it("tallies per category and ignores redrawn questions", () => {
    const gs = withHelpDeck(withBuildings(newGame({ playerCount: 2 }), statuses(6, 6, 0, 0)), [
      "alternative-fakten",
    ]);
    let g = answer(gs, true, 3);
    g = answer(g, false, 3);
    let q = play(g, 0, { kind: "choose-building", buildingIndex: 7 });
    q = play(q, 1, { kind: "play-help", helpId: "alternative-fakten" });
    g = judge(play(q, 0, { kind: "reveal" }), true);
    const end = { ...g, phase: "game-over" as const, outcome: "loss-deck" as const };

    const result = toResult(end);
    expect(result.questionsAsked).toBe(3);
    expect(result.perCategory[3]).toEqual({ asked: 2, correct: 1 });
    expect(result.perCategory[7]).toEqual({ asked: 1, correct: 1 });
    expect(result.perCategory.filter((c) => c.asked > 0)).toHaveLength(2);
    expect(result.cardsUsed).toBe(4);
    expect(result.won).toBe(1);
    expect(result.lost).toBe(0);
    expect(result.difficultyLabel).toBe("Normal");

    const replay = buildReplayLog(end);
    expect(replay.slug).toBe("quiztopia");
    expect(replay.version).toBe(1);
    expect(replay.scoreA).toBe(1);
    expect(replay.scoreB).toBe(0);
    expect(replay.helpUsed).toEqual(["alternative-fakten"]);
    expect(replay.questions).toHaveLength(4);
    expect(replay.finalBuildings).toEqual(end.buildings);
    expect(replay.config).toEqual({
      playerCount: 2,
      seats: [0, 1],
      difficulty: 0,
      expert: false,
      deck: "original",
      seed: 1,
      language: null,
    });
  });

  it("refuses a result before the game is over", () => {
    expect(() => toResult(newGame())).toThrow(/before/);
    expect(() => buildReplayLog(newGame())).toThrow(/before/);
  });
});
