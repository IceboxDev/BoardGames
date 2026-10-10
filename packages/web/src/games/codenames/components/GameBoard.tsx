import type { CodenamesAction, CodenamesPlayerView } from "@boardgames/core/games/codenames/types";
import { useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { Button, ErrorAlert } from "../../../components/ui";
import {
  hasHumanTeammate,
  initials,
  seatLabel,
  TEAM_TONE,
  teamName,
  toneOf,
} from "../logic/labels";
import { mapCodenamesLog } from "../logic/log-mapper";
import { ClueComposer } from "./ClueComposer";
import {
  ClueDisplay,
  KeyToggle,
  StandInBadge,
  TableHeader,
  ThinkingLine,
  TurnStatus,
} from "./TableHeader";
import { TeamsPanel } from "./TeamsPanel";
import { TurnTimer } from "./TurnTimer";
import { type GridCard, WordGrid } from "./WordGrid";

// The Codenames table: the turn header (fixed height, so the board never
// moves), the board sized to the space left, the teams on the left and the
// clue history on the right. Every affordance keys off the view's own flags
// (mustGiveClue / canGuess / canEndTurn) — the game runs at activePlayer -1
// because several operatives may guess and chat flows from any seat.

interface GameBoardProps {
  view: CodenamesPlayerView;
  /** People's names by seat (rooms); null = label by role. */
  names: readonly (string | null)[];
  onAction: (action: CodenamesAction) => void;
  error: string | null;
}

function doing(view: CodenamesPlayerView): { text: string; mine: boolean } {
  const ourTurn = view.team === view.currentTeam;
  if (view.phase === "clue") {
    if (view.mustGiveClue) return { text: "Your clue", mine: true };
    return { text: "Spymaster is thinking", mine: false };
  }
  if (view.canGuess) return { text: "Your guess", mine: true };
  return { text: ourTurn ? "Your team is guessing" : "Operatives are guessing", mine: false };
}

export default function GameBoard({ view, names, onAction, error }: GameBoardProps) {
  // A spymaster can hide the key to see the board the way their team does.
  const [showKey, setShowKey] = useState(true);
  // The cards a spymaster taps while writing a clue: what it means. Kept per
  // turn, so a new turn starts with nothing chosen.
  const turnKey = `${view.turns.length}:${view.phase}`;
  const [chosenFor, setChosenFor] = useState<{ turn: string; cards: number[] }>({
    turn: turnKey,
    cards: [],
  });
  const chosen = chosenFor.turn === turnKey ? chosenFor.cards : [];
  const isSpymaster = view.role === "spymaster";
  const pointing = view.canGuess && hasHumanTeammate(view);

  const choosable = (i: number) =>
    view.mustGiveClue && view.cards[i]?.revealed === null && view.cards[i]?.key === view.team;

  const cards: GridCard[] = view.cards.map((card, i) => ({
    word: card.word,
    cover: card.revealed === null ? null : toneOf(card.revealed),
    keyTone: card.revealed === null && card.key !== null && showKey ? toneOf(card.key) : null,
    marks: card.marks.map((seat) => initials(seatLabel(seat, names))),
    pickable: (view.canGuess && card.revealed === null) || choosable(i),
    chosen: chosen.includes(i),
  }));
  const faceDown = view.cards.filter((c) => c.revealed === null).map((c) => c.word);
  const tone = TEAM_TONE[view.currentTeam];
  const now = doing(view);

  const pick = (i: number) => {
    if (view.mustGiveClue) {
      if (!choosable(i)) return;
      setChosenFor({
        turn: turnKey,
        cards: chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i],
      });
      return;
    }
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
        <ThinkingLine
          who={seatLabel(view.currentTeam, names)}
          what={view.aiThinking !== null ? "is weighing a clue…" : "is thinking of a clue…"}
        />
      )
    ) : view.clue ? (
      <ClueDisplay
        clue={view.clue}
        tone={tone}
        guessesMade={view.guessesMade}
        guessesLeft={view.guessesLeft}
      />
    ) : null;

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-6xl"
      leftSidebarTitle="Codenames"
      leftSidebarLabel="Teams"
      leftSidebar={
        <TeamsPanel view={view} names={names} onChat={(text) => onAction({ kind: "chat", text })} />
      }
      sidebar={
        <ActionLog
          blocks={mapCodenamesLog(
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
            tone={tone}
            side={teamName(view.currentTeam)}
            doing={now.text}
            mine={now.mine}
            waiting={!now.mine}
          />
        }
        center={center}
        controls={
          <>
            {view.aiStandIn && <StandInBadge />}
            {view.deadlineTs !== null && <TurnTimer deadlineTs={view.deadlineTs} />}
            {view.canEndTurn && (
              <Button variant="primary" size="sm" onClick={() => onAction({ kind: "end-turn" })}>
                End turn
              </Button>
            )}
            {isSpymaster && <KeyToggle shown={showKey} onToggle={() => setShowKey((s) => !s)} />}
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="absolute inset-x-0 top-2 z-raised mx-auto w-full max-w-md px-2">
            <ErrorAlert message={error} />
          </div>
        )}
        <WordGrid
          cards={cards}
          onPick={pick}
          {...(pointing ? { onMark: (card: number) => onAction({ kind: "mark", card }) } : {})}
        />
      </div>
    </GameScreen>
  );
}
