import { z } from "zod";
import type { BgaEvent } from "../../../protocol/http/bga";
import { CARD_BY_NAME } from "../cards";
import type { SevenWondersPlayerBoardView, SevenWondersPlayerView } from "../machine";
import type { Age, CardId, ScienceSymbol, WonderId } from "../types";
import { makeCardId, WONDER_IDS } from "../types";

/**
 * Pure fold from raw BGA events (one `gamedatas` checkpoint + notifications)
 * to the same spectator view shape the native board components render
 * (`me: null`). Runs client-side; the server never interprets BGA payloads.
 *
 * BGA's shapes are undocumented and drift — every extractor here is lenient
 * (loose objects, coerced numbers, several known key spellings) and every
 * unknown notification type is a NO-OP, so drift degrades the view instead
 * of crashing it. Grow `fixtures/` with real captures (see
 * tools/bga-userscript/README.md) and lock behavior in adapter.test.ts.
 */

// ── Lenient local schemas (never on the wire) ───────────────────────────────

/** BGA serializes most numbers as strings. */
const num = z.coerce.number();

const BgaPlayerSchema = z.looseObject({
  id: z.coerce.string(),
  name: z.string().optional(),
});

const GamedatasSchema = z.looseObject({
  players: z.record(z.string(), BgaPlayerSchema).optional(),
  playerorder: z.array(z.coerce.string()).optional(),
});

const NotifSchema = z.looseObject({
  type: z.string(),
  args: z.looseObject({}).optional(),
});

// ── Fold state ──────────────────────────────────────────────────────────────

interface BgaPlayerAcc {
  bgaId: string;
  name: string;
  coins: number;
  /** English card names as announced by BGA; mapped to our defs at view time. */
  tableauNames: string[];
  wonderId: WonderId | null;
  stagesBuilt: number;
  militaryTokens: number[];
  handCount: number;
}

export interface BgaFoldState {
  gamedatasSeen: boolean;
  seatOrder: string[];
  players: Map<string, BgaPlayerAcc>;
  age: Age;
  turn: number;
  discardCount: number;
  /** Notification types seen but not understood — surfaced for debugging. */
  unknownNotifTypes: Set<string>;
}

export function initBgaFold(): BgaFoldState {
  return {
    gamedatasSeen: false,
    seatOrder: [],
    players: new Map(),
    age: 1,
    turn: 1,
    discardCount: 0,
    unknownNotifTypes: new Set(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newPlayer(bgaId: string, name: string): BgaPlayerAcc {
  return {
    bgaId,
    name,
    coins: 3,
    tableauNames: [],
    wonderId: null,
    stagesBuilt: 0,
    militaryTokens: [],
    handCount: 7,
    // Age/coins get corrected by gamedatas/notifs when the table is mid-game.
  };
}

/** Probe several key spellings; BGA args are not stable across games/versions. */
function pick(args: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (args[key] !== undefined) return args[key];
  }
  return undefined;
}

function asNumber(value: unknown): number | null {
  const parsed = num.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

/** "The Hanging Gardens of Babylon" / "babylon_a" / "Babylon (A)" → "babylon". */
export function matchWonderId(raw: string): WonderId | null {
  const lower = raw.toLowerCase();
  for (const id of WONDER_IDS) {
    if (lower.includes(id)) return id;
  }
  if (lower.includes("pyramid")) return "giza";
  if (lower.includes("colossus")) return "rhodes";
  if (lower.includes("mausoleum")) return "halikarnassos";
  if (lower.includes("artemis")) return "ephesos";
  if (lower.includes("zeus") || lower.includes("statue")) return "olympia";
  if (lower.includes("lighthouse")) return "alexandria";
  if (lower.includes("gardens")) return "babylon";
  return null;
}

function playerFor(state: BgaFoldState, rawId: unknown): BgaPlayerAcc | null {
  const id = asString(rawId);
  if (id === null) return null;
  let player = state.players.get(id);
  if (!player) {
    player = newPlayer(id, `BGA ${id}`);
    state.players.set(id, player);
    state.seatOrder.push(id);
  }
  return player;
}

// ── The fold ────────────────────────────────────────────────────────────────

function applyGamedatas(state: BgaFoldState, payload: unknown): BgaFoldState {
  const parsed = GamedatasSchema.safeParse(payload);
  if (!parsed.success) return state;
  const data = parsed.data;

  const next: BgaFoldState = { ...initBgaFold(), gamedatasSeen: true };
  const order =
    data.playerorder && data.playerorder.length > 0
      ? data.playerorder
      : Object.keys(data.players ?? {});

  for (const id of order) {
    const raw = data.players?.[id];
    const acc = newPlayer(id, raw?.name ?? `BGA ${id}`);
    if (raw) {
      const coins = asNumber(pick(raw, ["coins", "gold", "money"]));
      if (coins !== null) acc.coins = coins;
      const wonder = asString(pick(raw, ["wonder", "wonder_name", "board"]));
      if (wonder) acc.wonderId = matchWonderId(wonder);
      const stages = asNumber(pick(raw, ["wonder_steps", "stages", "steps_built"]));
      if (stages !== null) acc.stagesBuilt = stages;
    }
    next.players.set(id, acc);
    next.seatOrder.push(id);
  }

  const age = asNumber(pick(data, ["age", "current_age"]));
  if (age === 1 || age === 2 || age === 3) next.age = age;

  return next;
}

function applyNotif(state: BgaFoldState, payload: unknown): BgaFoldState {
  const parsed = NotifSchema.safeParse(payload);
  if (!parsed.success) return state;
  const { type, args = {} } = parsed.data;

  // Every branch mutates a structural copy so callers can treat folds as values.
  const next: BgaFoldState = {
    ...state,
    players: new Map([...state.players].map(([k, v]) => [k, { ...v }])),
    seatOrder: [...state.seatOrder],
    unknownNotifTypes: new Set(state.unknownNotifTypes),
  };

  switch (type) {
    case "newAge": {
      const age = asNumber(pick(args, ["age", "ageNum"]));
      if (age === 1 || age === 2 || age === 3) {
        next.age = age;
        next.turn = 1;
        for (const p of next.players.values()) p.handCount = 7;
      }
      return next;
    }

    case "newHand":
    case "newHandNotify": {
      const cards = pick(args, ["cards", "hand"]);
      const count = Array.isArray(cards) ? cards.length : cards ? Object.keys(cards).length : null;
      if (count !== null) {
        for (const p of next.players.values()) p.handCount = count;
        // A fresh hand of N means 7-N cards have been resolved this age.
        next.turn = Math.max(1, Math.min(6, 7 - count + 1));
      }
      return next;
    }

    case "cardsPlayed":
    case "cardPlayed":
    case "buildCard": {
      const player = playerFor(next, pick(args, ["player_id", "playerId", "player"]));
      if (!player) return next;
      const cardName = asString(pick(args, ["card_name", "cardName", "name"]));
      if (cardName && CARD_BY_NAME.has(cardName)) player.tableauNames.push(cardName);
      player.handCount = Math.max(0, player.handCount - 1);
      return next;
    }

    case "wonderBuilt":
    case "buildWonder":
    case "wonderStageBuilt": {
      const player = playerFor(next, pick(args, ["player_id", "playerId", "player"]));
      if (!player) return next;
      const stage = asNumber(pick(args, ["step", "stage", "steps_built"]));
      player.stagesBuilt = stage !== null ? stage : player.stagesBuilt + 1;
      player.handCount = Math.max(0, player.handCount - 1);
      return next;
    }

    case "discardCard":
    case "cardDiscarded": {
      const player = playerFor(next, pick(args, ["player_id", "playerId", "player"]));
      if (player) player.handCount = Math.max(0, player.handCount - 1);
      next.discardCount += 1;
      return next;
    }

    case "coinsChanged":
    case "coinDelta":
    case "coinsScore": {
      const player = playerFor(next, pick(args, ["player_id", "playerId", "player"]));
      if (!player) return next;
      const total = asNumber(pick(args, ["coins", "total"]));
      const delta = asNumber(pick(args, ["delta", "amount", "coinsDelta"]));
      if (total !== null) player.coins = total;
      else if (delta !== null) player.coins += delta;
      return next;
    }

    case "warResult":
    case "warVictory":
    case "warDefeat":
    case "militaryResult": {
      const player = playerFor(next, pick(args, ["player_id", "playerId", "player"]));
      if (!player) return next;
      const token = asNumber(pick(args, ["token", "points", "value"]));
      if (token !== null && token !== 0) player.militaryTokens.push(token);
      return next;
    }

    default:
      next.unknownNotifTypes.add(type);
      return next;
  }
}

export function applyBgaEvent(state: BgaFoldState, event: BgaEvent): BgaFoldState {
  if (event.kind === "gamedatas") return applyGamedatas(state, event.payload);
  return applyNotif(state, event.payload);
}

// ── Projection to the native view shape ─────────────────────────────────────

function tableauIds(names: string[]): CardId[] {
  const seen = new Map<string, number>();
  const ids: CardId[] = [];
  for (const name of names) {
    const def = CARD_BY_NAME.get(name);
    if (!def) continue;
    const copy = seen.get(name) ?? 0;
    seen.set(name, copy + 1);
    ids.push(makeCardId(name, def.age, copy));
  }
  return ids;
}

function boardView(acc: BgaPlayerAcc, index: number): SevenWondersPlayerBoardView {
  const tableau = tableauIds(acc.tableauNames);
  const scienceCounts: Record<ScienceSymbol, number> = { gear: 0, compass: 0, tablet: 0 };
  let scienceWildcards = 0;
  let shields = 0;
  for (const name of acc.tableauNames) {
    const def = CARD_BY_NAME.get(name);
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.kind === "science") scienceCounts[effect.symbol]++;
      if (effect.kind === "science-wildcard") scienceWildcards++;
      if (effect.kind === "shields") shields += effect.amount;
    }
  }
  return {
    index,
    wonderId: acc.wonderId ?? "giza",
    side: "A",
    stagesBuilt: acc.stagesBuilt,
    coins: acc.coins,
    shields,
    militaryTokens: acc.militaryTokens,
    tableau,
    scienceCounts,
    scienceWildcards,
    handCount: acc.handCount,
    hasSelected: false,
  };
}

/** Display names per seat, aligned with `toSpectatorView().players`. */
export function spectatorNames(state: BgaFoldState): string[] {
  return state.seatOrder.map((id) => state.players.get(id)?.name ?? `BGA ${id}`);
}

/** null until the first gamedatas checkpoint has been folded. */
export function toSpectatorView(state: BgaFoldState): SevenWondersPlayerView | null {
  if (!state.gamedatasSeen || state.seatOrder.length === 0) return null;
  const players = state.seatOrder.map((id, index) => {
    const acc = state.players.get(id);
    return boardView(acc ?? newPlayer(id, `BGA ${id}`), index);
  });
  return {
    phase: "selecting",
    age: state.age,
    turn: state.turn,
    playerCount: players.length,
    me: null,
    players,
    discardCount: state.discardCount,
    pending: null,
    lastRevealed: [],
    actionLog: [],
  };
}
