import { TOTAL_AGENTS } from "@boardgames/core/games/codenames-duet/manifest";
import type { DuetAction, DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { type ReactNode, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen, usePendingAction } from "../../../components/game-layout";
import { useTurnAlert } from "../../../hooks/useTurnAlert";
import {
  BoardStage,
  ClueComposer,
  ClueDisplay,
  ClueStrip,
  EndTurnButton,
  KeyToggle,
  LastTurnLine,
  type LastTurnSummary,
  PhaseBanner,
  PresenceNotices,
  ScorePill,
  StandInBadge,
  TableHeader,
  ThinkingLine,
  TurnStatus,
  TurnTimer,
  useClueTargets,
  useTableKeys,
  WordGrid,
} from "../../codenames/table";
import {
  duetAlertLabel,
  duetAwayNotices,
  duetGridCards,
  duetLastTurn,
  duetStripClues,
  mapDuetLog,
  sideLabel,
} from "../logic";
import { DuetPanel } from "./DuetPanel";

// The Duet table, on the same kit as Codenames (`../../codenames/table`): the
// turn header (fixed height, so the board never moves), the clue strip (your
// clues and what each still owes — the agents a later +1 guess could find),
// the board, the pair on the left and the history on the right. The board
// numbers the latest touches; a player who looked away reads the last turn
// under "… is thinking"; the browser tab is marked while the game waits on
// this player; a partner who drops out can be handed to the AI.

interface GameBoardProps {
  view: DuetPlayerView;
  /** People's names by seat (rooms); null = "Agent A" / "Agent B". */
  names: readonly (string | null)[];
  /** People's profile pictures by seat; null = the role icon. */
  images: readonly (string | null)[];
  onAction: (action: DuetAction) => void;
  error: string | null;
}

/** WHO is to play over WHAT is happening — the header's two lines, as in Codenames. */
function doing(
  view: DuetPlayerView,
  names: readonly (string | null)[],
): { who: string; activity: string; mine: boolean } {
  if (view.phase === "sudden-death") {
    return view.canGuess
      ? { who: "Sudden death", activity: "Your pick — any miss loses", mine: true }
      : { who: "Sudden death", activity: "Your partner is choosing", mine: false };
  }
  if (view.phase === "clue") {
    return view.mustGiveClue
      ? { who: "You", activity: "Your clue", mine: true }
      : { who: sideLabel(view.giver, names), activity: "Thinking of a clue", mine: false };
  }
  const guesser = 1 - view.giver;
  return view.canGuess
    ? { who: "You", activity: "Your guess", mine: true }
    : { who: sideLabel(guesser, names), activity: "Guessing", mine: false };
}

/** Someone else's move: the line saying so, and what happened on the last turn under it. */
function Watching({ last, children }: { last: LastTurnSummary | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      {children}
      {last && <LastTurnLine last={last} />}
    </div>
  );
}

export default function GameBoard({ view, names, images, onAction, error }: GameBoardProps) {
  const [showKey, setShowKey] = useState(true);
  const turnKey = `${view.turns.length}:${view.phase}`;
  const { chosen, toggle: toggleTarget } = useClueTargets(turnKey);
  const choosable = (i: number) =>
    view.mustGiveClue && view.cards[i]?.mine === "agent" && view.cards[i]?.found === false;

  // The strip's opened clue (its turn): what it still owes, outlined on the board.
  const clues = duetStripClues(view);
  const seated = view.seat === 0 || view.seat === 1;
  const [stripTurn, setStripTurn] = useState<number | null>(null);
  const openClue = clues.find((c) => c.turn === stripTurn);
  const owed = new Set(openClue?.owed ?? []);

  useTurnAlert(duetAlertLabel(view));
  useTableKeys({ onEscape: () => setStripTurn(null) });

  const cards = duetGridCards(view, { showKey, chosen, choosable, owed });
  const faceDown = view.cards.filter((c) => !c.found).map((c) => c.word);
  const now = doing(view, names);
  const last = duetLastTurn(view, names);
  const me = seated ? view.seats[view.seat as 0 | 1] : null;
  const endTurn = usePendingAction({
    enabled: view.canEndTurn,
    onCommit: () => onAction({ kind: "end-turn" }),
  });

  const pick = (i: number) => {
    if (view.mustGiveClue) {
      if (choosable(i)) toggleTarget(i);
      return;
    }
    if (endTurn.pending) return;
    onAction({ kind: "guess", card: i });
  };

  const center =
    view.phase === "clue" ? (
      view.mustGiveClue ? (
        <ClueComposer
          faceDownWords={faceDown}
          language={view.language}
          chosenWords={chosen.map((i) => (view.cards[i]?.word ?? "").toUpperCase())}
          onSubmit={(word, count) =>
            onAction({
              kind: "give-clue",
              clue: { word, count },
              ...(chosen.length > 0 ? { targets: chosen } : {}),
            })
          }
        />
      ) : (
        <Watching last={last}>
          {view.giver === view.seat && me?.standIn ? (
            // Back at the table while the stand-in finishes the clue it started.
            <ThinkingLine who="Your AI stand-in" what="is finishing this clue for you…" />
          ) : (
            <ThinkingLine
              who={sideLabel(view.giver, names)}
              what={
                view.aiThinking === view.giver ? "is weighing a clue…" : "is thinking of a clue…"
              }
            />
          )}
        </Watching>
      )
    ) : view.phase === "sudden-death" ? (
      <Watching last={last}>
        <PhaseBanner>
          No more clues — {view.agentsLeft[0] + view.agentsLeft[1]} agents to go
        </PhaseBanner>
      </Watching>
    ) : view.clue ? (
      <ClueDisplay clue={view.clue} tone="green" guessesMade={view.guessesMade} guesses="hidden" />
    ) : null;

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-6xl"
      leftSidebarTitle="Codenames: Duet"
      leftSidebarLabel="Mission"
      leftSidebar={
        <DuetPanel
          view={view}
          names={names}
          images={images}
          onChat={(text) => onAction({ kind: "chat", text })}
        />
      }
      sidebar={
        <ActionLog
          blocks={mapDuetLog(
            view.turns,
            view.cards.map((c) => c.word),
            names,
          )}
        />
      }
    >
      <TableHeader
        status={
          <TurnStatus
            tone={view.phase === "sudden-death" ? "ink" : "green"}
            who={now.who}
            activity={now.activity}
            mine={now.mine}
          />
        }
        center={center}
        controls={
          <>
            {view.aiStandIn && <StandInBadge />}
            {view.deadlineTs !== null && <TurnTimer deadlineTs={view.deadlineTs} />}
            {view.canEndTurn && <EndTurnButton action={endTurn} />}
            {seated && <KeyToggle shown={showKey} onToggle={() => setShowKey((s) => !s)} />}
          </>
        }
      />

      <ClueStrip
        mode={seated ? "owed" : "watch"}
        clues={clues}
        selected={seated ? stripTurn : null}
        onSelect={setStripTurn}
        enabled={view.phase !== "over"}
        ownLabel="Your clues"
        owedWords={(openClue?.owed ?? []).map((c) => (view.cards[c]?.word ?? "").toUpperCase())}
        score={
          <>
            <ScorePill
              dotClass="bg-cn-green"
              label="Agents"
              labelClass="text-cn-green"
              value={`${view.agentsFound}/${TOTAL_AGENTS}`}
              active={view.phase !== "over"}
              title={`${view.agentsFound} of ${TOTAL_AGENTS} agents found`}
            />
            <ScorePill
              dotClass="bg-cn-tan"
              label="Turns"
              labelClass="text-cn-tan"
              value={view.tokens}
              title={`${view.tokens} of ${view.tokensTotal} turns left`}
            />
          </>
        }
      />

      <BoardStage
        error={error}
        notices={
          <PresenceNotices
            notices={duetAwayNotices(view)}
            nameOf={(seat) => sideLabel(seat, names)}
            waitingFor={view.phase === "clue" ? "clue" : "guess"}
            returning={me?.returning ?? false}
            onHandOver={(seat) => onAction({ kind: "hand-over", seat })}
          />
        }
      >
        <WordGrid cards={cards} onPick={pick} />
      </BoardStage>
    </GameScreen>
  );
}
