import type { QuiztopiaAction } from "@boardgames/core/games/quiztopia/types";

// The board never invents an action: every button is offered only when the
// server's `legalActions` lists a matching one, and what gets sent is the
// engine's own object. `query` is a partial action — `kind` plus any fields
// that must match; fields left out match anything (a Besetzung query without
// `buildingIndex` finds "any lost building may be returned").

export type ActionQuery = { kind: QuiztopiaAction["kind"] } & Record<string, unknown>;

export function findLegal(
  legal: readonly QuiztopiaAction[],
  query: ActionQuery,
): QuiztopiaAction | undefined {
  return legal.find((action) => {
    if (action.kind !== query.kind) return false;
    const a = action as unknown as Record<string, unknown>;
    return Object.entries(query).every(([k, v]) => k === "kind" || a[k] === v);
  });
}

export function hasLegal(legal: readonly QuiztopiaAction[], query: ActionQuery): boolean {
  return findLegal(legal, query) !== undefined;
}

/** Every legal action of one kind (all Besetzung targets, say). */
export function legalOfKind<K extends QuiztopiaAction["kind"]>(
  legal: readonly QuiztopiaAction[],
  kind: K,
): Extract<QuiztopiaAction, { kind: K }>[] {
  return legal.filter((a): a is Extract<QuiztopiaAction, { kind: K }> => a.kind === kind);
}
