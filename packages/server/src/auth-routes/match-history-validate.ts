import {
  DECRYPTO_RECORD_MAX_ROUNDS,
  describeDecryptoRecordError,
} from "@boardgames/core/history/decrypto-tokens";
import {
  describeRoundScoresError,
  MAX_ROUND_SCORES,
  MIN_ROUND_SCORES,
} from "@boardgames/core/history/round-scores";
import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  Participant,
} from "@boardgames/core/history/types";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

function asOptionalString(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function asInteger(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v;
}

function parseParticipant(v: unknown, ctx: string): ParseResult<Participant> {
  if (!isPlainObject(v)) return { ok: false, error: `${ctx}: not an object` };
  const userId = asTrimmedString(v.userId, 100);
  if (!userId) return { ok: false, error: `${ctx}: missing userId` };
  const displayName = asTrimmedString(v.displayName, 200);
  if (!displayName) return { ok: false, error: `${ctx}: missing displayName` };
  return { ok: true, value: { userId, displayName } };
}

function parseFreeForAll(v: Record<string, unknown>): ParseResult<MatchOutcomeFreeForAll> {
  if (!Array.isArray(v.players) || v.players.length < 2) {
    return { ok: false, error: "free-for-all needs >=2 players" };
  }
  if (v.players.length > 20) {
    return { ok: false, error: "free-for-all: too many players (max 20)" };
  }
  const players: MatchOutcomeFreeForAll["players"] = [];
  for (let i = 0; i < v.players.length; i++) {
    const raw = v.players[i];
    const p = parseParticipant(raw, `players[${i}]`);
    if (!p.ok) return p;
    if (!isPlainObject(raw)) return { ok: false, error: `players[${i}]: not an object` };
    const score = asFiniteNumber(raw.score);
    if (score === null) return { ok: false, error: `players[${i}]: invalid score` };
    const rank = raw.rank === undefined ? undefined : asInteger(raw.rank);
    if (rank === null) return { ok: false, error: `players[${i}]: invalid rank` };
    // Optional per-player role label (Villainous villain, etc.) — mirrors the
    // team-member `role` handling so it survives the write round-trip.
    const role = raw.role !== undefined ? asOptionalString(raw.role, 64) : undefined;
    // Optional best-of-three round record (Jaipur). Cross-field consistency
    // (same rounds everywhere, totals, crowned winner) is checked below via
    // the shared core validator.
    let roundScores: number[] | undefined;
    if (raw.roundScores !== undefined && raw.roundScores !== null) {
      if (
        !Array.isArray(raw.roundScores) ||
        raw.roundScores.length < MIN_ROUND_SCORES ||
        raw.roundScores.length > MAX_ROUND_SCORES
      ) {
        return {
          ok: false,
          error: `players[${i}]: roundScores must hold ${MIN_ROUND_SCORES}–${MAX_ROUND_SCORES} rounds`,
        };
      }
      const parsedRounds: number[] = [];
      for (const s of raw.roundScores) {
        const n = asFiniteNumber(s);
        if (n === null) return { ok: false, error: `players[${i}]: invalid round score` };
        parsedRounds.push(n);
      }
      roundScores = parsedRounds;
    }
    players.push({
      ...p.value,
      score,
      ...(rank !== undefined ? { rank } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(roundScores !== undefined ? { roundScores } : {}),
    });
  }
  // No explicit winnerUserIds — the player(s) with the highest score are
  // implicit co-winners. Point-less variants (Villainous) instead mark the sole
  // winner with `rank: 1` and keep every score at 0.
  const scenario = asOptionalString(v.scenario, 64);
  // Drawn duel (chess / Connect 4): `draw: true` means no winner, so a crowned
  // rank alongside it would be a contradiction — mirrors the schema refinement.
  if (v.draw !== undefined && v.draw !== true) {
    return { ok: false, error: "free-for-all: draw must be true when present" };
  }
  if (v.draw === true && players.some((p) => p.rank !== undefined)) {
    return { ok: false, error: "free-for-all: a drawn match cannot have a ranked winner" };
  }
  // Jaipur's tied-round tiebreaks: rebuilt token-by-token; the semantics
  // (only on tied rounds, must settle the seal) are cross-checked below by
  // the shared core validator.
  let roundTiebreaks: MatchOutcomeFreeForAll["roundTiebreaks"];
  if (v.roundTiebreaks !== undefined && v.roundTiebreaks !== null) {
    if (!Array.isArray(v.roundTiebreaks) || v.roundTiebreaks.length > MAX_ROUND_SCORES) {
      return { ok: false, error: `roundTiebreaks: at most ${MAX_ROUND_SCORES} entries` };
    }
    const tokenCounts = (value: unknown): number[] | null => {
      if (!Array.isArray(value) || value.length < 2 || value.length > 20) return null;
      const counts: number[] = [];
      for (const t of value) {
        const n = asInteger(t);
        if (n === null || n < 0 || n > 100) return null;
        counts.push(n);
      }
      return counts;
    };
    const parsed: NonNullable<MatchOutcomeFreeForAll["roundTiebreaks"]> = [];
    for (let i = 0; i < v.roundTiebreaks.length; i++) {
      const tb = v.roundTiebreaks[i];
      if (!isPlainObject(tb)) return { ok: false, error: `roundTiebreaks[${i}]: not an object` };
      const round = asInteger(tb.round);
      if (round === null || round < 0 || round >= MAX_ROUND_SCORES) {
        return { ok: false, error: `roundTiebreaks[${i}]: invalid round` };
      }
      const bonusTokens = tokenCounts(tb.bonusTokens);
      if (!bonusTokens) return { ok: false, error: `roundTiebreaks[${i}]: invalid bonusTokens` };
      let goodsTokens: number[] | undefined;
      if (tb.goodsTokens !== undefined && tb.goodsTokens !== null) {
        const g = tokenCounts(tb.goodsTokens);
        if (!g) return { ok: false, error: `roundTiebreaks[${i}]: invalid goodsTokens` };
        goodsTokens = g;
      }
      parsed.push({ round, bonusTokens, ...(goodsTokens !== undefined ? { goodsTokens } : {}) });
    }
    roundTiebreaks = parsed;
  }
  const value: MatchOutcomeFreeForAll = {
    kind: "free-for-all",
    players,
    ...(scenario !== undefined ? { scenario } : {}),
    ...(v.draw === true ? { draw: true as const } : {}),
    ...(roundTiebreaks !== undefined ? { roundTiebreaks } : {}),
  };
  // Best-of-three round record (Jaipur): every tied round must be settled by
  // its tiebreak and the crowned winner must fall out of the round wins —
  // same shared-validator pattern as Decrypto's tokens.
  const roundError = describeRoundScoresError(value);
  if (roundError) return { ok: false, error: `free-for-all: ${roundError}` };
  return { ok: true, value };
}

function parseTeams(v: Record<string, unknown>): ParseResult<MatchOutcomeTeams> {
  if (!Array.isArray(v.teams) || v.teams.length < 2) {
    return { ok: false, error: "teams: need >=2 teams" };
  }
  if (v.teams.length > 8) return { ok: false, error: "teams: too many teams (max 8)" };
  const teams: MatchOutcomeTeams["teams"] = [];
  for (let i = 0; i < v.teams.length; i++) {
    const t = v.teams[i];
    if (!isPlainObject(t)) return { ok: false, error: `teams[${i}]: not an object` };
    if (!Array.isArray(t.members) || t.members.length === 0) {
      return { ok: false, error: `teams[${i}]: empty members` };
    }
    const members: MatchOutcomeTeams["teams"][number]["members"] = [];
    for (let j = 0; j < t.members.length; j++) {
      const raw = t.members[j];
      const p = parseParticipant(raw, `teams[${i}].members[${j}]`);
      if (!p.ok) return p;
      const role =
        isPlainObject(raw) && raw.role !== undefined ? asOptionalString(raw.role, 64) : undefined;
      const eliminated =
        isPlainObject(raw) && typeof raw.eliminated === "boolean" ? raw.eliminated : undefined;
      members.push({
        ...p.value,
        ...(role !== undefined ? { role } : {}),
        ...(eliminated !== undefined ? { eliminated } : {}),
      });
    }
    let score: number | undefined;
    if (t.score !== undefined && t.score !== null) {
      const n = asFiniteNumber(t.score);
      if (n === null) return { ok: false, error: `teams[${i}]: invalid score` };
      score = n;
    }
    const rank = t.rank === undefined ? undefined : asInteger(t.rank);
    if (rank === null) return { ok: false, error: `teams[${i}]: invalid rank` };
    teams.push({
      members,
      ...(score !== undefined ? { score } : {}),
      ...(rank !== undefined ? { rank } : {}),
    });
  }
  if (!Array.isArray(v.winnerTeamIndices) || v.winnerTeamIndices.length === 0) {
    return { ok: false, error: "teams: winnerTeamIndices must be non-empty" };
  }
  const winnerTeamIndices: number[] = [];
  for (const idx of v.winnerTeamIndices) {
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= teams.length) {
      return { ok: false, error: `winnerTeamIndices: ${idx} out of range` };
    }
    winnerTeamIndices.push(idx);
  }
  // Optional moderator (Blood on the Clocktower's Storyteller, etc.) — sits
  // outside the teams, doesn't win or lose, may carry a role label (Fabled).
  let moderator: MatchOutcomeTeams["moderator"];
  if (v.moderator !== undefined && v.moderator !== null) {
    const m = parseParticipant(v.moderator, "moderator");
    if (!m.ok) return m;
    const role =
      isPlainObject(v.moderator) && v.moderator.role !== undefined
        ? asOptionalString(v.moderator.role, 64)
        : undefined;
    moderator = { ...m.value, ...(role !== undefined ? { role } : {}) };
  }
  const scenario = asOptionalString(v.scenario, 64);

  // Decrypto's round-by-round token record. Rebuilt boolean-by-boolean like
  // everything else in this allowlist, then cross-checked against the winner:
  // for Decrypto the winner is DERIVED from the tokens, never free-entered.
  let decryptoRounds: MatchOutcomeTeams["decryptoRounds"];
  if (v.decryptoRounds !== undefined && v.decryptoRounds !== null) {
    if (!Array.isArray(v.decryptoRounds) || v.decryptoRounds.length === 0) {
      return { ok: false, error: "decryptoRounds: must be a non-empty array" };
    }
    if (v.decryptoRounds.length > DECRYPTO_RECORD_MAX_ROUNDS) {
      return { ok: false, error: `decryptoRounds: max ${DECRYPTO_RECORD_MAX_ROUNDS} rounds` };
    }
    const parsed: NonNullable<MatchOutcomeTeams["decryptoRounds"]> = [];
    for (let i = 0; i < v.decryptoRounds.length; i++) {
      const round = v.decryptoRounds[i];
      if (!isPlainObject(round)) return { ok: false, error: `decryptoRounds[${i}]: not an object` };
      const pair = (value: unknown): [boolean, boolean] | null =>
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "boolean" &&
        typeof value[1] === "boolean"
          ? [value[0], value[1]]
          : null;
      const interception = pair(round.interception);
      const miscommunication = pair(round.miscommunication);
      if (!interception || !miscommunication) {
        return { ok: false, error: `decryptoRounds[${i}]: expected two boolean pairs` };
      }
      parsed.push({ interception, miscommunication });
    }
    decryptoRounds = parsed;
  }
  let decryptoTiebreak: MatchOutcomeTeams["decryptoTiebreak"];
  if (v.decryptoTiebreak !== undefined && v.decryptoTiebreak !== null) {
    if (v.decryptoTiebreak !== 0 && v.decryptoTiebreak !== 1 && v.decryptoTiebreak !== "shared") {
      return { ok: false, error: 'decryptoTiebreak: expected 0, 1, or "shared"' };
    }
    decryptoTiebreak = v.decryptoTiebreak;
  }

  const value: MatchOutcomeTeams = {
    kind: "teams",
    teams,
    winnerTeamIndices,
    ...(moderator ? { moderator } : {}),
    ...(scenario !== undefined ? { scenario } : {}),
    ...(decryptoRounds !== undefined ? { decryptoRounds } : {}),
    ...(decryptoTiebreak !== undefined ? { decryptoTiebreak } : {}),
  };
  const decryptoError = describeDecryptoRecordError(value);
  if (decryptoError) return { ok: false, error: `decryptoRounds: ${decryptoError}` };
  return { ok: true, value };
}

function parseLastStanding(v: Record<string, unknown>): ParseResult<MatchOutcomeLastStanding> {
  if (!Array.isArray(v.players) || v.players.length < 2) {
    return { ok: false, error: "last-standing: need >=2 players" };
  }
  if (v.players.length > 20) return { ok: false, error: "last-standing: too many players" };
  const players: MatchOutcomeLastStanding["players"] = [];
  for (let i = 0; i < v.players.length; i++) {
    const raw = v.players[i];
    const p = parseParticipant(raw, `players[${i}]`);
    if (!p.ok) return p;
    if (!isPlainObject(raw)) return { ok: false, error: `players[${i}]: not an object` };
    const elim = raw.eliminationOrder === undefined ? undefined : asInteger(raw.eliminationOrder);
    if (elim === null) return { ok: false, error: `players[${i}]: invalid eliminationOrder` };
    // Optional per-player role label (Dungeon Mayhem hero, etc.) — mirrors the
    // free-for-all/team-member `role` handling so it survives the write round-trip.
    const role = raw.role !== undefined ? asOptionalString(raw.role, 64) : undefined;
    // Optional 1-based standing among survivors (poker chip order). Mirrors
    // LastStandingPlayerSchema: survivors only, >= 1.
    const rank = raw.survivorRank === undefined ? undefined : asInteger(raw.survivorRank);
    if (rank === null || (rank !== undefined && rank < 1)) {
      return { ok: false, error: `players[${i}]: invalid survivorRank` };
    }
    if (rank !== undefined && elim !== undefined) {
      return { ok: false, error: `players[${i}]: survivorRank is only allowed on survivors` };
    }
    players.push({
      ...p.value,
      ...(elim !== undefined ? { eliminationOrder: elim } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(rank !== undefined ? { survivorRank: rank } : {}),
    });
  }
  const survivorRanks = players
    .map((p) => p.survivorRank)
    .filter((r): r is number => r !== undefined);
  if (new Set(survivorRanks).size !== survivorRanks.length) {
    return { ok: false, error: "last-standing: survivorRank values must be unique" };
  }
  // No explicit winnerUserIds for last-standing — every player without an
  // eliminationOrder is a survivor, and survivors are the winners by definition.
  // Require at least one survivor so the row isn't a "everyone got eliminated"
  // logical contradiction.
  if (players.every((p) => p.eliminationOrder !== undefined)) {
    return { ok: false, error: "last-standing: at least one player must survive" };
  }
  const scenario = asOptionalString(v.scenario, 64);
  return {
    ok: true,
    value: {
      kind: "last-standing",
      players,
      ...(scenario !== undefined ? { scenario } : {}),
    },
  };
}

function parseCoop(v: Record<string, unknown>): ParseResult<MatchOutcomeCoop> {
  if (!Array.isArray(v.participants) || v.participants.length === 0) {
    return { ok: false, error: "coop: participants must be non-empty" };
  }
  if (v.participants.length > 20) return { ok: false, error: "coop: too many participants" };
  const participants: MatchOutcomeCoop["participants"] = [];
  for (let i = 0; i < v.participants.length; i++) {
    const raw = v.participants[i];
    const p = parseParticipant(raw, `participants[${i}]`);
    if (!p.ok) return p;
    // Optional per-player D&D condition: "unconscious" or "dead". Mirrors
    // CoopParticipantSchema.
    let condition: "unconscious" | "dead" | undefined;
    if (isPlainObject(raw) && raw.condition !== undefined) {
      if (raw.condition !== "unconscious" && raw.condition !== "dead") {
        return {
          ok: false,
          error: `participants[${i}]: condition must be 'unconscious' or 'dead'`,
        };
      }
      condition = raw.condition;
    }
    participants.push({ ...p.value, ...(condition !== undefined ? { condition } : {}) });
  }
  // `outcome` (win/loss) and `score` are both optional, but a coop match needs at
  // least one: binary co-ops carry win/loss, scored co-ops (Just One) carry a
  // 0–1000 score instead. Mirrors MatchOutcomeCoopSchema.
  let outcome: "win" | "loss" | undefined;
  if (v.outcome !== undefined) {
    if (v.outcome !== "win" && v.outcome !== "loss") {
      return { ok: false, error: "coop: outcome must be 'win' or 'loss'" };
    }
    outcome = v.outcome;
  }
  let score: number | undefined;
  if (v.score !== undefined) {
    const n = asInteger(v.score);
    if (n === null || n < 0 || n > 1000) {
      return { ok: false, error: "coop: score must be an integer in 0..1000" };
    }
    score = n;
  }
  // A D&D campaign session may be unresolved (no outcome/score yet). Its name is
  // what makes that legal. Mirrors MatchOutcomeCoopSchema's union refinement.
  const campaign = asOptionalString(v.campaign, 120);
  if (outcome === undefined && score === undefined && campaign === undefined) {
    return { ok: false, error: "coop: needs a win/loss outcome or a score" };
  }
  const difficulty = asOptionalString(v.difficulty, 64);
  const details = asOptionalString(v.details, 1000);
  const scenario = asOptionalString(v.scenario, 64);
  // Optional D&D Dungeon Master — non-competing, mirrors the teams moderator.
  let moderator: MatchOutcomeCoop["moderator"];
  if (v.moderator !== undefined && v.moderator !== null) {
    const m = parseParticipant(v.moderator, "moderator");
    if (!m.ok) return m;
    const role =
      isPlainObject(v.moderator) && v.moderator.role !== undefined
        ? asOptionalString(v.moderator.role, 64)
        : undefined;
    moderator = { ...m.value, ...(role !== undefined ? { role } : {}) };
  }
  return {
    ok: true,
    value: {
      kind: "coop",
      participants,
      ...(outcome !== undefined ? { outcome } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
      ...(details !== undefined ? { details } : {}),
      ...(scenario !== undefined ? { scenario } : {}),
      ...(campaign !== undefined ? { campaign } : {}),
      ...(moderator ? { moderator } : {}),
    },
  };
}

function parseOneVsMany(v: Record<string, unknown>): ParseResult<MatchOutcomeOneVsMany> {
  if (!isPlainObject(v.solo)) return { ok: false, error: "one-vs-many: solo missing" };
  const soloP = parseParticipant(v.solo, "solo");
  if (!soloP.ok) return soloP;
  const soloRoleLabel = asOptionalString(v.solo.roleLabel, 64);
  if (!isPlainObject(v.team)) return { ok: false, error: "one-vs-many: team missing" };
  if (!Array.isArray(v.team.members) || v.team.members.length === 0) {
    return { ok: false, error: "one-vs-many: team.members empty" };
  }
  const members: Participant[] = [];
  for (let i = 0; i < v.team.members.length; i++) {
    const p = parseParticipant(v.team.members[i], `team.members[${i}]`);
    if (!p.ok) return p;
    members.push(p.value);
  }
  if (members.some((m) => m.userId === soloP.value.userId)) {
    return { ok: false, error: "one-vs-many: solo cannot also be a team member" };
  }
  const teamRoleLabel = asOptionalString(v.team.roleLabel, 64);
  if (v.winnerSide !== "solo" && v.winnerSide !== "team") {
    return { ok: false, error: "one-vs-many: winnerSide must be 'solo' or 'team'" };
  }
  return {
    ok: true,
    value: {
      kind: "one-vs-many",
      solo: {
        ...soloP.value,
        ...(soloRoleLabel !== undefined ? { roleLabel: soloRoleLabel } : {}),
      },
      team: {
        members,
        ...(teamRoleLabel !== undefined ? { roleLabel: teamRoleLabel } : {}),
      },
      winnerSide: v.winnerSide,
    },
  };
}

export function parseOutcome(input: unknown): ParseResult<MatchOutcome> {
  if (!isPlainObject(input)) return { ok: false, error: "outcome must be an object" };
  switch (input.kind) {
    case "free-for-all":
      return parseFreeForAll(input);
    case "teams":
      return parseTeams(input);
    case "last-standing":
      return parseLastStanding(input);
    case "coop":
      return parseCoop(input);
    case "one-vs-many":
      return parseOneVsMany(input);
    default:
      return { ok: false, error: `unknown kind: ${String(input.kind)}` };
  }
}

export function collectUserIds(outcome: MatchOutcome): Set<string> {
  const ids = new Set<string>();
  switch (outcome.kind) {
    case "free-for-all":
    case "last-standing":
      for (const p of outcome.players) ids.add(p.userId);
      break;
    case "teams":
      for (const t of outcome.teams) for (const m of t.members) ids.add(m.userId);
      if (outcome.moderator) ids.add(outcome.moderator.userId);
      break;
    case "coop":
      for (const p of outcome.participants) ids.add(p.userId);
      if (outcome.moderator) ids.add(outcome.moderator.userId);
      break;
    case "one-vs-many":
      ids.add(outcome.solo.userId);
      for (const m of outcome.team.members) ids.add(m.userId);
      break;
  }
  return ids;
}

export function refreshDisplayNames(
  outcome: MatchOutcome,
  nameById: Map<string, string>,
): MatchOutcome {
  const fresh = (p: Participant): Participant => ({
    userId: p.userId,
    displayName: nameById.get(p.userId) ?? p.displayName,
  });
  switch (outcome.kind) {
    case "free-for-all":
      return {
        ...outcome,
        players: outcome.players.map((p) => ({ ...p, ...fresh(p) })),
      };
    case "teams":
      return {
        ...outcome,
        teams: outcome.teams.map((t) => ({
          ...t,
          // Spread the original member first so per-member fields like `role`
          // survive; then overlay fresh userId/displayName from the user table.
          members: t.members.map((m) => ({ ...m, ...fresh(m) })),
        })),
        ...(outcome.moderator
          ? { moderator: { ...outcome.moderator, ...fresh(outcome.moderator) } }
          : {}),
      };
    case "last-standing":
      return {
        ...outcome,
        players: outcome.players.map((p) => ({ ...p, ...fresh(p) })),
      };
    case "coop":
      return {
        ...outcome,
        participants: outcome.participants.map((p) => ({ ...p, ...fresh(p) })),
        ...(outcome.moderator
          ? { moderator: { ...outcome.moderator, ...fresh(outcome.moderator) } }
          : {}),
      };
    case "one-vs-many":
      return {
        ...outcome,
        solo: { ...outcome.solo, ...fresh(outcome.solo) },
        team: { ...outcome.team, members: outcome.team.members.map(fresh) },
      };
  }
}

const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDateTime(v: unknown): v is string {
  return typeof v === "string" && ISO_DATETIME_RE.test(v);
}

export function isValidDateKey(v: unknown): v is string {
  return typeof v === "string" && DATE_KEY_RE.test(v);
}

export function isValidGameSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}
