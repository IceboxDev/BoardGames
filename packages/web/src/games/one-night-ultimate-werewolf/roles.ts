// ── One Night Werewolf — role catalog, scenarios, winner computation ──
//
// Reflects the Ravensburger "Werewolves — Full Moon" rules variant. The card
// pool always equals `players + 3` (3 cards sit at the center). The form
// records each player's effective role at end-of-game (after any swaps) plus
// who got voted out; the winning team(s) fall out of those facts.

export type WerewolfTeam = "village" | "werewolf" | "tanner";

export type WerewolfRole = {
  /** Stable identifier, also used as the role label on the wire. */
  id: string;
  /** Display name. */
  label: string;
  /** Team membership for the effective end-state. */
  team: WerewolfTeam;
  /** Max copies that can be in a single game's card pool. */
  max: number;
};

// Order matters: roles are presented in this sequence in the pool editor and
// the per-player dropdown.
export const WEREWOLF_ROLES: readonly WerewolfRole[] = [
  { id: "villager", label: "Villager", team: "village", max: 3 },
  { id: "werewolf", label: "Werewolf", team: "werewolf", max: 2 },
  { id: "seer", label: "Seer", team: "village", max: 1 },
  { id: "robber", label: "Robber", team: "village", max: 1 },
  { id: "troublemaker", label: "Troublemaker", team: "village", max: 1 },
  { id: "tanner", label: "Tanner", team: "tanner", max: 1 },
  { id: "drunk", label: "Drunk", team: "village", max: 1 },
  { id: "hunter", label: "Hunter", team: "village", max: 1 },
  { id: "mason", label: "Mason", team: "village", max: 2 },
  { id: "insomniac", label: "Insomniac", team: "village", max: 1 },
  { id: "minion", label: "Minion", team: "werewolf", max: 1 },
  { id: "shapeshifter", label: "Shapeshifter", team: "village", max: 1 },
];

const ROLE_BY_ID = new Map(WEREWOLF_ROLES.map((r) => [r.id, r] as const));

export function findWerewolfRole(id: string | undefined): WerewolfRole | undefined {
  return id ? ROLE_BY_ID.get(id) : undefined;
}

export function teamOfRole(id: string | undefined): WerewolfTeam | null {
  const r = findWerewolfRole(id);
  return r ? r.team : null;
}

// ── Scenarios ─────────────────────────────────────────────────────────
// Each scenario describes the card pool for a given player count. Pool size
// is always `playerCount + 3` (three center cards). "Custom" is handled
// separately by the form — the user edits per-role counts directly.

export type ScenarioId =
  | "first-night"
  | "moonstruck"
  | "lonely-night"
  | "confusion"
  | "payback"
  | "secret-companions"
  | "hours-of-despair"
  | "twilight-alliance"
  | "revenant"
  | "anarchy"
  | "custom";

export type Scenario = {
  id: ScenarioId;
  label: string;
  difficulty: "easy" | "medium" | "hard" | "intro";
  /** Player counts this scenario supports. */
  players: readonly number[];
  /** Returns the role-id → count map for the given player count. */
  pool: (players: number) => Record<string, number>;
};

function add(target: Record<string, number>, role: string, n = 1): void {
  target[role] = (target[role] ?? 0) + n;
}

function emptyPool(): Record<string, number> {
  return {};
}

const FIRST_NIGHT: Scenario = {
  id: "first-night",
  label: "The First Night",
  difficulty: "intro",
  players: [3, 4, 5],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "seer");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "villager");
    if (n >= 4) add(p, "villager");
    if (n >= 5) add(p, "villager");
    return p;
  },
};

const MOONSTRUCK: Scenario = {
  id: "moonstruck",
  label: "Moonstruck",
  difficulty: "easy",
  players: [3, 4, 5, 6],
  pool: (n) => {
    // Each tier line in the rules is a delta from the 3-player baseline, not
    // cumulative from the previous tier. Treat them as mutually exclusive.
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "insomniac");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "villager");
    if (n === 4) add(p, "villager");
    else if (n === 5) {
      add(p, "villager");
      add(p, "seer");
    } else if (n === 6) {
      add(p, "villager", 2);
      add(p, "seer");
    }
    return p;
  },
};

const LONELY_NIGHT: Scenario = {
  id: "lonely-night",
  label: "Lonely Night",
  difficulty: "easy",
  players: [3, 4],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf");
    add(p, "seer");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "villager", 2);
    if (n >= 4) add(p, "villager");
    return p;
  },
};

const CONFUSION: Scenario = {
  id: "confusion",
  label: "Confusion",
  difficulty: "medium",
  players: [3, 4, 5, 6, 7, 8, 9],
  pool: (n) => {
    // Each tier line in the rules is a delta from the 3-player baseline, not
    // cumulative from the previous tier. Treat them as mutually exclusive.
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "drunk");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "insomniac");
    if (n === 4) add(p, "villager");
    else if (n === 5) {
      add(p, "villager");
      add(p, "seer");
    } else if (n === 6) {
      add(p, "villager", 2);
      add(p, "seer");
    } else if (n === 7) {
      add(p, "villager", 3);
      add(p, "seer");
    } else if (n === 8) {
      add(p, "villager", 3);
      add(p, "seer");
      add(p, "minion");
    } else if (n === 9) {
      add(p, "villager", 2);
      add(p, "seer");
      add(p, "minion");
      add(p, "mason", 2);
    }
    return p;
  },
};

const PAYBACK: Scenario = {
  id: "payback",
  label: "Payback",
  difficulty: "medium",
  players: [4, 5, 6, 7],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "hunter");
    add(p, "seer");
    add(p, "robber");
    add(p, "drunk");
    add(p, "insomniac");
    if (n >= 5) add(p, "troublemaker");
    if (n >= 6) add(p, "villager");
    if (n >= 7) add(p, "villager");
    return p;
  },
};

const SECRET_COMPANIONS: Scenario = {
  id: "secret-companions",
  label: "Secret Companions",
  difficulty: "medium",
  players: [6, 7],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "minion");
    add(p, "hunter");
    add(p, "seer");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "mason", 2);
    if (n >= 7) add(p, "villager");
    return p;
  },
};

const HOURS_OF_DESPAIR: Scenario = {
  id: "hours-of-despair",
  label: "Hours of Despair",
  difficulty: "medium",
  players: [4, 5, 6, 7, 8, 9, 10],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "tanner");
    add(p, "seer");
    add(p, "robber");
    add(p, "drunk");
    add(p, "insomniac");
    if (n >= 5) add(p, "troublemaker");
    if (n === 6) add(p, "villager");
    if (n >= 7) add(p, "mason", 2);
    if (n >= 8) add(p, "hunter");
    if (n >= 9) add(p, "minion");
    if (n >= 10) add(p, "villager");
    return p;
  },
};

const TWILIGHT_ALLIANCE: Scenario = {
  id: "twilight-alliance",
  label: "Twilight Alliance",
  difficulty: "hard",
  players: [5, 6, 7, 8, 9, 10],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "mason", 2);
    add(p, "minion");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "insomniac");
    if (n >= 6) add(p, "drunk");
    if (n >= 7) add(p, "seer");
    if (n >= 8) add(p, "villager");
    if (n >= 9) add(p, "villager");
    if (n >= 10) add(p, "tanner");
    return p;
  },
};

const REVENANT: Scenario = {
  id: "revenant",
  label: "Revenant",
  difficulty: "hard",
  players: [8, 9, 10],
  pool: (n) => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "shapeshifter");
    add(p, "minion");
    add(p, "hunter");
    add(p, "seer");
    add(p, "robber");
    add(p, "troublemaker");
    add(p, "villager");
    add(p, "mason", 2);
    if (n >= 9) add(p, "insomniac");
    if (n >= 10) add(p, "drunk");
    return p;
  },
};

const ANARCHY: Scenario = {
  id: "anarchy",
  label: "Anarchy",
  difficulty: "hard",
  // "Pick 2 werewolves + 1 villager, then draw the rest at random." We can't
  // know the actual pool — let the form treat it as Custom-with-seed.
  players: [3, 4, 5, 6, 7, 8, 9, 10],
  pool: () => {
    const p = emptyPool();
    add(p, "werewolf", 2);
    add(p, "villager");
    return p;
  },
};

export const SCENARIOS: readonly Scenario[] = [
  FIRST_NIGHT,
  MOONSTRUCK,
  LONELY_NIGHT,
  CONFUSION,
  PAYBACK,
  SECRET_COMPANIONS,
  HOURS_OF_DESPAIR,
  TWILIGHT_ALLIANCE,
  REVENANT,
  ANARCHY,
];

export function findScenario(id: ScenarioId): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function poolSize(pool: Record<string, number>): number {
  return Object.values(pool).reduce((a, b) => a + b, 0);
}

// ── Winner computation ────────────────────────────────────────────────
//
// Inputs: each player's effective end-state role + whether they got voted
// out. Outputs: the set of winning teams.
//
// Rules:
//   • Tanner wins iff Tanner was voted out. If a Werewolf also died, the
//     Village shares the win.
//   • If any Werewolf is in play and survives, the Werewolf pack wins.
//   • If any Werewolf is in play and at least one Werewolf dies, the Village
//     wins (the Tanner case may overlap above).
//   • No Werewolf in play, but a Minion in play: Minion (Werewolf side) wins
//     if the Minion survives and at least one other player dies. Otherwise
//     the Village wins (including the no-kill tie case).
//   • No Werewolves and no Minion in play: Village wins iff no one died
//     (the "vote-left-neighbor-tie" outcome). Otherwise nobody wins —
//     surfaced as an empty winners set so the form can flag it.

export type WerewolfPlayer = { roleId?: string; eliminated: boolean };

export function computeWerewolfWinners(players: readonly WerewolfPlayer[]): WerewolfTeam[] {
  const winners = new Set<WerewolfTeam>();
  const wolves = players.filter(
    (p) => teamOfRole(p.roleId) === "werewolf" && p.roleId !== "minion",
  );
  const minions = players.filter((p) => p.roleId === "minion");
  const tanners = players.filter((p) => p.roleId === "tanner");

  const wolfDied = wolves.some((w) => w.eliminated);
  const tannerDied = tanners.some((t) => t.eliminated);

  if (tannerDied) {
    winners.add("tanner");
    if (wolfDied) winners.add("village");
    return [...winners];
  }

  if (wolves.length > 0) {
    if (wolfDied) winners.add("village");
    else winners.add("werewolf");
    return [...winners];
  }

  // No wolves in play.
  if (minions.length > 0) {
    const minionSurvived = minions.every((m) => !m.eliminated);
    const someoneOtherDied = players.some((p) => p.roleId !== "minion" && p.eliminated);
    if (minionSurvived && someoneOtherDied) winners.add("werewolf");
    else winners.add("village");
    return [...winners];
  }

  // No wolves, no minions — village only wins on a no-kill tie.
  const anyDied = players.some((p) => p.eliminated);
  if (!anyDied) winners.add("village");
  return [...winners];
}
