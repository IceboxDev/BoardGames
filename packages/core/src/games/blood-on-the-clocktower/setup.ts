// Edition setup: character-count distribution and the secret bag draw.
//
// Mirrors the rulebook's SETUP steps 6–9: choose the right number of each
// character type for the player count, apply orange-flower adjustments (TB:
// the Baron's [+2 Outsiders] and the Drunk's believed-Townsfolk token; BMR:
// the Godfather's [−1 or +1 Outsider] and the Lunatic/Demon token swap), then
// deal one character per seat. All randomness goes through an injected `rng`
// so tests are deterministic.

import type { CharacterId, CharacterType, Edition } from "./characters.ts";
import { CHARACTERS, charactersOfType } from "./characters.ts";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

export type Distribution = {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
};

/** The setup-sheet table for 5–15 players. */
const DISTRIBUTIONS: Record<number, Distribution> = {
  5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

export function baseDistribution(playerCount: number): Distribution {
  const d = DISTRIBUTIONS[playerCount];
  if (!d) throw new Error(`the game needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  return d;
}

/** The distribution after the Baron's [+2 Outsiders] swap. */
export function baronAdjusted(d: Distribution): Distribution {
  return { ...d, townsfolk: d.townsfolk - 2, outsiders: d.outsiders + 2 };
}

export type SeatSetup = {
  seat: number;
  name: string;
  character: CharacterId;
  /** Drunk only: the not-in-play Townsfolk this player believes they are. */
  believedCharacter?: CharacterId;
  /** Traveller seats only: the Storyteller-assigned alignment. */
  alignment?: "good" | "evil";
};

export type GameSetup = {
  /** Defaults to Trouble Brewing when absent (pre-BMR saves). */
  edition?: Edition;
  seats: SeatSetup[];
  distribution: Distribution;
  /** Three not-in-play good characters to show the Demon as safe bluffs. */
  demonBluffs: CharacterId[];
  /** Seat of the good player who registers as a Demon to the Fortune Teller. */
  redHerringSeat?: number;
};

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function draw<T>(pool: T[], count: number, rng: () => number): T[] {
  return shuffled(pool, rng).slice(0, count);
}

/** Weighted sample without replacement. Zero-weight items are never picked. */
function weightedDraw<T>(
  pool: readonly T[],
  weightOf: (item: T) => number,
  count: number,
  rng: () => number,
): T[] {
  const items = pool.filter((t) => weightOf(t) > 0);
  const picked: T[] = [];
  while (picked.length < count && items.length > 0) {
    const total = items.reduce((sum, t) => sum + weightOf(t), 0);
    let roll = rng() * total;
    let idx = 0;
    for (; idx < items.length - 1; idx++) {
      roll -= weightOf(items[idx]);
      if (roll <= 0) break;
    }
    picked.push(items.splice(idx, 1)[0]);
  }
  return picked;
}

// ── Demon bluffs ──────────────────────────────────────────────────────

/** How practised the demon player is at sustaining a bluff. */
export type DemonSkill = "new" | "experienced";

/**
 * How playable each character is AS A DEMON BLUFF, per skill level.
 * Unlisted characters weigh 1.
 *
 * - Ongoing-info claims (Empath, Fortune Teller, Undertaker) are the
 *   strongest bluffs — fresh fabricated "info" every day, never pinnable —
 *   but demand confident daily lying, so they're down-weighted for new
 *   demon players.
 * - Passive/low-proof claims (Soldier, Monk, Ravenkeeper, Mayor, Saint,
 *   Butler) have nothing to invent — ideal for a first-time demon.
 * - The Slayer is a famously good bluff either way: publicly fake-shoot a
 *   good player and "nothing happens" looks perfectly normal.
 * - First-night-info claims (Chef, Washerwoman, Librarian, Investigator)
 *   force the demon to invent concrete day-1 info and defend it all game.
 * - The Virgin is NEVER offered: the claim is publicly testable on demand
 *   (nominate them, nothing happens, bluff dead).
 */
const BLUFF_WEIGHTS: Record<DemonSkill, Partial<Record<CharacterId, number>>> = {
  new: {
    soldier: 4,
    monk: 4,
    ravenkeeper: 3,
    mayor: 3,
    slayer: 3,
    butler: 3,
    saint: 3,
    recluse: 2,
    empath: 1,
    "fortune-teller": 1,
    undertaker: 1,
    chef: 1,
    washerwoman: 1,
    librarian: 1,
    investigator: 1,
    virgin: 0,
  },
  experienced: {
    empath: 4,
    "fortune-teller": 4,
    undertaker: 4,
    slayer: 4,
    soldier: 2,
    monk: 2,
    ravenkeeper: 2,
    mayor: 2,
    butler: 2,
    saint: 2,
    recluse: 2,
    chef: 1,
    washerwoman: 1,
    librarian: 1,
    investigator: 1,
    virgin: 0,
  },
};

/**
 * Bad Moon Rising bluff weights. No hard zero like TB's Virgin — but the
 * Sailor and Fool "can't die" claims are execution-testable, and nightly-info
 * claims (Chambermaid, Gambler, Gossip) demand confident daily fabrication,
 * so they invert between skill levels the same way the TB table does:
 * passive, nothing-to-invent claims (Fool, Minstrel, Pacifist, Grandmother)
 * for a new demon; ongoing-fabrication claims for an experienced one.
 */
const BMR_BLUFF_WEIGHTS: Record<DemonSkill, Partial<Record<CharacterId, number>>> = {
  new: {
    fool: 4,
    minstrel: 4,
    pacifist: 3,
    grandmother: 3,
    "tea-lady": 2,
    sailor: 2,
    courtier: 2,
    professor: 2,
    gossip: 1,
    gambler: 1,
    chambermaid: 1,
    exorcist: 1,
    innkeeper: 1,
    tinker: 3,
    moonchild: 2,
    goon: 2,
    lunatic: 1,
  },
  experienced: {
    chambermaid: 4,
    gambler: 4,
    gossip: 4,
    exorcist: 3,
    innkeeper: 3,
    courtier: 3,
    sailor: 2,
    grandmother: 2,
    professor: 2,
    "tea-lady": 2,
    minstrel: 2,
    pacifist: 2,
    fool: 1,
    tinker: 2,
    moonchild: 2,
    goon: 2,
    lunatic: 1,
  },
};

/**
 * Pick the three not-in-play good characters shown to the Demon as safe
 * bluffs. Aims for the rulebook's two-Townsfolk-plus-one-Outsider mix, then
 * layers Storyteller wisdom on top:
 *
 * - weighted by bluff quality for the demon's skill level (BLUFF_WEIGHTS);
 * - the Drunk's believed token is excluded (someone visibly holds it) and
 *   the Drunk itself is unclaimable;
 * - coherence with the actual game: in a zero-Outsider game an Outsider
 *   claim implies a Baron and invites scrutiny (down-weighted ×0.3) — and if
 *   the Librarian is also in play she will truthfully learn "zero", so
 *   Outsider bluffs are a trap and are skipped entirely.
 */
export function chooseDemonBluffs(
  opts: {
    charactersInPlay: CharacterId[];
    believedCharacter?: CharacterId;
    skill?: DemonSkill;
    edition?: Edition;
  },
  rng: () => number = Math.random,
): CharacterId[] {
  const { charactersInPlay, believedCharacter, skill = "new" } = opts;
  const edition = opts.edition ?? "trouble-brewing";
  const inPlay = new Set(charactersInPlay);
  const weights = (edition === "bad-moon-rising" ? BMR_BLUFF_WEIGHTS : BLUFF_WEIGHTS)[skill];
  const weightOf = (id: CharacterId, factor = 1) => (weights[id] ?? 1) * factor;

  const townsfolkPool = charactersOfType("townsfolk", edition)
    .map((c) => c.id)
    .filter((id) => !inPlay.has(id) && id !== believedCharacter);
  const outsiderPool = charactersOfType("outsider", edition)
    .map((c) => c.id)
    .filter((id) => !inPlay.has(id) && id !== "drunk");

  const outsidersInPlay = charactersInPlay.filter(
    (id) => CHARACTERS[id].type === "outsider",
  ).length;
  // TB: a zero-Outsider game makes Outsider claims imply a Baron (and the
  // Librarian would truthfully learn "zero" — a trap). BMR: the Godfather's
  // ±1 keeps the Outsider count ambiguous, so the penalty is milder.
  const outsiderFactor =
    outsidersInPlay > 0
      ? 1
      : edition === "bad-moon-rising"
        ? 0.5
        : inPlay.has("librarian")
          ? 0
          : 0.3;

  const bluffs = [
    ...weightedDraw(townsfolkPool, (id) => weightOf(id), 2, rng),
    ...weightedDraw(outsiderPool, (id) => weightOf(id, outsiderFactor), 1, rng),
  ];
  // Backfill from the remaining Townsfolk (weighted; zero-weight only as the
  // absolute last resort so we always return three).
  while (bluffs.length < 3) {
    const rest = townsfolkPool.filter((id) => !bluffs.includes(id));
    const pick = weightedDraw(rest, (id) => weightOf(id), 1, rng)[0] ?? rest[0];
    if (!pick) break;
    bluffs.push(pick);
  }
  return bluffs.slice(0, 3);
}

/**
 * The bag the Storyteller physically prepares. The phone never leaves the
 * ST's hands: the app names the tokens to drop in the bag, players draw them
 * at the table, and the draw is recorded afterwards via `setupFromDraws`.
 */
export type BagSetup = {
  edition: Edition;
  /** The actual characters in play — includes "drunk"/"lunatic" when dealt. */
  charactersInPlay: CharacterId[];
  /**
   * The physical tokens for the bag: identical to `charactersInPlay` except
   * the TB Drunk is replaced by their believed Townsfolk token. Whoever draws
   * that token IS the Drunk — they never learn it. In BMR the Lunatic and the
   * Demon token both go in as-is, and the DRAWS are swapped: whoever draws
   * the Demon token is secretly the Lunatic, and whoever draws the Lunatic
   * token is the real Demon (they learn so on the first night).
   */
  bagTokens: CharacterId[];
  /** TB: set when the Drunk is in play — the not-in-play Townsfolk token they drew. */
  believedCharacter?: CharacterId;
  /** BMR: set when the Lunatic is in play — the Demon they believe they are. */
  lunaticDemon?: CharacterId;
  /** BMR: the Godfather's setup swap that was applied. */
  godfatherAdjustment?: 1 | -1;
  distribution: Distribution;
  /** Three not-in-play good characters to show the Demon as safe bluffs. */
  demonBluffs: CharacterId[];
};

/**
 * Roll the bag composition for a player count (rulebook SETUP steps 6–8):
 * the right number of each type, the edition's orange-flower adjustments
 * (TB: Baron +2 Outsiders, Drunk stand-in token; BMR: Godfather ±1 Outsider,
 * Lunatic/Demon draw swap), and the Demon's three bluffs.
 */
export function dealBag(
  playerCount: number,
  rng: () => number = Math.random,
  demonSkill: DemonSkill = "new",
  edition: Edition = "trouble-brewing",
): BagSetup {
  const dist = baseDistribution(playerCount);
  const townsfolkPool = charactersOfType("townsfolk", edition).map((c) => c.id);
  const outsiderPool = charactersOfType("outsider", edition).map((c) => c.id);
  const minionPool = charactersOfType("minion", edition).map((c) => c.id);
  const demonPool = charactersOfType("demon", edition).map((c) => c.id);

  const minions = draw(minionPool, dist.minions, rng);
  let finalDist = minions.includes("baron") ? baronAdjusted(dist) : dist;
  // The Godfather's [−1 or +1 Outsider], clamped to what the pools allow.
  let godfatherAdjustment: 1 | -1 | undefined;
  if (minions.includes("godfather")) {
    const canAdd = finalDist.outsiders < outsiderPool.length && finalDist.townsfolk > 0;
    const canRemove = finalDist.outsiders > 0;
    godfatherAdjustment = canAdd && (!canRemove || rng() < 0.5) ? 1 : canRemove ? -1 : undefined;
    if (godfatherAdjustment) {
      finalDist = {
        ...finalDist,
        townsfolk: finalDist.townsfolk - godfatherAdjustment,
        outsiders: finalDist.outsiders + godfatherAdjustment,
      };
    }
  }

  const demon = draw(demonPool, 1, rng)[0];
  const outsiders = draw(outsiderPool, finalDist.outsiders, rng);
  const townsfolk = draw(townsfolkPool, finalDist.townsfolk, rng);
  const charactersInPlay = [...townsfolk, ...outsiders, ...minions, demon];

  const notInPlayTownsfolk = townsfolkPool.filter((id) => !townsfolk.includes(id));
  const believed = outsiders.includes("drunk") ? draw(notInPlayTownsfolk, 1, rng)[0] : undefined;
  const bagTokens = charactersInPlay.map((id) => (id === "drunk" && believed ? believed : id));
  const lunaticDemon = outsiders.includes("lunatic") ? demon : undefined;

  return {
    edition,
    charactersInPlay,
    bagTokens,
    ...(believed !== undefined ? { believedCharacter: believed } : {}),
    ...(lunaticDemon !== undefined ? { lunaticDemon } : {}),
    ...(godfatherAdjustment !== undefined ? { godfatherAdjustment } : {}),
    distribution: finalDist,
    demonBluffs: chooseDemonBluffs(
      { charactersInPlay, believedCharacter: believed, skill: demonSkill, edition },
      rng,
    ),
  };
}

// ── Editing a rolled bag ──────────────────────────────────────────────
// Storyteller adjustments after the roll: swap one character, change the
// Drunk's stand-in, or seat a late arrival — all without re-rolling the
// bag the ST has already physically prepared.

/** Rebuild the physical tokens from the in-play characters (Drunk → stand-in). */
function bagTokensFor(
  charactersInPlay: CharacterId[],
  believed: CharacterId | undefined,
): CharacterId[] {
  return charactersInPlay.map((id) => (id === "drunk" && believed ? believed : id));
}

/** Re-roll the demon bluffs only when a bag edit made a current bluff illegal. */
function freshenedBluffs(
  bag: Pick<BagSetup, "edition" | "demonBluffs">,
  charactersInPlay: CharacterId[],
  believed: CharacterId | undefined,
  skill: DemonSkill,
  rng: () => number,
): CharacterId[] {
  const inPlay = new Set(charactersInPlay);
  const stale = bag.demonBluffs.some((b) => inPlay.has(b) || b === believed);
  if (!stale) return bag.demonBluffs;
  return chooseDemonBluffs(
    { charactersInPlay, believedCharacter: believed, skill, edition: bag.edition },
    rng,
  );
}

/**
 * The characters `oldChar` (in play) may be swapped for without re-rolling:
 * same type, not already in play. Empty for the Baron and the Godfather —
 * their orange-flower adjustments change the bag's TYPE COUNTS on the way in
 * or out, so swapping them means rolling a fresh bag, not editing one token.
 * (They're excluded as swap TARGETS for the same reason.)
 */
export function bagCharacterReplacements(bag: BagSetup, oldChar: CharacterId): CharacterId[] {
  if (!bag.charactersInPlay.includes(oldChar)) return [];
  if (oldChar === "baron" || oldChar === "godfather") return [];
  const inPlay = new Set(bag.charactersInPlay);
  return charactersOfType(CHARACTERS[oldChar].type, bag.edition)
    .map((c) => c.id)
    .filter(
      (id) =>
        !inPlay.has(id) && id !== bag.believedCharacter && id !== "baron" && id !== "godfather",
    );
}

/**
 * Swap one in-play character for a same-type replacement, keeping the rest of
 * the bag. Handles the edge bookkeeping: the Drunk in (roll a stand-in) or
 * out (retire it), the Lunatic in (they believe they're the current Demon) or
 * out, a Demon swap (the Lunatic's believed Demon follows), and demon bluffs
 * re-rolled only if the swap made one illegal.
 */
export function replaceCharacterInBag(
  bag: BagSetup,
  oldChar: CharacterId,
  newChar: CharacterId,
  opts: { rng?: () => number; demonSkill?: DemonSkill } = {},
): BagSetup {
  const rng = opts.rng ?? Math.random;
  if (!bagCharacterReplacements(bag, oldChar).includes(newChar)) {
    throw new Error(`cannot swap ${oldChar} for ${newChar}`);
  }
  const charactersInPlay = bag.charactersInPlay.map((id) => (id === oldChar ? newChar : id));

  let believed = oldChar === "drunk" ? undefined : bag.believedCharacter;
  if (newChar === "drunk") {
    // Prefer a stand-in that doesn't stomp a current bluff, so the bluffs
    // survive the swap unchanged whenever possible.
    const inPlay = new Set(charactersInPlay);
    const open = charactersOfType("townsfolk", bag.edition)
      .map((c) => c.id)
      .filter((id) => !inPlay.has(id));
    const quiet = open.filter((id) => !bag.demonBluffs.includes(id));
    believed = draw(quiet.length > 0 ? quiet : open, 1, rng)[0];
    if (believed === undefined) throw new Error("no Townsfolk left for the Drunk's stand-in");
  }

  let lunaticDemon = oldChar === "lunatic" ? undefined : bag.lunaticDemon;
  if (newChar === "lunatic") {
    lunaticDemon = charactersInPlay.find((id) => CHARACTERS[id].type === "demon");
  }
  if (lunaticDemon !== undefined && CHARACTERS[oldChar].type === "demon") lunaticDemon = newChar;

  return {
    edition: bag.edition,
    charactersInPlay,
    bagTokens: bagTokensFor(charactersInPlay, believed),
    ...(believed !== undefined ? { believedCharacter: believed } : {}),
    ...(lunaticDemon !== undefined ? { lunaticDemon } : {}),
    ...(bag.godfatherAdjustment !== undefined
      ? { godfatherAdjustment: bag.godfatherAdjustment }
      : {}),
    distribution: bag.distribution,
    demonBluffs: freshenedBluffs(bag, charactersInPlay, believed, opts.demonSkill ?? "new", rng),
  };
}

/** Not-in-play Townsfolk the Drunk's stand-in token could become instead. */
export function drunkStandInOptions(bag: BagSetup): CharacterId[] {
  if (bag.believedCharacter === undefined) return [];
  const inPlay = new Set(bag.charactersInPlay);
  return charactersOfType("townsfolk", bag.edition)
    .map((c) => c.id)
    .filter((id) => !inPlay.has(id) && id !== bag.believedCharacter);
}

/** Change which Townsfolk token the Drunk draws; the Drunk stays in play. */
export function replaceDrunkStandIn(
  bag: BagSetup,
  newStandIn: CharacterId,
  opts: { rng?: () => number; demonSkill?: DemonSkill } = {},
): BagSetup {
  if (!drunkStandInOptions(bag).includes(newStandIn)) {
    throw new Error(`${newStandIn} cannot be the Drunk's stand-in`);
  }
  return {
    ...bag,
    believedCharacter: newStandIn,
    bagTokens: bagTokensFor(bag.charactersInPlay, newStandIn),
    demonBluffs: freshenedBluffs(
      bag,
      bag.charactersInPlay,
      newStandIn,
      opts.demonSkill ?? "new",
      opts.rng ?? Math.random,
    ),
  };
}

/**
 * Grow a rolled bag by one resident (a late arrival who insists on a real
 * token rather than joining as a Traveller). The setup sheet's distribution
 * is NOT monotonic (6→7 players trades the Outsider for two Townsfolk), so
 * this recomputes the target counts — keeping the Baron's +2 and the
 * Godfather's ±1 where they still fit — and adjusts with the fewest possible
 * swaps: surplus characters come out (preferring ones whose token nobody has
 * drawn yet, via `avoidRemoving`), missing ones are drawn in at random.
 * Auto-added characters never include the Baron, Godfather, Drunk, or
 * Lunatic — each rewrites the setup on arrival; the ST can still swap one in
 * deliberately afterwards. Returns the physical instructions alongside the
 * new bag: which tokens to add and which to fish back out.
 */
export function addResidentToBag(
  bag: BagSetup,
  opts: {
    rng?: () => number;
    demonSkill?: DemonSkill;
    /** Characters whose tokens are already in players' hands. */
    avoidRemoving?: CharacterId[];
  } = {},
): {
  bag: BagSetup;
  added: CharacterId[];
  removed: CharacterId[];
  droppedGodfatherAdjustment: boolean;
} {
  const rng = opts.rng ?? Math.random;
  const count = bag.bagTokens.length;
  if (count >= MAX_PLAYERS) throw new Error(`the game seats at most ${MAX_PLAYERS} players`);

  const outsiderPool = charactersOfType("outsider", bag.edition).map((c) => c.id);
  let target = baseDistribution(count + 1);
  if (bag.charactersInPlay.includes("baron")) target = baronAdjusted(target);
  let droppedGodfatherAdjustment = false;
  if (bag.godfatherAdjustment !== undefined) {
    const adjusted = {
      ...target,
      townsfolk: target.townsfolk - bag.godfatherAdjustment,
      outsiders: target.outsiders + bag.godfatherAdjustment,
    };
    if (
      adjusted.outsiders >= 0 &&
      adjusted.outsiders <= outsiderPool.length &&
      adjusted.townsfolk >= 1
    ) {
      target = adjusted;
    } else {
      droppedGodfatherAdjustment = true;
    }
  }

  const current: Distribution = { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 };
  for (const id of bag.charactersInPlay) {
    const t = CHARACTERS[id].type;
    if (t === "townsfolk") current.townsfolk++;
    else if (t === "outsider") current.outsiders++;
    else if (t === "minion") current.minions++;
    else current.demons++;
  }

  const avoid = new Set(opts.avoidRemoving ?? []);
  let inPlay = [...bag.charactersInPlay];
  const added: CharacterId[] = [];
  const removed: CharacterId[] = [];

  function removeSome(type: CharacterType, n: number) {
    const candidates = inPlay.filter((id) => CHARACTERS[id].type === type);
    const toRemove = [
      ...shuffled(
        candidates.filter((id) => !avoid.has(id)),
        rng,
      ),
      ...shuffled(
        candidates.filter((id) => avoid.has(id)),
        rng,
      ),
    ].slice(0, n);
    inPlay = inPlay.filter((id) => !toRemove.includes(id));
    removed.push(...toRemove);
  }

  // `soft` exclusions (Drunk, Lunatic) are avoided but allowed as a last
  // resort when the pool runs dry — the bookkeeping below completes them.
  // Baron/Godfather stay hard-excluded everywhere: their setup adjustments
  // can't be applied to an already-rolled bag.
  function addSome(type: CharacterType, n: number, soft: readonly CharacterId[]) {
    const inSet = new Set(inPlay);
    const open = charactersOfType(type, bag.edition)
      .map((c) => c.id)
      .filter(
        (id) =>
          !inSet.has(id) && id !== bag.believedCharacter && id !== "baron" && id !== "godfather",
      );
    // Prefer picks that don't stomp a current bluff, so bluffs stay stable.
    const tiers = [
      open.filter((id) => !soft.includes(id) && !bag.demonBluffs.includes(id)),
      open.filter((id) => !soft.includes(id) && bag.demonBluffs.includes(id)),
      open.filter((id) => soft.includes(id)),
    ];
    const picks: CharacterId[] = [];
    for (const tier of tiers) {
      if (picks.length >= n) break;
      picks.push(...draw(tier, n - picks.length, rng));
    }
    if (picks.length < n) throw new Error(`not enough ${type} characters to grow the bag`);
    inPlay.push(...picks);
    added.push(...picks);
  }

  const deltas: { type: CharacterType; delta: number; soft: readonly CharacterId[] }[] = [
    { type: "townsfolk", delta: target.townsfolk - current.townsfolk, soft: [] },
    { type: "outsider", delta: target.outsiders - current.outsiders, soft: ["drunk", "lunatic"] },
    { type: "minion", delta: target.minions - current.minions, soft: [] },
  ];
  for (const d of deltas) if (d.delta < 0) removeSome(d.type, -d.delta);
  for (const d of deltas) if (d.delta > 0) addSome(d.type, d.delta, d.soft);

  let believed = removed.includes("drunk") ? undefined : bag.believedCharacter;
  if (added.includes("drunk") && believed === undefined) {
    const inSet = new Set(inPlay);
    const open = charactersOfType("townsfolk", bag.edition)
      .map((c) => c.id)
      .filter((id) => !inSet.has(id));
    const quiet = open.filter((id) => !bag.demonBluffs.includes(id));
    believed = draw(quiet.length > 0 ? quiet : open, 1, rng)[0];
    if (believed === undefined) throw new Error("no Townsfolk left for the Drunk's stand-in");
  }
  let lunaticDemon = removed.includes("lunatic") ? undefined : bag.lunaticDemon;
  if (added.includes("lunatic")) {
    lunaticDemon = inPlay.find((id) => CHARACTERS[id].type === "demon");
  }
  const godfatherAdjustment = droppedGodfatherAdjustment ? undefined : bag.godfatherAdjustment;

  return {
    bag: {
      edition: bag.edition,
      charactersInPlay: inPlay,
      bagTokens: bagTokensFor(inPlay, believed),
      ...(believed !== undefined ? { believedCharacter: believed } : {}),
      ...(lunaticDemon !== undefined ? { lunaticDemon } : {}),
      ...(godfatherAdjustment !== undefined ? { godfatherAdjustment } : {}),
      distribution: target,
      demonBluffs: freshenedBluffs(bag, inPlay, believed, opts.demonSkill ?? "new", rng),
    },
    added,
    removed,
    droppedGodfatherAdjustment,
  };
}

/**
 * Build the seated setup from a recorded physical draw: `drawnTokens[i]` is
 * the token the player in seat `i` pulled from the bag. Whoever drew the
 * believed-Townsfolk token becomes the Drunk. The Fortune Teller's red
 * herring is rolled here, once the seats are known.
 */
/**
 * One recorded seat, in circle order: either a resident with the bag token
 * they drew, or a traveller seat (no draw — travellers never touch the bag;
 * their public character and secret alignment are the Storyteller's records).
 */
export type RecordedSeat =
  | { name: string; token: CharacterId; traveller?: undefined }
  | {
      name: string;
      token?: undefined;
      traveller: { character: CharacterId; alignment: "good" | "evil" };
    };

export function setupFromDraws(
  recorded: RecordedSeat[],
  bag: BagSetup,
  rng: () => number = Math.random,
): GameSetup {
  const residentCount = recorded.filter((r) => !r.traveller).length;
  if (residentCount !== bag.bagTokens.length) {
    throw new Error("every resident seat needs exactly one drawn token");
  }
  const travellerChars = recorded
    .filter((r) => r.traveller)
    .map((r) => r.traveller?.character as CharacterId);
  if (travellerChars.some((c) => CHARACTERS[c].type !== "traveller")) {
    throw new Error("traveller seats must hold traveller characters");
  }
  if (new Set(travellerChars).size !== travellerChars.length) {
    throw new Error("each traveller character can be in play only once");
  }

  const seats: SeatSetup[] = recorded.map((r, seat) => {
    if (r.traveller) {
      return {
        seat,
        name: r.name,
        character: r.traveller.character,
        alignment: r.traveller.alignment,
      };
    }
    const token = r.token;
    // TB: whoever drew the Drunk's believed-Townsfolk stand-in IS the Drunk.
    const isDrunk = bag.believedCharacter !== undefined && token === bag.believedCharacter;
    if (isDrunk) {
      return {
        seat,
        name: r.name,
        character: "drunk" as CharacterId,
        believedCharacter: bag.believedCharacter,
      };
    }
    // BMR: the Lunatic/Demon grimoire swap — whoever drew the Demon token is
    // secretly the Lunatic (believing they're that Demon), and whoever drew
    // the Lunatic token is the real Demon (they learn so on night one).
    if (bag.lunaticDemon !== undefined) {
      if (token === bag.lunaticDemon) {
        return {
          seat,
          name: r.name,
          character: "lunatic" as CharacterId,
          believedCharacter: bag.lunaticDemon,
        };
      }
      if (token === "lunatic") {
        return { seat, name: r.name, character: bag.lunaticDemon };
      }
    }
    return { seat, name: r.name, character: token };
  });

  const fortuneTellerInPlay = seats.some((s) => s.character === "fortune-teller");
  // The red herring is a good RESIDENT — travellers never carry it.
  const goodSeats = seats.filter((s) =>
    ["townsfolk", "outsider"].includes(CHARACTERS[s.character].type),
  );
  const redHerringSeat = fortuneTellerInPlay ? draw(goodSeats, 1, rng)[0]?.seat : undefined;

  return {
    edition: bag.edition ?? "trouble-brewing",
    seats,
    distribution: bag.distribution,
    demonBluffs: bag.demonBluffs,
    ...(redHerringSeat !== undefined ? { redHerringSeat } : {}),
  };
}

/**
 * Deal a full Trouble Brewing setup in one step (bag + simulated draw).
 * The companion's physical flow uses `dealBag` + `setupFromDraws` instead;
 * this remains for tests and any future fully-digital mode.
 */
export function dealSetup(
  names: string[],
  rng: () => number = Math.random,
  edition: Edition = "trouble-brewing",
): GameSetup {
  const bag = dealBag(names.length, rng, "new", edition);
  const tokens = shuffled(bag.bagTokens, rng);
  return setupFromDraws(
    names.map((name, i) => ({ name, token: tokens[i] })),
    bag,
    rng,
  );
}

/** Human-readable "3 Townsfolk · 1 Outsider · 1 Minion · 1 Demon". */
export function describeDistribution(d: Distribution): string {
  const part = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`;
  return [
    part(d.townsfolk, "Townsfolk", "Townsfolk"),
    part(d.outsiders, "Outsider", "Outsiders"),
    part(d.minions, "Minion", "Minions"),
    part(d.demons, "Demon", "Demons"),
  ].join(" · ");
}

export function characterName(id: CharacterId): string {
  return CHARACTERS[id].name;
}
