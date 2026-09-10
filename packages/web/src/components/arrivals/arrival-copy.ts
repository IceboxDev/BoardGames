// Every sentence the arrivals takeover says, as pure functions of the data,
// so the wording is unit-tested and the admin composer can preview it.
//
// Voice: the app is doing the celebrating, in the second person to the
// viewer. Purchasers are named (they are being thanked); voters are counted,
// never named — their faces are the only identity the popup carries.

import type { ArrivalCard, ArrivalTotals } from "./arrival-view-model.ts";

const NUMBER_WORDS = ["", "One", "Two", "Three"] as const;

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Distinct purchasers in card order. */
export function purchasersOf(cards: readonly ArrivalCard[]): ArrivalCard["purchaser"][] {
  const seen = new Set<string>();
  const out: ArrivalCard["purchaser"][] = [];
  for (const card of cards) {
    if (seen.has(card.purchaser.id)) continue;
    seen.add(card.purchaser.id);
    out.push(card.purchaser);
  }
  return out;
}

export function arrivalEyebrow(count: number): string {
  return count === 1 ? "New arrival" : "New arrivals";
}

export function arrivalTitle(cards: readonly ArrivalCard[]): string {
  if (cards.length === 1) return `${cards[0]?.title ?? "A new game"} just arrived`;
  const word = NUMBER_WORDS[cards.length] ?? String(cards.length);
  return `${word} new games just arrived`;
}

export function arrivalSubheader(cards: readonly ArrivalCard[]): string {
  const names = joinNames(purchasersOf(cards).map((p) => firstName(p.name)));
  return `The group voted, ${names} bought — here's what's new on the shelf.`;
}

export function voteWord(votes: number): string {
  return votes === 1 ? "vote" : "votes";
}

/** Accessible summary of a card's ring of faces. */
export function voterLabel(votes: number, faces: number): string {
  return `${votes} ${voteWord(votes)} from ${faces} ${faces === 1 ? "player" : "players"}`;
}

/**
 * "Thanks to {names}{rest}" — split so the view can set the names in strong
 * ink. `names` is "you" when the viewer is the only purchaser.
 */
export function thanksSentence(
  cards: readonly ArrivalCard[],
  totals: ArrivalTotals,
  viewerId: string | null,
): { names: string; rest: string } {
  const purchasers = purchasersOf(cards);
  const soleViewer = purchasers.length === 1 && purchasers[0]?.id === viewerId;
  const names = soleViewer ? "you" : joinNames(purchasers.map((p) => firstName(p.name)));
  const them = cards.length === 1 ? "it" : "them";
  const voters =
    totals.voterCount === 1
      ? "the one player whose vote chose"
      : `the ${totals.voterCount} players whose votes chose`;
  return { names, rest: ` for buying ${them}, and to ${voters} ${them}.` };
}

export function collectionHint(cards: readonly ArrivalCard[], viewerId: string | null): string {
  const purchasers = purchasersOf(cards);
  const viewerAmong = purchasers.some((p) => p.id === viewerId);
  if (purchasers.length === 1) {
    const only = purchasers[0];
    return viewerAmong || !only
      ? "Now in your collection"
      : `Now in ${firstName(only.name)}'s collection`;
  }
  return viewerAmong ? "Now in your collections" : "Now in their collections";
}

export function ctaLabel(cards: readonly ArrivalCard[], viewerId: string | null): string {
  const purchasers = purchasersOf(cards);
  const viewerAmong = purchasers.some((p) => p.id === viewerId);
  if (viewerAmong) return "See your collection";
  const only = purchasers.length === 1 ? purchasers[0] : undefined;
  return only ? `See ${firstName(only.name)}'s collection` : "Browse the catalog";
}

/** Where the CTA lands: the one purchaser's collection, the viewer's own
 * when they bought something, else the catalog. */
export function ctaDestination(cards: readonly ArrivalCard[], viewerId: string | null): string {
  const purchasers = purchasersOf(cards);
  if (viewerId && purchasers.some((p) => p.id === viewerId)) return `/u/${viewerId}/collection`;
  const only = purchasers.length === 1 ? purchasers[0] : undefined;
  return only ? `/u/${only.id}/collection` : "/games";
}

/** Shown to the admin next to each photo field. */
export const UPLOAD_GUIDANCE =
  "Shoot portrait — phone upright. Stand the box on a table or shelf, front face to the camera, and fill the frame; we crop to 4:5, so keep the box inside the middle 80%. Daylight, no hands, no flash. At least 1000 × 1250 px.";
