// Shared types for the global match-history feature. Imported by both
// `@boardgames/server` (validator + persistence) and `@boardgames/web`
// (page, list, record forms). Single source of truth.

export type Participant = {
  userId: string;
  displayName: string;
};

export type MatchOutcomeFreeForAll = {
  kind: "free-for-all";
  // Winners are implicit — highest score wins; ties are co-winners.
  players: Array<Participant & { score: number; rank?: number }>;
};

export type MatchOutcomeTeams = {
  kind: "teams";
  teams: Array<{
    members: Array<Participant & { role?: string }>;
    /** Optional. Many team games (Codenames, Captain Sonar, Resistance) decide
     *  the win without points; the form omits the input when scores aren't
     *  applicable to the picked game. */
    score?: number;
    rank?: number;
  }>;
  winnerTeamIndices: number[];
};

export type MatchOutcomeLastStanding = {
  kind: "last-standing";
  // `eliminationOrder`: 0 = first eliminated, ascending. Absent = survivor.
  // Winners are implicit — every player without an eliminationOrder won.
  players: Array<Participant & { eliminationOrder?: number }>;
};

export type MatchOutcomeCoop = {
  kind: "coop";
  participants: Participant[];
  outcome: "win" | "loss";
  difficulty?: string;
  details?: string;
};

export type MatchOutcomeOneVsMany = {
  kind: "one-vs-many";
  solo: Participant & { roleLabel?: string };
  team: { roleLabel?: string; members: Participant[] };
  winnerSide: "solo" | "team";
};

export type MatchOutcome =
  | MatchOutcomeFreeForAll
  | MatchOutcomeTeams
  | MatchOutcomeLastStanding
  | MatchOutcomeCoop
  | MatchOutcomeOneVsMany;

export type MatchKind = MatchOutcome["kind"];

export const MATCH_KINDS: readonly MatchKind[] = [
  "free-for-all",
  "teams",
  "last-standing",
  "coop",
  "one-vs-many",
];

export type MatchRecord = {
  id: number;
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  updatedAt: string | null;
};

export type MatchCreateInput = {
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string | null;
};

export type MatchUpdateInput = Partial<MatchCreateInput>;

export type HistoryListResponse = {
  matches: MatchRecord[];
  nextBefore: string | null;
};
