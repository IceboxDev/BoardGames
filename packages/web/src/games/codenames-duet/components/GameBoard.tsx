import type { DuetAction, DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { Button, ErrorAlert } from "../../../components/ui";
import { ClueComposer } from "../../codenames/components/ClueComposer";
import {
  ClueDisplay,
  KeyToggle,
  StandInBadge,
  TableHeader,
  ThinkingLine,
  TurnStatus,
} from "../../codenames/components/TableHeader";
import { TurnTimer } from "../../codenames/components/TurnTimer";
import { WordGrid } from "../../codenames/components/WordGrid";
import { mapDuetLog, sideLabel, toGridCard } from "../logic";
import { DuetPanel } from "./DuetPanel";

interface GameBoardProps {
  view: DuetPlayerView;
  names: readonly (string | null)[];
  onAction: (action: DuetAction) => void;
  error: string | null;
}

function doing(view: DuetPlayerView): { side: string; text: string; mine: boolean } {
  if (view.phase === "sudden-death") {
    return view.canGuess
      ? { side: "Sudden death", text: "Your pick — any miss loses", mine: true }
      : { side: "Sudden death", text: "Your partner is choosing", mine: false };
  }
  if (view.phase === "clue") {
    return view.mustGiveClue
      ? { side: "Your clue", text: "Point your partner at your agents", mine: true }
      : { side: "Partner's clue", text: "They are thinking", mine: false };
  }
  return view.canGuess
    ? { side: "Your guess", text: "Find the agents on their key", mine: true }
    : { side: "Partner guessing", text: "Your clue is out there", mine: false };
}

export default function GameBoard({ view, names, onAction, error }: GameBoardProps) {
  const [showKey, setShowKey] = useState(true);
  const turnKey = `${view.turns.length}:${view.phase}`;
  const [chosenFor, setChosenFor] = useState<{ turn: string; cards: number[] }>({
    turn: turnKey,
    cards: [],
  });
  const chosen = chosenFor.turn === turnKey ? chosenFor.cards : [];
  const guessable = new Set(view.guessable);
  const choosable = (i: number) =>
    view.mustGiveClue && view.cards[i]?.mine === "agent" && view.cards[i]?.found === false;

  const cards = view.cards.map((card, i) => ({
    ...toGridCard(card, guessable.has(i) || choosable(i), showKey),
    chosen: chosen.includes(i),
  }));
  const faceDown = view.cards.filter((c) => !c.found).map((c) => c.word);
  const now = doing(view);
  const partner = (1 - (view.seat === 1 ? 1 : 0)) as 0 | 1;

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
          showUnlimited={false}
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
        <ThinkingLine who={sideLabel(view.giver, names)} what="is thinking of a clue…" />
      )
    ) : view.phase === "sudden-death" ? (
      <span className="text-sm font-semibold uppercase tracking-pill text-amber-300">
        No more clues — {view.agentsLeft[0] + view.agentsLeft[1]} agents to go
      </span>
    ) : view.clue ? (
      <ClueDisplay clue={view.clue} tone="green" guessesMade={view.guessesMade} />
    ) : null;

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-6xl"
      leftSidebarTitle="Codenames: Duet"
      leftSidebarLabel="Mission"
      leftSidebar={
        <DuetPanel view={view} names={names} onChat={(text) => onAction({ kind: "chat", text })} />
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
            side={now.side}
            doing={view.aiThinking === partner && !now.mine ? `${now.text}…` : now.text}
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
            {view.seat !== -1 && (
              <KeyToggle shown={showKey} onToggle={() => setShowKey((s) => !s)} />
            )}
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="absolute inset-x-0 top-2 z-raised mx-auto w-full max-w-md px-2">
            <ErrorAlert message={error} />
          </div>
        )}
        <WordGrid cards={cards} onPick={pick} />
      </div>
    </GameScreen>
  );
}
