// Single source of truth for match-history types lives in the wire-protocol
// module so server, client, and validation share one schema. Kept here as a
// re-export so existing `@boardgames/core/history/types` imports keep working.
export {
  type HistoryListResponse,
  MATCH_KINDS,
  type MatchCreateInput,
  type MatchKind,
  type MatchOutcome,
  type MatchOutcomeCoop,
  type MatchOutcomeFreeForAll,
  type MatchOutcomeLastStanding,
  type MatchOutcomeOneVsMany,
  type MatchOutcomeTeams,
  type MatchRecord,
  type MatchUpdateInput,
  type Participant,
} from "../protocol/http/history.ts";
