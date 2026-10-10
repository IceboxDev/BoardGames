import type { GoAction } from "@boardgames/core/games/go/view";

/** The legal action of `type`, if this seat has one right now. */
export function findAction<T extends GoAction["type"]>(
  legal: readonly GoAction[],
  type: T,
): Extract<GoAction, { type: T }> | undefined {
  return legal.find((a): a is Extract<GoAction, { type: T }> => a.type === type);
}

/** Points the seat may play now. */
export function playablePoints(legal: readonly GoAction[]): Set<number> {
  const out = new Set<number>();
  for (const a of legal) if (a.type === "play") out.add(a.point);
  return out;
}

/** Stones the seat may toggle dead/alive now. */
export function togglablePoints(legal: readonly GoAction[]): Set<number> {
  const out = new Set<number>();
  for (const a of legal) if (a.type === "toggle-dead") out.add(a.point);
  return out;
}
