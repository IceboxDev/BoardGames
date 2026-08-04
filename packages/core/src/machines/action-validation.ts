/**
 * The WRITE side of `GameMachineSpec`.
 *
 * `GameMachineSpec` historically described only how to READ a machine
 * (player views, legal actions, result). Every game therefore had to trust
 * whatever the transport handed it, and the server forwarded raw client
 * bytes straight into `actor.send(...)`. Engines throw on illegal input, and
 * an XState action that throws with no error observer is re-raised on a
 * macrotask — i.e. one malformed WebSocket frame terminated the process and
 * every concurrent game with it.
 *
 * The contract here closes that hole at the source: a spec must be able to
 * turn an UNTRUSTED payload into a machine event, or reject it with a reason.
 *
 * Two validator strategies are provided. Prefer `playerActionValidator`.
 *
 *   - `playerActionValidator` — the action must be structurally equal to one
 *     the engine itself enumerated via `getLegalActions`. The event handed to
 *     the machine is then built from the ENGINE'S OWN object, so no client
 *     bytes ever reach game logic and no extra fields can be smuggled in.
 *
 *   - `envelopeActionValidator` — well-formedness only; the engine adjudicates
 *     legality. For games whose legal-move space isn't fully enumerated by
 *     `getLegalActions`. Still safe, because `safeApply` (below) turns an
 *     engine throw into a rejected move rather than a dead actor.
 *
 * Defence in depth, outermost first:
 *   1. `validateAction`  — reject before the actor is touched (this file)
 *   2. `safeApply`       — engine throw ⇒ move rejected, state unchanged
 *   3. error observer    — residual throw kills one session, not the process
 *   4. process handlers  — nothing async can take the server down
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { AnyActorLogic, SnapshotFrom } from "xstate";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ActionValidation<TEvent> =
  | { readonly ok: true; readonly event: TEvent }
  | { readonly ok: false; readonly reason: string };

export function acceptAction<TEvent>(event: TEvent): ActionValidation<TEvent> {
  return { ok: true, event };
}

export function rejectAction<TEvent = never>(reason: string): ActionValidation<TEvent> {
  return { ok: false, reason };
}

/**
 * The signature every spec's `validateAction` implements.
 *
 * `player` is the AUTHENTICATED seat resolved by the server — never a value
 * the client supplied. Validators must build any seat field in the returned
 * event from this argument so a client cannot act as another player.
 */
export type ActionValidator<TMachine extends AnyActorLogic, TEvent> = (
  snapshot: SnapshotFrom<TMachine>,
  player: number,
  raw: unknown,
) => ActionValidation<TEvent>;

// ---------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep structural equality for JSON-shaped values.
 *
 * Key order is irrelevant and a key whose value is `undefined` is treated as
 * absent — both are necessary because the candidate has been through a JSON
 * round trip over the wire while the engine's object has not.
 */
export function canonicalEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => canonicalEquals(item, b[i]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left)
    .filter((k) => left[k] !== undefined)
    .sort();
  const rightKeys = Object.keys(right)
    .filter((k) => right[k] !== undefined)
    .sort();

  if (leftKeys.length !== rightKeys.length) return false;
  if (leftKeys.some((key, i) => key !== rightKeys[i])) return false;
  return leftKeys.every((key) => canonicalEquals(left[key], right[key]));
}

/** The engine-produced action structurally equal to `candidate`, if any. */
export function matchLegalAction<TAction>(
  legal: readonly TAction[],
  candidate: unknown,
): TAction | undefined {
  return legal.find((action) => canonicalEquals(action, candidate));
}

// ---------------------------------------------------------------------------
// Schema parsing (synchronous Standard Schema)
// ---------------------------------------------------------------------------

/**
 * Run a Standard Schema synchronously.
 *
 * Action validation sits on the WebSocket hot path and must not be async, so
 * a schema that defers is a programming error rather than a client error.
 */
export function parseActionSync<T>(
  schema: StandardSchemaV1<unknown, T>,
  raw: unknown,
): { ok: true; value: T } | { ok: false; reason: string } {
  const result = schema["~standard"].validate(raw);
  if (result instanceof Promise) {
    throw new TypeError("Action schemas must validate synchronously");
  }
  // `if (result.issues)` is the discriminant Standard Schema guarantees — a
  // success result types `issues` as `undefined`. Testing `.length` as well
  // reads as more careful but defeats the narrowing.
  if (result.issues) {
    const issue = result.issues[0];
    if (!issue) return { ok: false, reason: "invalid action" };
    const path = (issue.path ?? [])
      .map((segment) =>
        typeof segment === "object" && segment !== null && "key" in segment
          ? String(segment.key)
          : String(segment),
      )
      .join(".");
    return { ok: false, reason: path ? `${path}: ${issue.message}` : issue.message };
  }
  return { ok: true, value: result.value };
}

// ---------------------------------------------------------------------------
// Validator factories
// ---------------------------------------------------------------------------

const PLAYER_ACTION = "PLAYER_ACTION";

/**
 * Strictest validator: the client may only pick a move the engine already
 * offered. The returned event carries the engine's own action object, so game
 * logic never sees client-controlled data.
 *
 * Use for games whose UI drives entirely from `legalActions`.
 */
export function playerActionValidator<TMachine extends AnyActorLogic, TAction, TEvent>(options: {
  legalActions: (snapshot: SnapshotFrom<TMachine>, player: number) => readonly TAction[];
  toEvent: (action: TAction, player: number) => TEvent;
}): ActionValidator<TMachine, TEvent> {
  return (snapshot, player, raw) => {
    if (!isRecord(raw)) return rejectAction("action must be an object");
    if (raw.type !== PLAYER_ACTION) {
      return rejectAction(`unsupported action type "${String(raw.type)}"`);
    }
    if (!("action" in raw)) {
      return rejectAction("PLAYER_ACTION is missing its `action` payload");
    }

    const legal = options.legalActions(snapshot, player);
    if (legal.length === 0) return rejectAction("you have no legal actions right now");

    const match = matchLegalAction(legal, raw.action);
    if (match === undefined) return rejectAction("that action is not legal in the current state");

    return acceptAction(options.toEvent(match, player));
  };
}

/**
 * Well-formedness-only validator: confirms the envelope and (optionally) the
 * action shape, then lets the engine adjudicate legality.
 *
 * For games whose legal-move space `getLegalActions` does not fully enumerate.
 * An illegal-but-well-formed move reaches the engine and throws; `safeApply`
 * turns that into a rejected move, so the session survives.
 */
export function envelopeActionValidator<TMachine extends AnyActorLogic, TEvent>(options: {
  toEvent: (action: unknown, player: number) => TEvent;
  schema?: StandardSchemaV1<unknown, unknown>;
}): ActionValidator<TMachine, TEvent> {
  return (_snapshot, player, raw) => {
    if (!isRecord(raw)) return rejectAction("action must be an object");
    if (raw.type !== PLAYER_ACTION) {
      return rejectAction(`unsupported action type "${String(raw.type)}"`);
    }
    if (!isRecord(raw.action)) {
      return rejectAction("PLAYER_ACTION is missing its `action` payload");
    }
    if (options.schema) {
      const parsed = parseActionSync(options.schema, raw.action);
      if (!parsed.ok) return rejectAction(parsed.reason);
      return acceptAction(options.toEvent(parsed.value, player));
    }
    return acceptAction(options.toEvent(raw.action, player));
  };
}

/**
 * For machines whose client events are the legal actions themselves (no
 * `PLAYER_ACTION` envelope). `toEvent` rebuilds the event from the engine's
 * matched entry so seat fields come from the authenticated `player`.
 */
export function directEventValidator<TMachine extends AnyActorLogic, TAction, TEvent>(options: {
  legalActions: (snapshot: SnapshotFrom<TMachine>, player: number) => readonly TAction[];
  /** Project an engine legal action into the event a client would send. */
  toCandidate: (action: TAction, player: number) => unknown;
  toEvent: (action: TAction, player: number) => TEvent;
}): ActionValidator<TMachine, TEvent> {
  return (snapshot, player, raw) => {
    if (!isRecord(raw)) return rejectAction("action must be an object");
    if (typeof raw.type !== "string") return rejectAction("action is missing a `type`");

    const legal = options.legalActions(snapshot, player);
    if (legal.length === 0) return rejectAction("you have no legal actions right now");

    const match = legal.find((action) => canonicalEquals(options.toCandidate(action, player), raw));
    if (match === undefined) return rejectAction("that action is not legal in the current state");

    return acceptAction(options.toEvent(match, player));
  };
}

// ---------------------------------------------------------------------------
// Engine-throw containment
// ---------------------------------------------------------------------------

/**
 * Run an engine transition, converting a throw into "no state change".
 *
 * Game engines signal an illegal move by throwing. Inside an XState `assign`
 * that throw escapes the actor and — absent an error observer — takes the
 * whole process down. Wrapping keeps the rule "an illegal move changes
 * nothing" while making it survivable.
 *
 * This is a BACKSTOP. `validateAction` should already have rejected the move
 * with a reason the player can see; reaching here means client and server
 * disagree about the move space, which is why it logs.
 */
export function safeApply<TResult extends object>(
  label: string,
  apply: () => TResult,
): TResult | Record<string, never> {
  try {
    return apply();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${label}] rejected an illegal action: ${message}`);
    return {};
  }
}
