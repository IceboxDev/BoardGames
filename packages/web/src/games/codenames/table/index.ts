// The word-card table kit: everything Codenames and Codenames: Duet draw the
// same way — the header, the board, the clue strip, the roster rail, chat,
// presence notices, the table options and the end-of-game review. A game
// composes these from its own view (`codenames/components/GameBoard.tsx`,
// `codenames-duet/components/GameBoard.tsx`); anything that is one game's own
// (Codenames' appeals and team pointers, Duet's timer tokens and campaign)
// stays in that game's folder. Duet imports from here only.

export { BoardStage, EndTurnButton } from "./BoardStage";
export { ClueComposer } from "./ClueComposer";
export { ClueStrip, type ClueStripMode, ScorePill } from "./ClueStrip";
export { useClueTargets, useTableKeys } from "./hooks";
export { LastTurnLine } from "./LastTurnLine";
export { OptionsControls, type TableOptions } from "./OptionsControls";
export { PresenceNotices } from "./PresenceNotices";
export { RailCard, RailStat } from "./RailCard";
export { ReviewScreen } from "./review/ReviewScreen";
export {
  guessParts,
  type Highlight,
  noteTargets,
  type RaceSeries,
  type ReviewGuess,
  type ReviewModel,
  type ReviewTurn,
  type TargetFate,
  tierName,
  type Verdict,
} from "./review-model";
export { SeatRow, SeatStatus } from "./SeatRow";
export {
  ClueDisplay,
  type ClueGuesses,
  KeyToggle,
  PhaseBanner,
  StandInBadge,
  TableHeader,
  ThinkingLine,
  TurnStatus,
} from "./TableHeader";
export { type ChatLine, TeamChat } from "./TeamChat";
export { TurnTimer } from "./TurnTimer";
export {
  type AwayNotice,
  awayNoticesOf,
  type LastTurnSummary,
  latestTouchOrder,
  type ReviewNotice,
  roomNotice,
  type StripClue,
  type TouchMark,
} from "./table-logic";
export {
  type CardNote,
  type CardPointer,
  type CoverTone,
  type GridCard,
  WordGrid,
} from "./WordGrid";
