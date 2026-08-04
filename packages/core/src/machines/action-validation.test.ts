import { describe, expect, it, vi } from "vitest";
import {
  canonicalEquals,
  directEventValidator,
  envelopeActionValidator,
  matchLegalAction,
  playerActionValidator,
  safeApply,
} from "./action-validation";

// The snapshot is opaque to these helpers — they only pass it through to the
// caller's `legalActions`.
const SNAPSHOT = {} as never;

describe("canonicalEquals", () => {
  it("ignores key order", () => {
    expect(canonicalEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("treats an explicitly-undefined key as absent", () => {
    // A JSON round trip drops undefined values, so the client's object and the
    // engine's must still compare equal.
    expect(canonicalEquals({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("does NOT treat null or false as absent", () => {
    expect(canonicalEquals({ a: 1, b: null }, { a: 1 })).toBe(false);
    expect(canonicalEquals({ a: false }, {})).toBe(false);
  });

  it("compares nested structures and arrays by value and position", () => {
    expect(canonicalEquals({ x: [1, { y: 2 }] }, { x: [1, { y: 2 }] })).toBe(true);
    expect(canonicalEquals({ x: [1, 2] }, { x: [2, 1] })).toBe(false);
    expect(canonicalEquals([1], [1, 2])).toBe(false);
  });

  it("rejects an extra smuggled field", () => {
    expect(canonicalEquals({ type: "attack" }, { type: "attack", admin: true })).toBe(false);
  });

  it("does not confuse an array with an object", () => {
    expect(canonicalEquals([], {})).toBe(false);
  });
});

describe("matchLegalAction", () => {
  const legal = [{ type: "attack", cardId: "c1" }, { type: "pass" }];

  it("returns the ENGINE's object, not the candidate", () => {
    const candidate = { cardId: "c1", type: "attack" };
    const match = matchLegalAction(legal, candidate);
    expect(match).toBe(legal[0]);
  });

  it("returns undefined when nothing matches", () => {
    expect(matchLegalAction(legal, { type: "attack", cardId: "nope" })).toBeUndefined();
  });
});

describe("playerActionValidator", () => {
  const legal = [{ type: "attack", cardId: "c1" }];
  const validate = playerActionValidator<never, { type: string; cardId?: string }, unknown>({
    legalActions: () => legal,
    toEvent: (action, player) => ({ type: "PLAYER_ACTION", playerIndex: player, action }),
  });

  it("accepts a legal action and rebuilds the event from the engine's object", () => {
    const result = validate(SNAPSHOT, 3, {
      type: "PLAYER_ACTION",
      action: { type: "attack", cardId: "c1" },
    });
    expect(result).toEqual({
      ok: true,
      event: { type: "PLAYER_ACTION", playerIndex: 3, action: legal[0] },
    });
    // Identity check: game logic must never see client-allocated objects.
    expect((result as { event: { action: unknown } }).event.action).toBe(legal[0]);
  });

  it("takes the seat from the authenticated player, never the payload", () => {
    const result = validate(SNAPSHOT, 1, {
      type: "PLAYER_ACTION",
      playerIndex: 99,
      action: { type: "attack", cardId: "c1" },
    });
    expect(result).toMatchObject({ ok: true, event: { playerIndex: 1 } });
  });

  it("rejects an illegal action", () => {
    const result = validate(SNAPSHOT, 0, {
      type: "PLAYER_ACTION",
      action: { type: "attack", cardId: "stolen" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a smuggled extra field on an otherwise legal action", () => {
    const result = validate(SNAPSHOT, 0, {
      type: "PLAYER_ACTION",
      action: { type: "attack", cardId: "c1", bonus: 999 },
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "attack"],
    ["a number", 7],
    ["an array", []],
    ["an empty object", {}],
    ["a foreign event type", { type: "START", playerCount: 99 }],
    ["a missing payload", { type: "PLAYER_ACTION" }],
  ])("rejects %s without throwing", (_label, payload) => {
    expect(() => validate(SNAPSHOT, 0, payload)).not.toThrow();
    expect(validate(SNAPSHOT, 0, payload).ok).toBe(false);
  });

  it("rejects everything when the seat has no legal actions", () => {
    const empty = playerActionValidator<never, unknown, unknown>({
      legalActions: () => [],
      toEvent: (action) => action,
    });
    expect(empty(SNAPSHOT, 0, { type: "PLAYER_ACTION", action: { type: "attack" } }).ok).toBe(
      false,
    );
  });
});

describe("envelopeActionValidator", () => {
  const validate = envelopeActionValidator<never, unknown>({
    toEvent: (action) => ({ type: "PLAYER_ACTION", action }),
  });

  it("accepts any well-formed envelope and defers legality to the engine", () => {
    expect(validate(SNAPSHOT, 0, { type: "PLAYER_ACTION", action: { kind: "drive" } })).toEqual({
      ok: true,
      event: { type: "PLAYER_ACTION", action: { kind: "drive" } },
    });
  });

  it.each([
    ["null", null],
    ["a bare string", "drive"],
    ["a missing action", { type: "PLAYER_ACTION" }],
    ["a non-object action", { type: "PLAYER_ACTION", action: "drive" }],
    ["a foreign type", { type: "RESET" }],
  ])("rejects %s", (_label, payload) => {
    expect(validate(SNAPSHOT, 0, payload).ok).toBe(false);
  });
});

describe("directEventValidator", () => {
  const legal = [
    { phase: "play", action: { kind: "discard", card: { id: "c1" } } },
    { phase: "draw", action: { kind: "draw-pile" } },
  ] as const;

  const validate = directEventValidator<never, (typeof legal)[number], unknown>({
    legalActions: () => legal,
    toCandidate: (entry) =>
      entry.phase === "play"
        ? { type: "DISCARD", cardId: entry.action.card.id }
        : { type: "DRAW_FROM_PILE" },
    toEvent: (entry) =>
      entry.phase === "play"
        ? { type: "DISCARD", cardId: entry.action.card.id }
        : { type: "DRAW_FROM_PILE" },
  });

  it("accepts an event that projects from a legal entry", () => {
    expect(validate(SNAPSHOT, 0, { type: "DISCARD", cardId: "c1" })).toEqual({
      ok: true,
      event: { type: "DISCARD", cardId: "c1" },
    });
  });

  it("rejects an event for a card that isn't legal", () => {
    expect(validate(SNAPSHOT, 0, { type: "DISCARD", cardId: "c9" }).ok).toBe(false);
  });

  it("rejects a control event the enumeration never offers", () => {
    expect(validate(SNAPSHOT, 0, { type: "START" }).ok).toBe(false);
  });
});

describe("safeApply", () => {
  it("returns the result when the engine succeeds", () => {
    expect(safeApply("test", () => ({ gameState: 1 }))).toEqual({ gameState: 1 });
  });

  it("converts an engine throw into no state change", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      safeApply("test", () => {
        throw new Error("Card c9 not in player 0's hand");
      }),
    ).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("survives a thrown non-Error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      safeApply("test", () => {
        throw "boom";
      }),
    ).toEqual({});
    warn.mockRestore();
  });
});
