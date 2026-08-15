import type {
  Code,
  DecryptoAction,
  DecryptoPlayerView,
  Digit,
  GuessPurpose,
} from "@boardgames/core/games/decrypto/types";
import { ActionLog } from "../../../components/action-log";
import { GameScreen, PromptRow } from "../../../components/game-layout";
import { teamLabel } from "../logic/labels";
import { mapDecryptoLog } from "../logic/log-mapper";
import { ClueTimer } from "./ClueTimer";
import { EncryptorPanel } from "./EncryptorPanel";
import { GuessPanel } from "./GuessPanel";
import { NoteSheet } from "./NoteSheet";
import { RevealCard } from "./RevealCard";
import { SidePanel } from "./SidePanel";

// The Decrypto table. Everything runs at activePlayer === -1 (simultaneous
// phases), so every affordance keys off the view's `myPending` flags and the
// per-seat legalActions — never `isMyTurn`. AI "thinking" states are likewise
// derived from the view (AI seats + pending flags), not the server's
// ai-thinking broadcast, which is noisy for simultaneous games.

interface GameBoardProps {
  view: DecryptoPlayerView;
  playerNames: (string | null)[];
  onAction: (action: DecryptoAction) => void;
  /** Last rule-rejection message from the server, if any. */
  error: string | null;
}

function CluesBanner({ view }: { view: DecryptoPlayerView }) {
  const tx = view.transmissions[view.txIdx];
  if (!tx?.clues) return null;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-1 rounded-xl bg-surface-800/50 px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
        {teamLabel(view.variant, tx.team)}'s clues
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {tx.clues.map((clue, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: clue order IS the code order
          <span key={i} className="text-lg font-bold text-white">
            <span className="mr-1 text-2xs font-semibold text-fg-muted">{i + 1}.</span>
            {clue}
          </span>
        ))}
      </div>
    </div>
  );
}

function statusRow(view: DecryptoPlayerView) {
  const { phase, myPending } = view;
  if (phase === "clueWriting") {
    if (myPending.encrypt) {
      return (
        <PromptRow
          title="You're encrypting"
          tone="active"
          message="write three clues, one per digit"
        />
      );
    }
    const waitingOn = view.seats
      .filter((s) => s.isEncryptor)
      .map((s) => (s.isAi ? "GPT" : "encryptor"));
    return (
      <PromptRow
        title="Clue writing"
        tone="waiting"
        pulse
        message={`waiting on ${waitingOn.length || "the"} encryptor${waitingOn.length === 2 ? "s" : ""}…`}
      />
    );
  }
  if (phase === "guessing") {
    if (myPending.decode) {
      return <PromptRow title="Decode" tone="active" message="reconstruct your encryptor's code" />;
    }
    if (myPending.intercept) {
      return (
        <PromptRow
          title="Intercept"
          tone="active"
          message="steal the enemy code from their history"
        />
      );
    }
    return <PromptRow title="Guessing" tone="waiting" pulse message="teams are conferring…" />;
  }
  if (phase === "reveal") {
    return <PromptRow title="Reveal" tone="waiting" message="codes on the table" />;
  }
  if (phase === "roundEnd") {
    return <PromptRow title="Round complete" tone="waiting" message="checking the score…" />;
  }
  return (
    <PromptRow title={`Round ${Math.max(view.round, 1)}`} tone="waiting" message="dealing codes…" />
  );
}

export default function GameBoard({ view, playerNames, onAction, error }: GameBoardProps) {
  const myEncryptTx = view.transmissions.find(
    (t) => t.encryptor === view.seat && t.clues === null && !t.skipped,
  );
  const currentTx = view.transmissions[view.txIdx];
  const guessPurpose: GuessPurpose | null = view.myPending.decode
    ? "decode"
    : view.myPending.intercept
      ? "intercept"
      : null;

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-4xl"
      leftSidebarTitle="Decrypto"
      leftSidebar={
        <SidePanel
          view={view}
          playerNames={playerNames}
          onChat={(text) => onAction({ kind: "chat", text })}
        />
      }
      sidebar={<ActionLog blocks={mapDecryptoLog(view)} />}
    >
      <div className="flex items-center justify-center gap-3">
        {statusRow(view)}
        {view.clueTimerDeadlineTs !== null && <ClueTimer deadlineTs={view.clueTimerDeadlineTs} />}
      </div>

      {view.phase === "clueWriting" && myEncryptTx && (
        <EncryptorPanel
          view={view}
          tx={myEncryptTx}
          onSubmit={(clues) => onAction({ kind: "submit-clues", clues })}
          error={error}
        />
      )}

      {view.phase === "guessing" && currentTx && (
        <>
          <CluesBanner view={view} />
          {guessPurpose && (
            <GuessPanel
              tx={currentTx}
              purpose={guessPurpose}
              onDraft={(purpose: GuessPurpose, slot: 0 | 1 | 2, digit: Digit | null) =>
                onAction({ kind: "set-draft", purpose, slot, digit })
              }
              onSubmit={(purpose: GuessPurpose, code: Code) =>
                onAction({ kind: "submit-guess", purpose, code })
              }
            />
          )}
        </>
      )}

      {view.phase === "reveal" && currentTx && <RevealCard view={view} tx={currentTx} />}

      <NoteSheet view={view} />
    </GameScreen>
  );
}
