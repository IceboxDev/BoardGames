import { describe, expect, it } from "vitest";
import { QUIZTOPIA_REQUIRED, quiztopiaLossAt } from "../../history/coop-challenge.ts";
import { createRng } from "../../lib/rng.ts";
import {
  answerVisibleTo,
  getLegalActions,
  helpFaceUp,
  helpPlayable,
  inMiddle,
  lossAtFor,
  lostCount,
  readerFor,
  requiredFor,
  seatAfter,
  wonCount,
} from "./rules.ts";
import {
  ask,
  newGame,
  play,
  randomPlay,
  statuses,
  withBuildings,
  withHelpDeck,
} from "./test-helpers.ts";
import type { QuiztopiaAction } from "./types.ts";

const kinds = (actions: QuiztopiaAction[]) => actions.map((a) => a.kind);

describe("seating", () => {
  it("rotates left and reads from the right", () => {
    expect(seatAfter([0, 1, 2, 3, 4, 5], 5)).toBe(0);
    expect(seatAfter([0, 1, 2, 3, 4, 5], 2)).toBe(3);
    expect(readerFor([0, 1, 2, 3, 4, 5], 0)).toBe(5);
    expect(readerFor([0, 1, 2, 3, 4, 5], 3)).toBe(2);
  });

  it("handles two seats and gapped seats", () => {
    expect(seatAfter([0, 1], 0)).toBe(1);
    expect(readerFor([0, 1], 0)).toBe(1);
    expect(seatAfter([0, 2, 4], 4)).toBe(0);
    expect(readerFor([0, 2, 4], 0)).toBe(4);
    expect(readerFor([0, 2, 4], 2)).toBe(0);
  });

  it("has no reader alone and throws for a seat not at the table", () => {
    expect(readerFor([3], 3)).toBeNull();
    expect(seatAfter([3], 3)).toBe(3);
    expect(() => seatAfter([0, 1], 2)).toThrow();
    expect(() => readerFor([0, 1], 2)).toThrow();
  });
});

describe("derived counts", () => {
  it("counts buildings and reads the tier thresholds", () => {
    const gs = withBuildings(newGame({ difficulty: 2 }), statuses(3, 4, 3, 2));
    expect(wonCount(gs)).toBe(3);
    expect(lostCount(gs)).toBe(2);
    expect(inMiddle(gs)).toBe(7);
    expect(requiredFor(gs)).toBe(QUIZTOPIA_REQUIRED[2]);
    expect(lossAtFor(gs)).toBe(quiztopiaLossAt(2));
  });

  it("help cards are playable only face-up and unused", () => {
    const gs = withHelpDeck(newGame(), ["streik", "besetzung", "datenleak"], {
      used: ["streik"],
      helpOpen: 2,
    });
    expect(helpFaceUp(gs).map((c) => c.id)).toEqual(["streik", "besetzung"]);
    expect(helpPlayable(gs, "streik")).toBe(false);
    expect(helpPlayable(gs, "besetzung")).toBe(true);
    expect(helpPlayable(gs, "datenleak")).toBe(false);
  });

  it("answer visibility follows reveal, reader and peek", () => {
    const gs = newGame({ playerCount: 3 });
    expect(answerVisibleTo(gs, gs.turn.activeSeat)).toBe(false);
    expect(answerVisibleTo(gs, gs.turn.readerSeat ?? -1)).toBe(true);
    expect(answerVisibleTo({ ...gs, turn: { ...gs.turn, peekSeat: 1 } }, 1)).toBe(true);
    expect(answerVisibleTo({ ...gs, turn: { ...gs.turn, revealed: true } }, 1)).toBe(true);
  });
});

describe("getLegalActions — totality", () => {
  it("is empty for seats not at the table", () => {
    const gs = newGame({ playerCount: 2 });
    expect(getLegalActions(gs, -1)).toEqual([]);
    expect(getLegalActions(gs, 999)).toEqual([]);
    expect(getLegalActions(gs, 2)).toEqual([]);
    expect(getLegalActions(gs, Number.NaN)).toEqual([]);
    expect(getLegalActions(newGame({ playerCount: 2, seats: [0, 3] }), 1)).toEqual([]);
  });

  it("is empty once the game is over", () => {
    const gs = newGame();
    expect(getLegalActions({ ...gs, phase: "game-over", outcome: "win" }, 0)).toEqual([]);
    expect(getLegalActions({ ...gs, outcome: "loss-deck" }, 0)).toEqual([]);
  });
});

describe("getLegalActions — phase × seat", () => {
  // Deterministic deck: nothing face-up that could add help actions.
  const quiet = (gs: ReturnType<typeof newGame>) =>
    withHelpDeck(gs, ["streik", "besetzung", "datenleak", "insidertipp"], {
      used: ["streik"],
    });

  it("choose-building: the active seat picks any building in the middle", () => {
    const gs = quiet(newGame({ playerCount: 3 }));
    const active = getLegalActions(gs, gs.turn.activeSeat);
    expect(active).toHaveLength(12);
    expect(new Set(kinds(active))).toEqual(new Set(["choose-building"]));
    expect(getLegalActions(gs, 1)).toEqual([]);
    expect(getLegalActions(gs, 2)).toEqual([]);
  });

  it("choose-building: won and lost buildings are not offered", () => {
    const gs = withBuildings(quiet(newGame({ playerCount: 3 })), statuses(2, 5, 3, 2));
    const picks = getLegalActions(gs, gs.turn.activeSeat).filter(
      (a) => a.kind === "choose-building",
    );
    expect(picks).toHaveLength(7);
  });

  it("question: only the active seat reveals", () => {
    const gs = ask(quiet(newGame({ playerCount: 3 })));
    expect(gs.phase).toBe("judge");
    const before = play(quiet(newGame({ playerCount: 3 })), 0, {
      kind: "choose-building",
      buildingIndex: 0,
    });
    expect(kinds(getLegalActions(before, 0))).toEqual(["reveal"]);
    expect(getLegalActions(before, 1)).toEqual([]);
    expect(getLegalActions(before, 2)).toEqual([]);
  });

  it("judge: only the active seat judges, both verdicts offered", () => {
    const gs = ask(quiet(newGame({ playerCount: 3 })));
    expect(getLegalActions(gs, 0)).toEqual([
      { kind: "judge", correct: true },
      { kind: "judge", correct: false },
    ]);
    expect(getLegalActions(gs, 1)).toEqual([]);
    expect(getLegalActions(gs, 2)).toEqual([]);
  });

  it("bakery-offer: the active seat alone decides", () => {
    const gs = { ...quiet(newGame({ playerCount: 3 })), phase: "bakery-offer" as const };
    expect(getLegalActions(gs, 0)).toEqual([
      { kind: "bakery", accept: true },
      { kind: "bakery", accept: false },
    ]);
    expect(getLegalActions(gs, 1)).toEqual([]);
  });

  it("loss-pending: any seat may revive a lost building or accept", () => {
    const base = withBuildings(
      withHelpDeck(newGame({ playerCount: 3 }), ["besetzung", "streik"]),
      statuses(2, 3, 2, 5),
    );
    const gs = { ...base, phase: "loss-pending" as const };
    for (const seat of [0, 1, 2]) {
      const legal = getLegalActions(gs, seat);
      expect(legal.filter((a) => a.kind === "play-help")).toHaveLength(5);
      expect(legal.at(-1)).toEqual({ kind: "accept-loss" });
    }
  });
});

describe("getLegalActions — help cards", () => {
  it("Besetzung is one entry per lost building, for any seat, in every window", () => {
    const base = withBuildings(
      withHelpDeck(newGame({ playerCount: 3 }), ["besetzung"]),
      statuses(2, 5, 3, 2),
    );
    const idx = [10, 11];
    for (const seat of [0, 1, 2]) {
      const entries = getLegalActions(base, seat).filter((a) => a.kind === "play-help");
      expect(entries).toEqual(
        idx.map((buildingIndex) => ({ kind: "play-help", helpId: "besetzung", buildingIndex })),
      );
    }
    const q = play(base, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(getLegalActions(q, 1).filter((a) => a.kind === "play-help")).toHaveLength(2);
    const j = play(q, 0, { kind: "reveal" });
    expect(getLegalActions(j, 2).filter((a) => a.kind === "play-help")).toHaveLength(2);
  });

  it("Datenleak is for a seat that neither answers nor reads, before reveal", () => {
    const base = withHelpDeck(newGame({ playerCount: 3 }), ["datenleak"]);
    expect(kinds(getLegalActions(base, 1))).toEqual([]);
    const q = play(base, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(q.turn.readerSeat).toBe(2);
    expect(getLegalActions(q, 1)).toEqual([{ kind: "play-help", helpId: "datenleak" }]);
    expect(getLegalActions(q, 2)).toEqual([]);
    expect(getLegalActions(q, 0)).toEqual([{ kind: "reveal" }]);
    const peeked = play(q, 1, { kind: "play-help", helpId: "datenleak" });
    expect(getLegalActions(peeked, 1)).toEqual([]);
    const j = play(q, 0, { kind: "reveal" });
    expect(getLegalActions(j, 1)).toEqual([]);
  });

  it("Datenleak is never legal at a two-player table", () => {
    const q = play(withHelpDeck(newGame({ playerCount: 2 }), ["datenleak"]), 0, {
      kind: "choose-building",
      buildingIndex: 0,
    });
    expect(getLegalActions(q, 0)).toEqual([{ kind: "reveal" }]);
    expect(getLegalActions(q, 1)).toEqual([]);
  });

  it("reader hints need a reader and only one hint per question", () => {
    const deck = withHelpDeck(newGame({ playerCount: 2 }), ["insidertipp", "benefizvorstellung"], {
      helpOpen: 2,
    });
    const q = play(deck, 0, { kind: "choose-building", buildingIndex: 0 });
    const hints = getLegalActions(q, 1);
    expect(hints).toEqual([
      { kind: "play-help", helpId: "insidertipp" },
      { kind: "play-help", helpId: "benefizvorstellung" },
    ]);
    const hinted = play(q, 1, { kind: "play-help", helpId: "insidertipp" });
    expect(getLegalActions(hinted, 1)).toEqual([]);
    expect(getLegalActions(hinted, 0)).toEqual([{ kind: "reveal" }]);
  });

  it("Alternative Fakten needs a card left; Streik once per turn, in question and judge", () => {
    const deck = withHelpDeck(newGame({ playerCount: 2 }), ["alternative-fakten", "streik"], {
      helpOpen: 2,
    });
    const q = play(deck, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(getLegalActions(q, 1)).toEqual([
      { kind: "play-help", helpId: "alternative-fakten" },
      { kind: "play-help", helpId: "streik" },
    ]);
    const dry = { ...q, drawPile: [] };
    expect(getLegalActions(dry, 1)).toEqual([{ kind: "play-help", helpId: "streik" }]);
    const j = play(q, 0, { kind: "reveal" });
    expect(getLegalActions(j, 1)).toEqual([{ kind: "play-help", helpId: "streik" }]);
    const shielded = play(j, 1, { kind: "play-help", helpId: "streik" });
    expect(getLegalActions(shielded, 1)).toEqual([]);
  });
});

describe("getLegalActions — expert mode", () => {
  const expert = () =>
    withHelpDeck(newGame({ playerCount: 3, expert: true, difficulty: 0 }), ["streik"], {
      used: ["streik"],
    });

  it("non-active seats flip tip cards; penalties for everyone; no reactivation while cards are active", () => {
    const q = play(expert(), 0, { kind: "choose-building", buildingIndex: 0 });
    expect(getLegalActions(q, 0)).toEqual([
      { kind: "reveal" },
      { kind: "penalty", severity: "tip" },
      { kind: "penalty", severity: "answer" },
    ]);
    expect(getLegalActions(q, 1)).toEqual([
      { kind: "flip-tip-card" },
      { kind: "penalty", severity: "tip" },
      { kind: "penalty", severity: "answer" },
    ]);
    expect(getLegalActions(q, 2)).toContainEqual({ kind: "flip-tip-card" });
  });

  it("no flips after the plenum; reactivation only when every tip card is spent", () => {
    let q = play(expert(), 0, { kind: "choose-building", buildingIndex: 0 });
    q = play(q, 1, { kind: "flip-tip-card" });
    q = play(q, 2, { kind: "flip-tip-card" });
    expect(q.turn.plenum).toBe(true);
    expect(getLegalActions(q, 1)).not.toContainEqual({ kind: "flip-tip-card" });
    expect(getLegalActions(q, 1)).not.toContainEqual({ kind: "reactivate-tip" });
    const spent = { ...q, tipCards: { total: 4, active: 0 } };
    expect(getLegalActions(spent, 0)).toContainEqual({ kind: "reactivate-tip" });
    expect(getLegalActions({ ...spent, drawPile: [] }, 0)).not.toContainEqual({
      kind: "reactivate-tip",
    });
  });

  it("judge phase keeps penalties but not flips", () => {
    const j = ask(expert());
    expect(getLegalActions(j, 1)).toEqual([
      { kind: "penalty", severity: "tip" },
      { kind: "penalty", severity: "answer" },
    ]);
  });

  it("standard mode has no expert actions", () => {
    const q = play(withHelpDeck(newGame({ playerCount: 3 }), ["streik"], { used: ["streik"] }), 0, {
      kind: "choose-building",
      buildingIndex: 0,
    });
    expect(getLegalActions(q, 1)).toEqual([]);
    expect(getLegalActions(q, 0)).toEqual([{ kind: "reveal" }]);
  });
});

describe("random legal play", () => {
  const configs = [
    { playerCount: 1 },
    { playerCount: 2, expert: true, difficulty: 3 },
    { playerCount: 3, seats: [0, 2, 5], difficulty: 1 },
    { playerCount: 6, expert: true, difficulty: 2, deck: "extended" as const },
  ];

  it.each(configs)("always terminates for %o", (config) => {
    for (let seed = 1; seed <= 8; seed++) {
      const { gs } = randomPlay(newGame({ ...config, seed }), createRng(seed * 7919));
      expect(gs.phase).toBe("game-over");
      expect(gs.outcome).not.toBeNull();
      expect(wonCount(gs) + lostCount(gs)).toBeLessThanOrEqual(12);
      expect(gs.cardsUsed).toBeLessThanOrEqual(24);
      expect(gs.cardsUsed + gs.drawPile.length).toBe(24);
    }
  });
});
