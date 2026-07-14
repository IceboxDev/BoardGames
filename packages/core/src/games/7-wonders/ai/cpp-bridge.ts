/**
 * Bridge between the TS engine and the standalone C++ search agent
 * (`cpp/seven-wonders`, `sw7 move`). Because the two engines are parity-identical,
 * the wire format is pure integers: cards become CardType ids (index into
 * [...CARDS, ...GUILDS]), and the C++ returns a canonical move tuple that maps
 * back to a `SevenWondersAction`. These functions are pure; the subprocess call
 * lives server-side (see runCppAgent in the server / scripts/test-cpp-bridge.ts).
 */
import { CARDS, GUILDS } from "../cards";
import { EDIFICES } from "../edifice";
import { getLegalActions } from "../rules";
import type { CardId, GameState, SevenWondersAction } from "../types";
import { cardIdName, RESOURCE_TYPES, WONDER_IDS } from "../types";

const ALL = [...CARDS, ...GUILDS];
function cardTypeId(id: CardId): number {
  const name = cardIdName(id);
  const age = Number.parseInt(id.slice(id.lastIndexOf("@") + 1), 10);
  const idx = ALL.findIndex((c) => c.name === name && c.age === age);
  if (idx < 0) throw new Error(`no CardType for ${id}`);
  return idx;
}
const resMask = (rs: readonly string[]) =>
  rs.reduce((m, r) => m | (1 << RESOURCE_TYPES.indexOf(r as (typeof RESOURCE_TYPES)[number])), 0);
const EDSTATUS: Record<string, number> = { project: 0, built: 1, failed: 2 };

/** Serialize the position for `seat` into the integer stream `sw7 move` reads on stdin. */
export function serializePosition(gs: GameState, seat: number): string {
  const out: number[] = [];
  out.push(seat, gs.age, gs.turn, gs.phase === "pending" ? 1 : 0, gs.edifices ? 1 : 0);
  for (let p = 0; p < gs.playerCount; p++) {
    const pl = gs.players[p];
    out.push(
      WONDER_IDS.indexOf(pl.wonderId),
      pl.side === "A" ? 0 : 1,
      pl.stagesBuilt,
      pl.coins,
      pl.freeBuildUsedThisAge ? 1 : 0,
    );
    out.push(pl.tableau.length, ...pl.tableau.map(cardTypeId));
    out.push(pl.militaryTokens.length, ...pl.militaryTokens);
    out.push(pl.bonusShields);
    out.push(pl.victoryTokens.length, ...pl.victoryTokens);
    out.push(pl.debtTokens.length, ...pl.debtTokens);
    out.push(pl.bonusProduction.length, ...pl.bonusProduction.map(resMask));
    out.push(gs.hands[p].length, ...gs.hands[p].map(cardTypeId));
  }
  out.push(gs.discard.length, ...gs.discard.map(cardTypeId));
  const eds = gs.edifices ?? [];
  out.push(eds.length);
  for (const e of eds) {
    const idx = EDIFICES.findIndex((x) => x.name === e.card);
    out.push(
      e.age,
      idx,
      e.pawnsTotal,
      e.pawnsLeft,
      EDSTATUS[e.status],
      e.participants.length,
      ...e.participants,
    );
  }
  out.push(gs.pendingQueue.length);
  for (const q of gs.pendingQueue) out.push(q.kind === "halikarnassos" ? 1 : 0, q.playerIndex);
  // Decks the searcher hasn't reached yet (future ages only).
  const d2 = gs.age < 2 ? gs.ageDecks[2] : [];
  const d3 = gs.age < 3 ? gs.ageDecks[3] : [];
  out.push(d2.length, ...d2.map(cardTypeId));
  out.push(d3.length, ...d3.map(cardTypeId));
  return out.join(" ");
}

type Canon = [number, number, number, number, number];

/** Engine-neutral canonical tuple of a TS action (matches C++ canonOf). */
export function canonOfAction(action: SevenWondersAction): Canon {
  const base = (a: SevenWondersAction, seventh: boolean): Canon => {
    const off = seventh ? 10 : 0;
    if (a.type === "discard") return [0 + off, cardTypeId(a.cardId), 0, 0, 0];
    if (a.type === "build-wonder")
      return [
        4 + off,
        cardTypeId(a.cardId),
        a.payment.left,
        a.payment.right,
        a.participate ? 1 : 0,
      ];
    if (a.type === "play-card") {
      if (a.payment.kind === "resources")
        return [1 + off, cardTypeId(a.cardId), a.payment.left, a.payment.right, 0];
      if (a.payment.kind === "chain") return [2 + off, cardTypeId(a.cardId), 0, 0, 0];
      return [3 + off, cardTypeId(a.cardId), 0, 0, 0];
    }
    throw new Error(`uncanonicalizable inner action ${a.type}`);
  };
  if (action.type === "pick-discard") return [5, cardTypeId(action.cardId), 0, 0, 0];
  if (action.type === "skip-pending") return [6, 0, 0, 0, 0];
  if (action.type === "play-seventh") return base(action.action, true);
  return base(action, false);
}

/** Map a canonical tuple (from `sw7 move`) back to the matching legal action. */
export function matchCanon(gs: GameState, seat: number, canon: Canon): SevenWondersAction | null {
  const key = canon.join(",");
  for (const a of getLegalActions(gs, seat)) if (canonOfAction(a).join(",") === key) return a;
  return null;
}
