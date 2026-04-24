import type { GearCard, GearKind } from "./types";
import { GEAR_COPIES, GEAR_KINDS, GEAR_TRIGGERS } from "./types";

/**
 * Build the full 37-card gear deck. For each kind we issue one card per
 * entry of `GEAR_TRIGGERS[kind]` — each physical copy is bound to exactly
 * one trigger from the kind's list. (E.g. 2 sunscreens = one bound to
 * `take-photo`, one to `exchange-A`; activating each gives +1 Sun.)
 */
export function buildGearDeck(startId: number): { cards: GearCard[]; nextId: number } {
  const cards: GearCard[] = [];
  let nextId = startId;
  for (const kind of GEAR_KINDS) {
    const triggers = GEAR_TRIGGERS[kind];
    for (const trigger of triggers) {
      cards.push({ id: nextId++, kind, trigger });
    }
  }
  return { cards, nextId };
}

export function totalGearCount(): number {
  return GEAR_KINDS.reduce((sum: number, k: GearKind) => sum + (GEAR_COPIES[k] ?? 0), 0);
}
