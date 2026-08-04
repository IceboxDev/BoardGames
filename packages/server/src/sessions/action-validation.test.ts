/**
 * Cross-game contract test.
 *
 * A single WebSocket frame used to be able to kill this server: the action
 * envelope is `z.unknown()`, `handleAction` forwarded it straight to
 * `actor.send`, engines throw on illegal input, and an XState action that
 * throws with no error observer is re-raised on a macrotask — an uncaught
 * exception that terminated the process and every concurrent game with it.
 *
 * This asserts the contract that closed it, against EVERY registered game, so
 * a game added later cannot quietly reintroduce the hole.
 *
 * Two validator strategies are legitimate (see core/machines/action-validation):
 * most games match against the engine's own enumerated legal moves, while
 * games whose UI does not drive from `getLegalActions` (Pandemic) validate the
 * envelope and let the engine adjudicate. So "well-formed but illegal" is only
 * required to be SURVIVABLE, not necessarily rejected up front — which is
 * exactly what the last block below pins down.
 */

import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { getMachineSpec, getRegisteredSlugs } from "./machine-registry.ts";

const slugs = getRegisteredSlugs();

/** Payloads that are not even a well-formed action envelope. */
const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "PLAYER_ACTION"],
  ["a number", 42],
  ["a boolean", true],
  ["an array", [{ type: "PLAYER_ACTION" }]],
  ["an empty object", {}],
  ["a typeless object", { action: { kind: "whatever" } }],
  ["a PLAYER_ACTION with no payload", { type: "PLAYER_ACTION" }],
  ["a PLAYER_ACTION with a null payload", { type: "PLAYER_ACTION", action: null }],
  ["a PLAYER_ACTION with a string payload", { type: "PLAYER_ACTION", action: "attack" }],
  ["a smuggled START", { type: "START", playerCount: 9999 }],
  ["a smuggled RESET", { type: "RESET" }],
];

/**
 * Well-formed envelopes carrying nonsense. A validator may accept these and
 * leave the verdict to the engine; what must NOT happen is a dead actor or an
 * escaping exception.
 */
const WELL_FORMED_NONSENSE: ReadonlyArray<readonly [string, unknown]> = [
  ["an invented action kind", { type: "PLAYER_ACTION", action: { kind: "__hack__", n: 1 } }],
  ["a deeply nested payload", { type: "PLAYER_ACTION", action: { a: { b: { c: [1, 2, 3] } } } }],
  [
    "a prototype-pollution attempt",
    { type: "PLAYER_ACTION", action: { ["__proto__"]: { admin: true } } },
  ],
];

const SEATS = [0, 1, 2, 3, -1, 999];

describe.each(slugs)("%s", (slug) => {
  const spec = getMachineSpec(slug);
  if (!spec) throw new Error(`no spec registered for ${slug}`);

  /**
   * The `idle` snapshot is the harshest input: several machines seed context
   * with a `null as unknown as GameState` placeholder, so a validator that
   * naively reads `gameState` dereferences null here.
   */
  const freshSnapshot = () => {
    const actor = createActor(spec.machine);
    actor.start();
    const snapshot = actor.getSnapshot();
    actor.stop();
    return snapshot;
  };

  it("exposes a validateAction", () => {
    expect(typeof spec.validateAction).toBe("function");
  });

  it.each(MALFORMED)("rejects %s", (_label, payload) => {
    const snapshot = freshSnapshot();
    let result: ReturnType<typeof spec.validateAction> | undefined;
    expect(() => {
      result = spec.validateAction(snapshot, 0, payload);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(typeof result.reason).toBe("string");
  });

  it.each(WELL_FORMED_NONSENSE)("never throws on %s, for any seat", (_label, payload) => {
    const snapshot = freshSnapshot();
    for (const seat of SEATS) {
      expect(() => spec.validateAction(snapshot, seat, payload)).not.toThrow();
    }
  });

  it("survives every hostile payload being driven into a live actor", () => {
    // The end-to-end property: whatever validation decides, the actor must not
    // die and nothing may escape. This is `safeApply` plus the error observer
    // doing their job.
    for (const [, payload] of [...MALFORMED, ...WELL_FORMED_NONSENSE]) {
      const actor = createActor(spec.machine);
      let observedError: unknown;
      actor.subscribe({ next: () => {}, error: (err) => (observedError = err) });
      actor.start();

      const validated = spec.validateAction(actor.getSnapshot(), 0, payload);
      if (validated.ok) {
        expect(() => actor.send(validated.event)).not.toThrow();
      }

      expect(observedError).toBeUndefined();
      expect(actor.getSnapshot().status).not.toBe("error");
      actor.stop();
    }
  });
});

describe("registry", () => {
  it("registers every game exactly once and none are missing a spec", () => {
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(getMachineSpec(slug)).toBeDefined();
  });
});
