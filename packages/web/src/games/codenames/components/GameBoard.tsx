import type {
  CodenamesAction,
  CodenamesPlayerView,
  Team,
} from "@boardgames/core/games/codenames/types";
import { type ReactNode, useEffect, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { GaugeIcon } from "../../../components/icons";
import { Button, ErrorAlert, IconButton } from "../../../components/ui";
import { useTurnAlert } from "../../../hooks/useTurnAlert";
import { hasFellowOperative, seatLabel, TEAM_TONE, teamName, toneOf } from "../logic/labels";
import { mapCodenamesLog } from "../logic/log-mapper";
import { useOneTapTouch } from "../logic/preferences";
import {
  alertLabel,
  awayNotices,
  type LastTurn,
  lastTurn,
  recentTouches,
  scoreOf,
  teamClues,
} from "../logic/table";
import { AppealPending, AppealRuling, AppealWatch } from "./AppealPanel";
import { ClueComposer } from "./ClueComposer";
import { ClueStrip, type ClueStripMode } from "./ClueStrip";
import { LastTurnLine } from "./LastTurnLine";
import { PresenceNotices } from "./PresenceNotices";
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
import { type CardNote, type CardPointer, type GridCard, WordGrid } from "./WordGrid";

// The Codenames table: the turn header (fixed height, so the board never
// moves), the clue strip (the team's clues and, on narrow screens, the
// score), the board sized to the space left, the teams on the left and the
// clue history on the right. Overlays at the foot of the board say who
// dropped out; the browser tab is marked while the game waits on this player. Every affordance keys
// off the view's own flags (mustGiveClue / canGuess / canNote / mustRuleClue
// …) — the game runs at activePlayer -1 because several operatives may guess
// and chat, pointers and notes flow from any seat.
//
// Touching is two steps: a tap PICKS a card — it moves your pointer (your
// avatar) there, so the team sees what each of you would touch — and the
// Touch button on it (or Enter) commits. A player who wants speed turns on
// one-tap touching. Picking is free; touching can't be taken back. With no
// other person guessing on your team (solo) there is no one to point for:
// a tap touches, and the one-tap switch isn't offered.

interface GameBoardProps {
  view: CodenamesPlayerView;
  /** People's names by seat (rooms); null = label by role. */
  names: readonly (string | null)[];
  onAction: (action: CodenamesAction) => void;
  error: string | null;
}

function doing(view: CodenamesPlayerView): { text: string; mine: boolean } {
  const ourTurn = view.team === view.currentTeam;
  if (view.appeal !== null) {
    if (view.mustRuleClue) return { text: "Your ruling", mine: true };
    return { text: view.canWithdrawClue ? "Waiting for a ruling" : "Checking a clue", mine: false };
  }
  if (view.phase === "clue") {
    if (view.mustGiveClue) return { text: "Your clue", mine: true };
    return { text: "Spymaster is thinking", mine: false };
  }
  if (view.canGuess) return { text: "Your guess", mine: true };
  return { text: ourTurn ? "Your team is guessing" : "Operatives are guessing", mine: false };
}

/** Someone else's move: the line saying so, and what happened on the last turn under it. */
function Watching({ last, children }: { last: LastTurn | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      {children}
      {last && <LastTurnLine last={last} />}
    </div>
  );
}

/** Typing somewhere (chat, the clue): board keys stay out of the way. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export default function GameBoard({ view, names, onAction, error }: GameBoardProps) {
  // A spymaster can hide the key to see the board the way their team does.
  const [showKey, setShowKey] = useState(true);
  const [oneTapPreferred, setOneTap] = useOneTapTouch();
  // Pointing a card out before touching it is for the team: with no other
  // person guessing beside you (solo, or the only person on your team), there
  // is no one to point it out to — a tap touches.
  const pointing = hasFellowOperative(view);
  const oneTap = oneTapPreferred || !pointing;
  // Everything picked or chosen is kept per live turn: a new turn (or phase)
  // starts clean. Finished turns only ever grow, so this is stable mid-turn.
  const turnKey = `${view.turns.filter((t) => t.end !== null).length}:${view.phase}`;

  // The cards a spymaster taps while writing a clue: what it means.
  const [chosenFor, setChosenFor] = useState<{ turn: string; cards: number[] }>({
    turn: turnKey,
    cards: [],
  });
  const chosen = chosenFor.turn === turnKey ? chosenFor.cards : [];

  // The operative's pick — local first, so it shows at once; after a reload
  // the server's copy of their pointer stands in.
  const [pickFor, setPickFor] = useState<{ turn: string; card: number | null } | null>(null);
  const serverPick = view.cards.findIndex((c) => c.marks.includes(view.seat));
  const rawPick = pickFor?.turn === turnKey ? pickFor.card : serverPick >= 0 ? serverPick : null;
  const picked =
    view.canGuess && rawPick !== null && view.cards[rawPick]?.revealed === null ? rawPick : null;

  const isSpymaster = view.role === "spymaster" && view.seat >= 0;
  const isOperative = view.role === "operative" && view.seat >= 0;
  const stripMode: ClueStripMode = isOperative ? "pin" : isSpymaster ? "owed" : "watch";
  const clues = teamClues(view);

  // The strip's selected clue (its turn): an operative pinning it on cards,
  // or a spymaster looking at what it still owes.
  const [stripTurn, setStripTurn] = useState<number | null>(null);
  const pinning = stripMode === "pin" && view.canNote ? stripTurn : null;
  const owedClue = stripMode === "owed" ? clues.find((c) => c.turn === stripTurn) : undefined;
  const owed = new Set(owedClue?.owed ?? []);

  useTurnAlert(alertLabel(view));
  const recent = recentTouches(view);
  const last = lastTurn(view);
  const appeal = view.appeal;
  const otherSpymaster = (1 - view.currentTeam) as Team;

  const choosable = (i: number) =>
    view.mustGiveClue && view.cards[i]?.revealed === null && view.cards[i]?.key === view.team;

  const pointersOn = (i: number): CardPointer[] => {
    const seats = (view.cards[i]?.marks ?? []).filter((seat) => seat !== view.seat);
    if (picked === i) seats.unshift(view.seat);
    return seats.map((seat) => ({
      key: String(seat),
      name: seatLabel(seat, names),
      mine: seat === view.seat,
    }));
  };

  const notesOn = (i: number): CardNote[] =>
    [...(view.cards[i]?.notes ?? [])]
      .sort((a, b) => a.turn - b.turn)
      .map((note) => {
        const clue = view.turns[note.turn]?.clue;
        const word = (clue?.word ?? "?").toUpperCase();
        const count = clue ? ` ${clue.count === "unlimited" ? "∞" : clue.count}` : "";
        return {
          key: String(note.turn),
          label: word,
          title: `${word}${count} — pinned by ${note.seat === view.seat ? "you" : seatLabel(note.seat, names)}`,
        };
      });

  const cards: GridCard[] = view.cards.map((card, i) => {
    const faceDown = card.revealed === null;
    return {
      word: card.word,
      cover: card.revealed === null ? null : toneOf(card.revealed),
      keyTone: faceDown && card.key !== null && showKey ? toneOf(card.key) : null,
      pointers: pointersOn(i),
      notes: notesOn(i),
      pickable: faceDown && (choosable(i) || view.canGuess || pinning !== null),
      chosen: chosen.includes(i),
      selected: picked === i && pinning === null,
      pinned: pinning !== null && card.notes.some((n) => n.turn === pinning),
      owed: faceDown && owed.has(i),
      ...(recent?.order.has(i)
        ? { touch: recent.order.get(i) as number, touchTone: TEAM_TONE[recent.team] }
        : {}),
      // The two spymasters weighing a clue question see the word it brushes.
      ...(appeal?.clash && faceDown && card.word === appeal.clash ? { target: true } : {}),
    };
  });
  const faceDownWords = view.cards.filter((c) => c.revealed === null).map((c) => c.word);
  const tone = TEAM_TONE[view.currentTeam];
  const now = doing(view);

  const setPick = (card: number | null) => setPickFor({ turn: turnKey, card });
  const touch = (i: number) => onAction({ kind: "guess", card: i });

  const tap = (i: number) => {
    if (view.mustGiveClue) {
      if (!choosable(i)) return;
      setChosenFor({
        turn: turnKey,
        cards: chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i],
      });
      return;
    }
    if (view.cards[i]?.revealed !== null) return;
    if (pinning !== null) {
      onAction({ kind: "note", card: i, turn: pinning });
      return;
    }
    if (!view.canGuess) return;
    if (oneTap) {
      touch(i);
      return;
    }
    // The server moves the seat's one pointer here — or, on the same card, lifts it.
    setPick(picked === i ? null : i);
    onAction({ kind: "mark", card: i });
  };

  // Keys: Enter touches the pick, Esc puts down the armed clue or the pick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.key === "Escape") {
        if (stripTurn !== null) setStripTurn(null);
        else if (picked !== null) {
          setPickFor({ turn: turnKey, card: null });
          onAction({ kind: "mark", card: picked });
        }
        return;
      }
      if (e.key !== "Enter" || picked === null || pinning !== null) return;
      // A focused control keeps its own Enter — except a word card, whose
      // Enter would otherwise just lift the pick it is showing.
      const control = e.target instanceof HTMLElement ? e.target.closest("button") : null;
      if (control && control.dataset.wordCard === undefined) return;
      e.preventDefault();
      onAction({ kind: "guess", card: picked });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAction, picked, pinning, stripTurn, turnKey]);

  // The last question this team's clue drew a "no" on, while it thinks again.
  const live = view.turns.at(-1);
  const refused =
    view.mustGiveClue && live && live.team === view.currentTeam && live.clue === null
      ? (live.appeals?.filter((a) => a.ruling === "refused").at(-1)?.word ?? null)
      : null;

  const clueCenter =
    view.phase !== "clue" ? null : view.mustGiveClue ? (
      <ClueComposer
        faceDownWords={faceDownWords}
        language={view.language}
        chosenWords={chosen.map((i) => (view.cards[i]?.word ?? "").toUpperCase())}
        onSubmit={(word, count) =>
          onAction({
            kind: "give-clue",
            clue: { word, count },
            ...(chosen.length > 0 ? { targets: chosen } : {}),
          })
        }
        ask={{
          judge: seatLabel(otherSpymaster, names),
          refused,
          onAsk: (word, count) =>
            onAction({
              kind: "ask-clue",
              clue: { word, count },
              ...(chosen.length > 0 ? { targets: chosen } : {}),
            }),
        }}
      />
    ) : (
      <Watching last={last}>
        {view.seat === view.currentTeam && view.seats[view.seat]?.standIn ? (
          // Back at the table while the stand-in finishes the clue it started.
          <ThinkingLine who="Your AI stand-in" what="is finishing this clue for you…" />
        ) : (
          <ThinkingLine
            who={seatLabel(view.currentTeam, names)}
            what={view.aiThinking !== null ? "is weighing a clue…" : "is thinking of a clue…"}
          />
        )}
      </Watching>
    );

  const center =
    appeal !== null ? (
      view.mustRuleClue && appeal.word !== null && appeal.clash !== null ? (
        <AppealRuling
          asker={seatLabel(appeal.by, names)}
          word={appeal.word}
          clash={appeal.clash}
          deadlineTs={appeal.deadlineTs}
          onRule={(allow) => onAction({ kind: "rule-clue", allow })}
        />
      ) : view.canWithdrawClue && appeal.word !== null ? (
        <AppealPending
          judge={seatLabel(appeal.judge, names)}
          word={appeal.word}
          count={appeal.count}
          judging={view.aiThinking === appeal.judge}
          deadlineTs={appeal.deadlineTs}
          onWithdraw={() => onAction({ kind: "withdraw-clue" })}
        />
      ) : (
        <Watching last={last}>
          <AppealWatch asker={seatLabel(appeal.by, names)} judge={seatLabel(appeal.judge, names)} />
        </Watching>
      )
    ) : view.phase === "clue" ? (
      clueCenter
    ) : view.clue ? (
      <ClueDisplay
        clue={view.clue}
        tone={tone}
        guessesMade={view.guessesMade}
        guessesLeft={view.guessesLeft}
      />
    ) : null;

  const pickedWord = picked === null ? null : (view.cards[picked]?.word ?? "").toUpperCase();
  const away = awayNotices(view);
  const me = view.seats[view.seat];

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
            {pickedWord !== null && pinning === null && !oneTap && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => picked !== null && touch(picked)}
                title="Touch it — this can't be taken back (Enter)"
                className="hidden max-w-40 sm:inline-flex"
              >
                <span className="truncate">Touch {pickedWord}</span>
              </Button>
            )}
            {view.canEndTurn && (
              <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "end-turn" })}>
                End turn
              </Button>
            )}
            {isOperative && pointing && (
              <IconButton
                variant="bordered"
                size="sm"
                icon={<GaugeIcon />}
                pressed={oneTap}
                aria-label={oneTap ? "One-tap touching is on" : "One-tap touching is off"}
                title={
                  oneTap
                    ? "One-tap touching: a tap touches the card at once. Click to go back to pick, then Touch."
                    : "Pick, then Touch. Click for one-tap touching (a tap touches at once)."
                }
                onClick={() => setOneTap(!oneTap)}
              />
            )}
            {isSpymaster && <KeyToggle shown={showKey} onToggle={() => setShowKey((s) => !s)} />}
          </>
        }
      />

      <ClueStrip
        mode={stripMode}
        clues={clues}
        selected={stripMode === "watch" ? null : stripTurn}
        onSelect={setStripTurn}
        enabled={stripMode === "pin" ? view.canNote : view.phase !== "over"}
        score={scoreOf(view)}
        owedWords={(owedClue?.owed ?? []).map((c) => (view.cards[c]?.word ?? "").toUpperCase())}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="absolute inset-x-0 top-2 z-raised mx-auto w-full max-w-md px-2">
            <ErrorAlert message={error} />
          </div>
        )}
        <WordGrid
          cards={cards}
          onPick={tap}
          {...(view.canGuess && !oneTap && pinning === null ? { onTouch: touch } : {})}
        />
        <PresenceNotices
          notices={away}
          nameOf={(seat) => seatLabel(seat, names)}
          waitingFor={appeal !== null ? "ruling" : view.phase === "clue" ? "clue" : "guess"}
          returning={me?.returning ?? false}
          onHandOver={(seat) => onAction({ kind: "hand-over", seat })}
        />
      </div>
    </GameScreen>
  );
}
