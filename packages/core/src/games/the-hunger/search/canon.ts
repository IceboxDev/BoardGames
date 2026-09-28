// ---------------------------------------------------------------------------
// Canonical text of a GameState and a 64-bit hash of it — the cross-engine
// contract with the C++ port (`cpp/the-hunger/src/canon.cpp` emits the SAME
// bytes). Every rules-relevant field is written, in a fixed key order, with
// optional fields normalised (`used ?? 0`, `carried ?? false`,
// `chosen ?? null`); the `log`, the `seed` and each seat's controller
// (`type`, `aiStrategy`) are left out, as the engine never reads them.
// Object-keyed maps (chests, crypts) are written with their keys sorted.
//
// Change this format only together with canon.cpp: the parity fixtures
// (`scripts/dump-hunger-parity.ts`) record these hashes.
// ---------------------------------------------------------------------------

import type { Action, GameState, HungerResult, PlayerState, TurnState } from "../types";

const str = (s: string): string => `"${s}"`;
const optStr = (s: string | null | undefined): string => (s == null ? "null" : str(s));
const num = (n: number): string => String(n);
const optNum = (n: number | null | undefined): string => (n == null ? "null" : String(n));
const bool = (b: boolean | undefined): string => (b ? "true" : "false");
const strs = (xs: readonly string[]): string => `[${xs.map(str).join(",")}]`;
const nums = (xs: readonly number[]): string => `[${xs.join(",")}]`;

function sortedKeys(o: Record<string, unknown>): string[] {
  return Object.keys(o).sort();
}

function player(p: PlayerState): string {
  return (
    `{"index":${num(p.index)},"vampire":${num(p.vampire)}` +
    `,"deck":${strs(p.deck)},"hand":${strs(p.hand)}` +
    `,"playArea":[${p.playArea
      .map(
        (c) =>
          `{"id":${str(c.id)},"resolved":${bool(c.resolved)},"used":${num(c.used ?? 0)},"carried":${bool(c.carried)}}`,
      )
      .join(",")}]` +
    `,"discard":${strs(p.discard)},"digested":${strs(p.digested)}` +
    `,"missions":${strs(p.missions)},"usedMissions":${strs(p.usedMissions)}` +
    `,"bonus":[${p.bonus
      .map((b) => `{"id":${str(b.id)},"used":${bool(b.used)},"chosen":${optStr(b.chosen)}}`)
      .join(",")}]` +
    `,"pos":${str(p.pos)},"placedAt":${num(p.placedAt)},"resting":${bool(p.resting)}` +
    `,"vp":${num(p.vp)},"castleTile":${optNum(p.castleTile)},"castleOrder":${optNum(p.castleOrder)}` +
    `,"hunted":${num(p.hunted)},"parasolTurnUsed":${bool(p.parasolTurnUsed)}}`
  );
}

function turn(t: TurnState): string {
  const pick = t.missionPick
    ? `{"source":${optStr(t.missionPick.source)},"offered":${strs(t.missionPick.offered)},"keep":${num(t.missionPick.keep)}}`
    : "null";
  return (
    `{"player":${num(t.player)},"step":${str(t.step)},"stage":${num(t.stage)}` +
    `,"bonusSpeed":${num(t.bonusSpeed)},"speed":${num(t.speed)},"speedLeft":${num(t.speedLeft)}` +
    `,"moved":${bool(t.moved)},"spaceUsed":${bool(t.spaceUsed)},"hunts":${num(t.hunts)}` +
    `,"extraHunts":${num(t.extraHunts)},"col1Hunts":${num(t.col1Hunts)},"col1Used":${num(t.col1Used)}` +
    `,"huntedHumans":[${t.huntedHumans
      .map((h) => `{"category":${str(h.category)},"region":${str(h.region)}}`)
      .join(",")}]` +
    `,"trackHunts":[${t.trackHunts
      .map((h) => `{"col":${num(h.col)},"region":${str(h.region)},"human":${bool(h.human)}}`)
      .join(",")}]` +
    `,"touched":${bool(t.touched)},"nannyQueue":${nums(t.nannyQueue)},"pushQueue":${nums(t.pushQueue)}` +
    `,"readyQueue":${strs(t.readyQueue)},"missionPick":${pick}` +
    `,"pendingInspire":${num(t.pendingInspire)},"pendingDigest":${num(t.pendingDigest)}` +
    `,"digestCategory":${optStr(t.digestCategory)},"confused":${bool(t.confused)}` +
    `,"extraTurn":${bool(t.extraTurn)}}`
  );
}

function result(r: HungerResult): string {
  return (
    `{"scores":${nums(r.scores)},"winner":${optNum(r.winner)},"winners":${nums(r.winners)}` +
    `,"placements":${nums(r.placements)},"breakdown":[${r.breakdown
      .map(
        (b) =>
          `{"duringPlay":${num(b.duringPlay)},"cardBonuses":${num(b.cardBonuses)}` +
          `,"publicMissions":${num(b.publicMissions)},"personalMissions":${num(b.personalMissions)}` +
          `,"sunrise":${num(b.sunrise)},"fate":${str(b.fate)},"total":${num(b.total)}` +
          `,"missions":[${b.missions
            .map(
              (m) =>
                `{"id":${str(m.id)},"vp":${num(m.vp)},"public":${bool(m.public)},"used":${bool(m.used)}}`,
            )
            .join(",")}]` +
          `,"cards":[${b.cards.map((c) => `{"card":${str(c.card)},"vp":${num(c.vp)}}`).join(",")}]}`,
      )
      .join(",")}]}`
  );
}

/** Every rules-relevant field of `state` as canonical text (no log, no seed). */
export function canonicalState(state: GameState): string {
  const o = state.options;
  const chests = sortedKeys(state.chests)
    .map((k) => `${str(k)}:${optStr(state.chests[k])}`)
    .join(",");
  const crypts = sortedKeys(state.crypts)
    .map((k) => `${str(k)}:${strs(state.crypts[k])}`)
    .join(",");
  return (
    `{"options":{"mode":${str(o.mode)},"board":${str(o.board)},"beginnerSafeMountains":${bool(o.beginnerSafeMountains)}}` +
    `,"setupOffers":[${state.setupOffers.map(strs).join(",")}]` +
    `,"rng":${num(state.rng | 0)},"turn":${num(state.turn)},"phase":${str(state.phase)}` +
    `,"players":[${state.players.map(player).join(",")}]` +
    `,"order":${nums(state.order)}` +
    `,"current":${state.current ? turn(state.current) : "null"}` +
    `,"track":[${state.track.map((row) => `[${row.map(strs).join(",")}]`).join(",")}]` +
    `,"huntDeck":${strs(state.huntDeck)},"tavern":${strs(state.tavern)},"roses":${strs(state.roses)}` +
    `,"chests":{${chests}},"crypts":{${crypts}}` +
    `,"publicMissions":${strs(state.publicMissions)},"castleTiles":${nums(state.castleTiles)}` +
    `,"castleArrivals":${num(state.castleArrivals)},"placeCounter":${num(state.placeCounter)}` +
    `,"result":${state.result ? result(state.result) : "null"}}`
  );
}

const TWO32 = 0x100000000;

/** 64-bit FNV-1a over the UTF-8 bytes of `text`, as 16 lower-case hex digits. */
export function fnv1a64(text: string): string {
  // The 64-bit state as two 32-bit halves; the prime is 2^40 + 0x1b3.
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]) >>> 0;
    const l = lo * 0x1b3;
    const carry = Math.floor(l / TWO32);
    hi = (Math.imul(hi, 0x1b3) + carry + (lo << 8)) >>> 0;
    lo = l >>> 0;
  }
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/** The canonical state's FNV-1a 64 hash — equal in the TS and C++ engines. */
export function stateHash(state: GameState): string {
  return fnv1a64(canonicalState(state));
}

/** An action as one line of text, fields in a fixed order (`~` = absent). */
export function canonicalAction(a: Action): string {
  const o = (x: string | number | null | undefined) => (x == null ? "~" : String(x));
  switch (a.type) {
    case "resolve":
      // The draw count only when chosen, so older recordings keep their text.
      return a.draw == null
        ? `resolve ${a.card} ${o(a.discard)}`
        : `resolve ${a.card} ${o(a.discard)} ${a.draw}`;
    case "use-bonus":
      return `use-bonus ${a.token} ${o(a.discard)}`;
    case "move":
      return `move ${a.to} ${a.spent}`;
    case "mist":
      return `mist ${a.to}`;
    case "push":
      return `push ${o(a.to)}`;
    case "digest":
      return `digest ${o(a.card)}`;
    case "keep-missions":
      return `keep-missions ${a.keep.join(",")}`;
    case "inspire":
      return `inspire ${a.crypt}`;
    case "hunt":
      return `hunt ${a.row} ${a.col}`;
    case "hunt-rose":
      return `hunt-rose ${a.card}`;
    case "ready":
      return `ready ${a.card} ${a.to}`;
    case "instant":
      return `instant ${a.mission} ${o(a.row)} ${o(a.col)} ${o(a.card)} ${o(a.space)}`;
    case "familiar":
      return `familiar ${a.card} ${o(a.target)}`;
    case "hypnosis":
      return `hypnosis ${a.card} ${a.pick} ${a.row} ${a.col}`;
    case "discard-permanent":
      return `discard-permanent ${a.card}`;
    default:
      return a.type;
  }
}
