import type { CardId, Payment } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";

/** The build and wonder moves of one turn, already unwrapped from Babylon's `play-seventh`. */
export type InnerAction =
  | { type: "play-card"; cardId: CardId; payment: Payment }
  | {
      type: "build-wonder";
      cardId: CardId;
      payment: { kind: "resources"; left: number; right: number };
      participate?: boolean;
    }
  | { type: "discard"; cardId: CardId };

/** How a card in your hand can be built right now — read off the legal moves only. */
export type BuildPrice =
  | { kind: "chain" }
  | { kind: "free" }
  | { kind: "coins"; coins: number }
  | { kind: "olympia" }
  | { kind: "none"; reason: string };

export interface CardOptions {
  price: BuildPrice;
  /** Every way to pay for building it. */
  play: Payment[];
  /** Every way to pay for a wonder stage with it (participation dupes removed). */
  wonder: Payment[];
  canDiscard: boolean;
  canParticipate: boolean;
}

export function paymentTotal(p: Payment): number {
  return p.kind === "resources" ? p.left + p.right : 0;
}

/** Distinct payments, cheapest first (chains and free builds lead). */
export function sortPayments(payments: Payment[]): Payment[] {
  const seen = new Set<string>();
  const out: Payment[] = [];
  for (const p of payments) {
    const key = p.kind === "resources" ? `r:${p.left}:${p.right}` : p.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  const rank = (p: Payment) => (p.kind === "chain" ? -2 : p.kind === "free-build" ? -1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || paymentTotal(a) - paymentTotal(b));
}

export function priceOf(play: Payment[], alreadyBuilt: boolean): BuildPrice {
  if (play.some((p) => p.kind === "chain")) return { kind: "chain" };
  const coins = play.filter((p) => p.kind === "resources").map(paymentTotal);
  const min = coins.length > 0 ? Math.min(...coins) : null;
  if (min === 0) return { kind: "free" };
  if (play.some((p) => p.kind === "free-build")) return { kind: "olympia" };
  if (min !== null) return { kind: "coins", coins: min };
  return {
    kind: "none",
    reason: alreadyBuilt ? "Already in your city" : "Can't afford it, even buying from neighbours",
  };
}

/** Everything each hand card can do this turn, keyed by card. */
export function cardOptions(
  hand: readonly CardId[],
  actions: readonly InnerAction[],
  tableau: readonly CardId[],
): Map<CardId, CardOptions> {
  const built = new Set(tableau.map(cardIdName));
  const out = new Map<CardId, CardOptions>();
  for (const id of hand) {
    const mine = actions.filter((a) => a.cardId === id);
    const play = sortPayments(mine.flatMap((a) => (a.type === "play-card" ? [a.payment] : [])));
    const wonder = sortPayments(
      mine.flatMap((a) => (a.type === "build-wonder" ? [a.payment] : [])),
    );
    out.set(id, {
      price: priceOf(play, built.has(cardIdName(id))),
      play,
      wonder,
      canDiscard: mine.some((a) => a.type === "discard"),
      canParticipate: mine.some((a) => a.type === "build-wonder" && a.participate === true),
    });
  }
  return out;
}

/** "Free", "Chain", "3" — the short price a button or badge shows. */
export function priceLabel(price: BuildPrice): string {
  switch (price.kind) {
    case "chain":
      return "Chain";
    case "free":
      return "Free";
    case "olympia":
      return "Olympia";
    case "coins":
      return String(price.coins);
    case "none":
      return "—";
  }
}
