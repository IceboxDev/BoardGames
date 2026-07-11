/**
 * Hand deduction for the BGA spectator. The bridging player ("me") is dealt
 * their own hand every turn (BGA `newHand`), and every card each player removes
 * to their tableau is public (`cardsPlayed`). Because hands rotate a fixed
 * direction each turn, a hand I once held can be tracked forward as it moves
 * and shrinks — so within a few turns I know most opponents' hands exactly, and
 * the last un-held hand can be filled by elimination against the age's deck.
 *
 * The model is validated against real BGA games: propagating a held hand
 * forward reproduces exactly what each subsequent holder plays.
 *
 * BGA deals the next age's hand BEFORE the current age's last reveal finishes,
 * so events are routed to a per-age track by their cards' age, never by arrival
 * order.
 *
 * Limits (inherent to what's observable): a card buried under a Wonder stage is
 * face-down (unknown id), so it becomes a counted-but-unidentified card; and
 * Age III guilds are a random subset, so an eliminated Age III hand's guild
 * cards are uncertain. Both are surfaced, not hidden.
 */

export interface CardTypeInfo {
  name: string;
  age: number;
  category: string;
  /** BGA `qt`: copies dealt per player count, e.g. { "3": 1, "4": 2, … }. */
  qt: Record<string, number>;
}

interface AgeTrack {
  handStartSize: number;
  /** turn (1-based) -> my card ids that turn. */
  myHandByTurn: Map<number, number[]>;
  /** reveal turn (1-based) -> playerId -> the card id they played to tableau. */
  tableauPlays: Map<number, Map<string, number>>;
  revealCount: number;
  /** Card ids removed from circulation this age (played or discarded). */
  removedIds: Set<number>;
  /** Deck composition: card name -> count dealt this age. */
  dealtByName: Map<string, number>;
}

function newAgeTrack(): AgeTrack {
  return {
    handStartSize: 7,
    myHandByTurn: new Map(),
    tableauPlays: new Map(),
    revealCount: 0,
    removedIds: new Set(),
    dealtByName: new Map(),
  };
}

export interface HandTrackState {
  myPlayerId: string | null;
  seatOrder: string[];
  /** Current display age (for choosing which track to project). */
  age: number;
  /** card id -> BGA material type. */
  typeById: Map<number, string>;
  /** BGA material type -> its static definition (from gamedatas card_types). */
  cardTypes: Map<string, CardTypeInfo>;
  /** BGA material type -> display name. */
  nameByType: Map<string, string>;
  /** BGA material type -> age. */
  ageByType: Map<string, number>;
  /** Names known to be guilds (elimination can't pin these down in Age III). */
  guildNames: Set<string>;
  /** Per-age tracking, routed by card age. */
  ages: Map<number, AgeTrack>;
}

export function initHandTrack(): HandTrackState {
  return {
    myPlayerId: null,
    seatOrder: [],
    age: 1,
    typeById: new Map(),
    cardTypes: new Map(),
    nameByType: new Map(),
    ageByType: new Map(),
    guildNames: new Set(),
    ages: new Map(),
  };
}

/** Load the static card dictionary (from gamedatas). Derives names/ages/guilds. */
export function setCardTypes(s: HandTrackState, cardTypes: Map<string, CardTypeInfo>): void {
  s.cardTypes = cardTypes;
  s.nameByType = new Map();
  s.ageByType = new Map();
  s.guildNames = new Set();
  for (const [type, info] of cardTypes) {
    s.nameByType.set(type, info.name);
    s.ageByType.set(type, info.age);
    if (info.category === "gui") s.guildNames.add(info.name);
  }
}

function nameOfId(s: HandTrackState, id: number): string {
  const type = s.typeById.get(id);
  return (type !== undefined ? s.nameByType.get(type) : undefined) ?? `#${id}`;
}

function ageOfId(s: HandTrackState, id: number): number | null {
  const type = s.typeById.get(id);
  return type !== undefined ? (s.ageByType.get(type) ?? null) : null;
}

/** The age most of these ids belong to (BGA sometimes carries stragglers). */
function ageOfIds(s: HandTrackState, ids: number[]): number | null {
  const counts = new Map<number, number>();
  for (const id of ids) {
    const a = ageOfId(s, id);
    if (a !== null) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [a, n] of counts) {
    if (n > bestN) {
      best = a;
      bestN = n;
    }
  }
  return best;
}

function ageTrack(s: HandTrackState, age: number): AgeTrack {
  let t = s.ages.get(age);
  if (!t) {
    t = newAgeTrack();
    // Deck composition for this age from the card dictionary's per-count `qt`.
    const pc = s.seatOrder.length;
    for (const info of s.cardTypes.values()) {
      if (info.age !== age) continue;
      const copies = info.qt[String(pc)] ?? 0;
      if (copies > 0) t.dealtByName.set(info.name, (t.dealtByName.get(info.name) ?? 0) + copies);
    }
    s.ages.set(age, t);
  }
  return t;
}

/** Record my hand: index it by the turn implied by its size, in its own age. */
export function recordMyHand(s: HandTrackState, ids: number[]): void {
  if (ids.length === 0) return;
  const age = ageOfIds(s, ids) ?? s.age;
  const t = ageTrack(s, age);
  if (t.myHandByTurn.size === 0) t.handStartSize = Math.max(t.handStartSize, ids.length);
  const turn = t.handStartSize + 1 - ids.length;
  if (turn >= 1 && !t.myHandByTurn.has(turn)) t.myHandByTurn.set(turn, ids);
}

/**
 * Record one reveal (all players' tableau plays for a turn). Bucketed under a
 * per-age reveal counter that mirrors the turn number — independent of when my
 * own hand for that turn was recorded (BGA delivers them out of order).
 */
export function recordReveal(
  s: HandTrackState,
  plays: Array<{ playerId: string; id: number }>,
): void {
  const age = ageOfIds(
    s,
    plays.map((p) => p.id),
  );
  if (age === null) return;
  const t = ageTrack(s, age);
  t.revealCount += 1;
  const bucket = new Map<string, number>();
  for (const { playerId, id } of plays) {
    bucket.set(playerId, id);
    t.removedIds.add(id);
  }
  t.tableauPlays.set(t.revealCount, bucket);
}

export function recordDiscard(s: HandTrackState, id: number): void {
  const age = ageOfId(s, id);
  if (age !== null) ageTrack(s, age).removedIds.add(id);
}

function currentTurn(t: AgeTrack): number {
  let max = 0;
  for (const turn of t.myHandByTurn.keys()) if (turn > max) max = turn;
  return max;
}

function passesLeft(age: number): boolean {
  return age !== 2; // Ages I & III pass left (to playerorder[i+1]); II passes right.
}

function distanceToSeat(s: HandTrackState, age: number, index: number): number {
  const n = s.seatOrder.length;
  const myIndex = s.seatOrder.indexOf(s.myPlayerId ?? "");
  if (myIndex < 0 || n === 0) return -1;
  return passesLeft(age) ? (index - myIndex + n) % n : (myIndex - index + n) % n;
}

export interface TrackedHand {
  /** Candidate/known card names. */
  cards: string[];
  /** Actual number of cards in the hand right now. */
  size: number;
  /** Filled by deck elimination rather than direct observation. */
  deduced: boolean;
  /** Residual uncertainty (e.g. Age III guilds under elimination). */
  uncertain: boolean;
}

/** Compute the current hand for the seat at `index`, in the current age. */
export function computeHand(s: HandTrackState, index: number): TrackedHand | null {
  const age = s.age;
  const t = s.ages.get(age);
  if (!t || s.myPlayerId === null) return null;
  const turn = currentTurn(t);
  if (turn === 0) return null;
  const n = s.seatOrder.length;
  const size = t.handStartSize - (turn - 1);
  if (size <= 0) return { cards: [], size: 0, deduced: false, uncertain: false };

  const d = distanceToSeat(s, age, index);
  const sourceTurn = turn - d;

  if (sourceTurn >= 1) {
    const set = new Set(t.myHandByTurn.get(sourceTurn) ?? []);
    const myIndex = s.seatOrder.indexOf(s.myPlayerId);
    for (let k = 0; k < d; k++) {
      const holder = passesLeft(age)
        ? s.seatOrder[(myIndex + k) % n]
        : s.seatOrder[(myIndex - k + n) % n];
      const played = t.tableauPlays.get(sourceTurn + k)?.get(holder);
      if (played !== undefined) set.delete(played);
    }
    for (const id of [...set]) if (t.removedIds.has(id)) set.delete(id);
    const cards = [...set].map((id) => nameOfId(s, id));
    // cards.length > size ⇒ some candidates were buried under Wonders (unknown
    // which). cards.length == size ⇒ exact hand.
    return { cards, size, deduced: false, uncertain: false };
  }

  // Elimination: only when this is the single hand I have never held.
  const unheld = s.seatOrder.filter((_, i) => turn - distanceToSeat(s, age, i) < 1);
  if (unheld.length !== 1 || s.seatOrder[index] !== unheld[0]) return null;
  return eliminateHand(s, t, size);
}

function eliminateHand(s: HandTrackState, t: AgeTrack, size: number): TrackedHand {
  const remaining = new Map(t.dealtByName);
  const dec = (name: string) => {
    const c = remaining.get(name);
    if (c !== undefined) remaining.set(name, c - 1);
  };
  for (const id of t.removedIds) dec(nameOfId(s, id));
  const turn = currentTurn(t);
  const n = s.seatOrder.length;
  for (let i = 0; i < n; i++) {
    if (turn - distanceToSeat(s, s.age, i) < 1) continue; // the un-held hand itself
    const h = computeHand(s, i);
    if (h) for (const name of h.cards) dec(name);
  }
  const cards: string[] = [];
  let uncertain = false;
  for (const [name, count] of remaining) {
    for (let c = 0; c < count; c++) cards.push(name);
    if (count > 0 && s.guildNames.has(name)) uncertain = true;
  }
  return { cards, size, deduced: true, uncertain };
}
