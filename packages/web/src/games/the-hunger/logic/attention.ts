import type { Action, TurnStep } from "@boardgames/core/games/the-hunger/types";

export type ViewId = "map" | "player" | "shop" | "overview";

export const VIEWS: readonly { id: ViewId; label: string; icon: string; key: string }[] = [
  { id: "map", label: "Map", icon: "🗺", key: "1" },
  { id: "shop", label: "Hunt", icon: "🩸", key: "2" },
  { id: "overview", label: "Overview", icon: "📊", key: "3" },
  // Boards take 4 and up: yours is 4, then the table in the navigator's order.
  { id: "player", label: "Your board", icon: "🦇", key: "4" },
];

/**
 * Which views hold something the deciding player needs to do right now —
 * their navigator entries pulse. Nothing switches views on its own.
 * Dialog steps (Missions, Ready, Digest, the Nanny) open over any view.
 */
export function attentionFor(
  step: TurnStep | undefined,
  legal: readonly Action[],
  pending: { kind: string } | null,
): Set<ViewId> {
  const out = new Set<ViewId>();
  if (!step) return out;
  const has = (type: Action["type"]) => legal.some((a) => a.type === type);
  if (pending?.kind === "hypnosis") out.add("shop");
  if (pending?.kind === "card" || pending?.kind === "token") out.add("player");
  if (step === "manipulate") out.add("player");
  if (step === "move" || step === "push" || step === "inspire") out.add("map");
  if (has("hunt-rose") || has("hunt-tavern")) out.add("map");
  if (step === "act" && has("hunt")) out.add("shop");
  if (pending?.kind === "instant") {
    if (legal.some((a) => a.type === "instant" && a.space)) out.add("map");
    if (legal.some((a) => a.type === "instant" && a.row !== undefined)) out.add("shop");
  }
  return out;
}
