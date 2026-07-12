import { CARD_BY_NAME } from "../cards";
import type { ScienceSymbol } from "../types";
import type { CardTypeInfo, HandTrackState } from "./hand-tracker";
import {
  computeHand,
  initHandTrack,
  recordDiscard,
  recordMyHand,
  recordReveal,
  setCardTypes,
} from "./hand-tracker";
import type { BgaEdificeStatus, BgaEdificeView, BgaPlayerView, BgaSpectatorView } from "./types";

/**
 * Fold from raw BGA events (one `gamedatas` checkpoint + the deduplicated
 * notification stream) to a BGA-native spectator view. Runs client-side; the
 * server never interprets BGA payloads.
 *
 * The whole card/wonder/edifice dictionary ships INSIDE `gamedatas`, so names
 * are resolved from BGA itself rather than a hardcoded table — robust across
 * BGA versions, expansions and wonders (Ur/Carthage) our engine doesn't model.
 *
 * Notifications arrive twice (a WebSocket tee superset + the notifqueue
 * subset); every game notif carries a `uid`, so we dedup on it. Envelope
 * shapes handled: notifqueue `{data:[{type,args,uid}]}` and Centrifugo push
 * `{push:{pub:{data:{data:[...]}}}}`.
 */

// ── BGA resource letters (confirmed against card_types: Lumber Yard=W …) ─────

const RESOURCE_GLYPH: Record<string, string> = {
  W: "🪵",
  S: "🪨",
  C: "🧱",
  O: "⛏️",
  G: "🫙",
  L: "🧵",
  P: "📜",
};

function formatCost(cost: unknown, coinCost?: number): string {
  const parts: string[] = [];
  if (typeof coinCost === "number" && coinCost > 0) parts.push(`${coinCost}🪙`);
  if (Array.isArray(cost)) {
    for (const r of cost) parts.push(RESOURCE_GLYPH[String(r)] ?? String(r));
  }
  return parts.join("") || "free";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Format one effect bag (a wonder stage, a Carthage sub-option, or edifice reward). */
function formatEffect(effect: Record<string, unknown>): string {
  const parts: string[] = [];
  const points = asRecord(effect.points);
  if (points.qt !== undefined) parts.push(`${num(points.qt)} VP`);
  const shield = effect.shield;
  if (num(shield) !== null && num(shield) !== 0) parts.push(`${num(shield)}🛡`);
  const coins = asRecord(effect.coins);
  if (coins.qt !== undefined) parts.push(`${num(coins.qt)}🪙`);
  if (effect.science === "?" || effect.science) parts.push("science");
  if (effect.participation !== undefined) parts.push("participate");
  if (effect.buildFirstEachColor) parts.push("free build");
  if (effect.pickDiscarded) parts.push("from discard");
  const production = asRecord(effect.production);
  if (Array.isArray(production.ress)) {
    parts.push(production.ress.map((r) => RESOURCE_GLYPH[String(r)] ?? String(r)).join("/"));
  }
  if (effect.duplicateguild) parts.push("copy guild");
  if (effect.victorytoken) parts.push(`${num(asRecord(effect.victorytoken).value)} VP token`);
  return parts.join(" · ");
}

interface StageDef {
  cost: string;
  effect: string;
}

/** BGA wonder stage: either a flat effect bag or a numbered choice of bags. */
function formatWonderStages(stages: unknown): StageDef[] {
  const record = asRecord(stages);
  const out: StageDef[] = [];
  for (const key of Object.keys(record).sort()) {
    const stage = asRecord(record[key]);
    const cost = formatCost(stage.cost);
    const choiceKeys = Object.keys(stage).filter((k) => /^\d+$/.test(k));
    const effect =
      choiceKeys.length > 0
        ? choiceKeys.map((k) => formatEffect(asRecord(stage[k]))).join("  /  ")
        : formatEffect(stage);
    out.push({ cost, effect });
  }
  return out;
}

function formatReward(reward: unknown): string {
  const bag = asRecord(reward);
  if (bag.looseDefeatToken) return `${formatEffect(bag)} · remove defeats`.replace(/^ · /, "");
  return formatEffect(bag) || "—";
}

function formatPenalty(penalty: unknown): string {
  const bag = asRecord(penalty);
  const discard = asRecord(bag.discard);
  if (discard.cardCategory) return `discard a ${categoryLabel(String(discard.cardCategory))} card`;
  const coins = asRecord(bag.coins);
  if (coins.qt !== undefined) return `pay ${num(coins.qt)}🪙`;
  if (bag.victorytokenloose !== undefined) return `lose ${num(bag.victorytokenloose)} VP`;
  return "—";
}

function categoryLabel(cat: string): string {
  return (
    {
      raw: "raw",
      man: "manufactured",
      civ: "civilian",
      com: "commercial",
      mil: "military",
      sci: "science",
      gui: "guild",
    }[cat] ?? cat
  );
}

// ── Fold state ──────────────────────────────────────────────────────────────

interface CardTypeDef {
  name: string;
  category: string;
}
interface WonderDef {
  name: string;
  side: string;
  initial: string;
  stages: StageDef[];
}
interface EdificeMetaDef {
  name: string;
  age: number;
  cost: number;
  reward: string;
  penalty: string;
}

interface PlayerAcc {
  id: string;
  name: string;
  wonderId: string;
  coins: number;
  shields: number;
  tokens: number[];
  stagesBuilt: number;
  tableauCardIds: Set<string>;
  tableauNames: string[];
  wildScience: number;
  edificePawns: Set<number>;
}

interface EdificeAcc {
  slot: number;
  metaId: string;
  tokensLeft: number;
  status: BgaEdificeStatus;
  participants: Set<string>;
}

export interface BgaFoldState {
  gamedatasSeen: boolean;
  cardTypes: Map<string, CardTypeDef>;
  /** Card name -> spritesheet cell index (BGA `img`, 0-76 row-major). */
  cardImg: Map<string, number>;
  wonders: Map<string, WonderDef>;
  edificeMeta: Map<string, EdificeMetaDef>;
  seatOrder: string[];
  players: Map<string, PlayerAcc>;
  edifices: Map<number, EdificeAcc>;
  age: number;
  turn: number;
  discardCount: number;
  finished: boolean;
  seenUids: Set<string>;
  /** Distinct card-reveal uids this age — one per turn. */
  revealUids: Set<string>;
  unknownTypes: Set<string>;
  /** Hand deduction (opponents' hands via rotation tracking + elimination). */
  handTrack: HandTrackState;
}

export function initBgaFold(): BgaFoldState {
  return {
    gamedatasSeen: false,
    cardTypes: new Map(),
    cardImg: new Map(),
    wonders: new Map(),
    edificeMeta: new Map(),
    seatOrder: [],
    players: new Map(),
    edifices: new Map(),
    age: 1,
    turn: 1,
    discardCount: 0,
    finished: false,
    seenUids: new Set(),
    revealUids: new Set(),
    unknownTypes: new Set(),
    handTrack: initHandTrack(),
  };
}

// ── Notif extraction ────────────────────────────────────────────────────────

interface RawNotif {
  type: string;
  args: Record<string, unknown>;
  uid?: string;
}

/** Pull game notifs out of either envelope shape a bridge event may carry. */
function extractNotifs(payload: unknown): RawNotif[] {
  const p = asRecord(payload);
  const data = asRecord(p.data);
  const out: RawNotif[] = [];

  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      const rec = asRecord(n);
      if (typeof rec.type === "string") {
        out.push({
          type: rec.type,
          args: asRecord(rec.args),
          uid: typeof rec.uid === "string" ? rec.uid : undefined,
        });
      }
    }
  };

  // notifqueue: { packet_type, channel, data: [ {type,args,uid} ] }
  collect(data.data);

  // Centrifugo WebSocket push: { push: { pub: { data: { data: [...] } } } }
  const pub = asRecord(asRecord(data.push).pub);
  const pubData = asRecord(pub.data);
  collect(pubData.data);

  return out;
}

// ── gamedatas checkpoint ────────────────────────────────────────────────────

function applyGamedatas(payload: unknown): BgaFoldState {
  // A gamedatas checkpoint is a full-state reset — the prior fold is discarded.
  const gd = asRecord(payload);
  const next = initBgaFold();
  next.gamedatasSeen = true;

  const trackTypes = new Map<string, CardTypeInfo>();
  for (const [id, raw] of Object.entries(asRecord(gd.card_types))) {
    const c = asRecord(raw);
    const name = String(c.name ?? id);
    const category = String(c.category ?? "");
    next.cardTypes.set(id, { name, category });
    const qtRaw = asRecord(c.qt);
    const qt: Record<string, number> = {};
    for (const [k, v] of Object.entries(qtRaw)) qt[k] = num(v) ?? 0;
    trackTypes.set(id, { name, category, age: num(c.age) ?? 0, qt });
    // BGA's `img` is a unique 0-76 sprite index (across imgtypes) matching the
    // card spritesheet's row-major cells — see bga/CardSprite.
    const img = num(c.img);
    if (img !== null) next.cardImg.set(name, img);
  }
  for (const [id, raw] of Object.entries(asRecord(gd.wonders))) {
    const w = asRecord(raw);
    const initial = Array.isArray(w.ress) && w.ress.length > 0 ? String(w.ress[0]) : "";
    next.wonders.set(id, {
      name: String(w.name ?? id),
      side: String(w.side ?? ""),
      initial: RESOURCE_GLYPH[initial] ?? initial,
      stages: formatWonderStages(w.stages),
    });
  }
  for (const [id, raw] of Object.entries(asRecord(gd.edifice_meta))) {
    const m = asRecord(raw);
    next.edificeMeta.set(id, {
      name: String(m.name ?? id),
      age: num(m.age) ?? 0,
      cost: num(m.cost) ?? 0,
      reward: formatReward(m.reward),
      penalty: formatPenalty(m.penalty),
    });
  }

  const order = Array.isArray(gd.playerorder) ? gd.playerorder.map(String) : [];
  const players = asRecord(gd.players);
  const seats = order.length > 0 ? order : Object.keys(players);
  for (const pid of seats) {
    const p = asRecord(players[pid]);
    next.seatOrder.push(pid);
    next.players.set(pid, {
      id: pid,
      name: String(p.name ?? `BGA ${pid}`),
      wonderId: p.wonder !== undefined ? String(p.wonder) : "",
      coins: num(p.coin) ?? 3,
      shields: 0,
      tokens: [],
      stagesBuilt: num(p.wonderStep) ?? 0,
      tableauCardIds: new Set(),
      tableauNames: [],
      wildScience: 0,
      edificePawns: new Set(),
    });
  }

  // Edifice slots in play: key = slot(=age), value.id = edifice_meta id.
  for (const [slot, raw] of Object.entries(asRecord(gd.edifices))) {
    const e = asRecord(raw);
    next.edifices.set(num(slot) ?? 0, {
      slot: num(slot) ?? 0,
      metaId: String(e.id ?? ""),
      tokensLeft: num(e.tokens) ?? 0,
      status: num(e.status) === 1 ? "built" : "project",
      participants: new Set(),
    });
  }

  next.age = num(gd.age) ?? 1;
  next.discardCount = num(gd.discardCount) ?? 0;

  // Seed hand tracking. My hand + card ids arrive via `newHand`/`cardsPlayed`.
  next.handTrack.seatOrder = [...next.seatOrder];
  next.handTrack.age = next.age;
  setCardTypes(next.handTrack, trackTypes);
  // gamedatas may already carry my hand (rejoining mid-game).
  const myHand = Array.isArray(gd.hand) ? gd.hand : [];
  if (myHand.length > 0) {
    const ids: number[] = [];
    for (const raw of myHand) {
      const c = asRecord(raw);
      const id = num(c.id);
      if (id === null) continue;
      ids.push(id);
      next.handTrack.typeById.set(id, String(c.type));
      next.handTrack.myPlayerId ??= c.locationArg !== undefined ? String(c.locationArg) : null;
    }
    recordMyHand(next.handTrack, ids);
  }
  return next;
}

// ── notif application ───────────────────────────────────────────────────────

function edificeForAge(state: BgaFoldState, age: number): EdificeAcc | undefined {
  return state.edifices.get(age);
}

function applyNotif(state: BgaFoldState, notif: RawNotif): void {
  const { type, args, uid } = notif;
  const players = state.players;

  switch (type) {
    case "newAge": {
      const age = num(args.age);
      // Any earlier edifice still a project when the age turns has failed.
      for (const e of state.edifices.values()) {
        if (age !== null && e.slot < age && e.status === "project" && e.tokensLeft > 0) {
          e.status = "failed";
        }
      }
      if (age !== null) {
        state.age = age;
        state.handTrack.age = age;
      }
      state.turn = 1;
      state.revealUids.clear();
      break;
    }

    case "newHand": {
      const cards = Array.isArray(args.cards) ? args.cards : [];
      const ids: number[] = [];
      for (const raw of cards) {
        const card = asRecord(raw);
        const id = num(card.id);
        if (id === null) continue;
        ids.push(id);
        state.handTrack.typeById.set(id, String(card.type));
        state.handTrack.myPlayerId ??=
          card.locationArg !== undefined ? String(card.locationArg) : null;
      }
      recordMyHand(state.handTrack, ids);
      break;
    }

    case "cardsPlayed": {
      const cards = asRecord(args.cards);
      const newReveal = uid !== undefined && !state.revealUids.has(uid);
      const plays: Array<{ playerId: string; id: number }> = [];
      for (const raw of Object.values(cards)) {
        const card = asRecord(raw);
        const cardId = String(card.id ?? "");
        const pid = String(card.locationArg ?? "");
        const idNum = num(card.id);
        if (idNum !== null) {
          state.handTrack.typeById.set(idNum, String(card.type));
          plays.push({ playerId: pid, id: idNum });
        }
        const player = players.get(pid);
        if (!player || player.tableauCardIds.has(cardId)) continue;
        player.tableauCardIds.add(cardId);
        const def = state.cardTypes.get(String(card.type));
        player.tableauNames.push(def?.name ?? `#${card.type}`);
      }
      // One reveal = one turn; count each distinct reveal once (fires twice).
      if (newReveal) {
        state.revealUids.add(uid);
        state.turn += 1;
        recordReveal(state.handTrack, plays);
      }
      break;
    }

    case "discard": {
      const id = num(args.card_id);
      if (id !== null) recordDiscard(state.handTrack, id);
      break;
    }

    case "wonderBuild": {
      const player = players.get(String(args.player_id));
      const step = num(args.step);
      if (player && step !== null) player.stagesBuilt = step;
      break;
    }

    case "coinDelta": {
      const player = players.get(String(args.player_id));
      const coin = num(args.coin);
      if (player && coin !== null) player.coins = coin;
      break;
    }

    case "updateMilitaryStrength": {
      for (const [pid, val] of Object.entries(asRecord(args.militaryStrength))) {
        const player = players.get(pid);
        const shields = num(val);
        if (player && shields !== null) player.shields = shields;
      }
      break;
    }

    case "warVictory": {
      const player = players.get(String(args.player_id));
      const points = num(args.points);
      if (player && points !== null && points !== 0) player.tokens.push(points);
      break;
    }

    case "additionalScienceSymbols": {
      // Wildcard science granted (e.g. Babylon stage, Scientists Guild).
      const player = [...players.values()].find((p) => p.name === String(args.player_name));
      const count = num(args.count);
      if (player && count !== null) player.wildScience += count;
      break;
    }

    case "updateDiscardCount": {
      const cnt = num(args.cnt);
      if (cnt !== null) state.discardCount = cnt;
      break;
    }

    case "edificeParticipation": {
      const age = num(args.age);
      const player = players.get(String(args.player_id));
      if (age !== null) {
        const edifice = edificeForAge(state, age);
        if (edifice) {
          if (player) edifice.participants.add(player.id);
          edifice.tokensLeft = Math.max(0, edifice.tokensLeft - 1);
        }
        if (player) player.edificePawns.add(age);
      }
      break;
    }

    case "edificeComplete": {
      const age = num(args.age);
      if (age !== null) {
        const edifice = edificeForAge(state, age);
        if (edifice) {
          edifice.status = "built";
          edifice.tokensLeft = 0;
        }
      }
      break;
    }

    case "resultsAvailable":
    case "tableWindowSevenWonder": {
      state.finished = true;
      // Any un-built edifice at game end has failed.
      for (const e of state.edifices.values()) {
        if (e.status === "project" && e.tokensLeft > 0) e.status = "failed";
      }
      break;
    }

    default:
      state.unknownTypes.add(type);
  }
}

/**
 * Notif types whose handlers ACCUMULATE (append a token, add a pawn, sum
 * science) and so must be applied exactly once — deduped by `uid`. Every
 * other handler sets absolute state (coins, shields, stage, tableau-by-card-id)
 * and is safe to re-apply, so those are NOT deduped: the same event arrives on
 * both the WebSocket tee and the notifqueue, and one copy may be truncated
 * (an older userscript capped payload depth) — re-applying the intact copy
 * heals it.
 */
const DEDUP_TYPES = new Set(["warVictory", "edificeParticipation", "additionalScienceSymbols"]);

export function applyBgaEvent(
  state: BgaFoldState,
  event: { kind: "gamedatas" | "notif"; payload: unknown },
): BgaFoldState {
  if (event.kind === "gamedatas") return applyGamedatas(event.payload);
  if (!state.gamedatasSeen) return state;
  for (const notif of extractNotifs(event.payload)) {
    if (DEDUP_TYPES.has(notif.type)) {
      if (!notif.uid || state.seenUids.has(notif.uid)) continue;
      state.seenUids.add(notif.uid);
    }
    applyNotif(state, notif);
  }
  return state;
}

// ── Projection ──────────────────────────────────────────────────────────────

function scienceOf(acc: PlayerAcc): BgaPlayerView["science"] {
  const counts: Record<ScienceSymbol, number> = { gear: 0, compass: 0, tablet: 0 };
  for (const name of acc.tableauNames) {
    for (const effect of CARD_BY_NAME.get(name)?.effects ?? []) {
      if (effect.kind === "science") counts[effect.symbol]++;
    }
  }
  return { ...counts, wild: acc.wildScience };
}

export function toSpectatorView(state: BgaFoldState): BgaSpectatorView | null {
  if (!state.gamedatasSeen || state.seatOrder.length === 0) return null;

  const players: BgaPlayerView[] = state.seatOrder.map((pid, seat) => {
    const acc = state.players.get(pid);
    if (!acc) {
      return {
        id: pid,
        name: `BGA ${pid}`,
        seat,
        wonderName: "?",
        side: "",
        coins: 0,
        shields: 0,
        militaryTokens: [],
        wonderInitial: "",
        stages: [],
        stagesBuilt: 0,
        tableau: [],
        science: { gear: 0, compass: 0, tablet: 0, wild: 0 },
        edificePawns: [],
        hand: null,
      };
    }
    const wonder = state.wonders.get(acc.wonderId);
    return {
      id: acc.id,
      name: acc.name,
      seat,
      wonderName: wonder?.name ?? "?",
      side: wonder?.side ?? "",
      coins: acc.coins,
      shields: acc.shields,
      militaryTokens: acc.tokens,
      wonderInitial: wonder?.initial ?? "",
      stages: (wonder?.stages ?? []).map((s, i) => ({
        cost: s.cost,
        effect: s.effect,
        built: i < acc.stagesBuilt,
      })),
      stagesBuilt: acc.stagesBuilt,
      tableau: acc.tableauNames.map((name) => ({ name, category: categoryOf(name) })),
      science: scienceOf(acc),
      edificePawns: [...acc.edificePawns].sort(),
      hand: state.finished ? null : computeHand(state.handTrack, seat),
    };
  });

  const edifices: BgaEdificeView[] = [...state.edifices.values()]
    .sort((a, b) => a.slot - b.slot)
    .map((e) => {
      const meta = state.edificeMeta.get(e.metaId);
      return {
        slot: e.slot,
        name: meta?.name ?? "Edifice",
        cost: `${meta?.cost ?? 0}🪙`,
        reward: meta?.reward ?? "—",
        penalty: meta?.penalty ?? "—",
        tokensLeft: e.tokensLeft,
        status: e.status,
        participants: [...e.participants].map((pid) => state.players.get(pid)?.name ?? pid),
      };
    });

  return {
    age: state.age,
    turn: state.turn,
    discardCount: state.discardCount,
    players,
    edifices,
    cardImg: Object.fromEntries(state.cardImg),
    finished: state.finished,
  };
}

// Tableau category via our own card DB (names match BGA for base cards).
const COLOR_TO_CATEGORY: Record<string, string> = {
  brown: "raw",
  grey: "man",
  blue: "civ",
  yellow: "com",
  red: "mil",
  green: "sci",
  purple: "gui",
};
function categoryOf(name: string): string {
  const color = CARD_BY_NAME.get(name)?.color;
  return color ? (COLOR_TO_CATEGORY[color] ?? "") : "";
}
