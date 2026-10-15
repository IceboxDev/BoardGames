import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { useState } from "react";
import { GameScreen } from "../../../../components/game-layout";
import {
  Button,
  ErrorAlert,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  SegmentedControl,
} from "../../../../components/ui";
import { ChatRail } from "../components/ChatRail";
import { type SquareSeat, TownSquare } from "../components/TownSquare";
import { useStoryteller } from "../context";
import { clockChair, handOf, phaseTitle } from "../helpers";
import { DayScript } from "./DayScript";
import { NightScript } from "./NightScript";
import { SeatSheet } from "./SeatSheet";
import { SetupScript } from "./SetupScript";

/** The Grimoire laid on the town square: every token's truth and reminders. */
function useGrimoireSeats(): SquareSeat[] {
  const { view } = useStoryteller();
  const state = view.companion;
  if (!state) {
    return (view.setup?.order ?? []).map((seat) => ({
      seat,
      name: view.names[seat] ?? `Player ${seat}`,
      alive: true,
      ghostVote: true,
      connected: view.connected[seat] ?? false,
    }));
  }
  const awake = new Set(view.wake?.seats ?? []);
  return state.players.flatMap((p) => {
    if (p.roomSeat === undefined) return [];
    const notes: string[] = [];
    if (p.believedCharacter) notes.push(`thinks ${CHARACTERS[p.believedCharacter].name}`);
    if (p.poisoned) notes.push("poisoned");
    if ((p.drunkNights ?? 0) > 0) notes.push("drunk");
    if (p.protectedTonight) notes.push("safe tonight");
    if (p.redHerring) notes.push("red herring");
    if (p.registersDead) notes.push("secretly alive");
    const shown = view.shown[p.roomSeat];
    if (view.stage === "reveal" && shown)
      notes.push(shown.acknowledged ? "✓ seen" : "not seen yet");
    const vote = view.day.vote;
    return [
      {
        seat: p.roomSeat,
        name: p.name,
        alive: p.alive,
        ghostVote: p.ghostVote,
        left: p.left ?? false,
        connected: view.connected[p.roomSeat] ?? false,
        character: p.character,
        notes: notes.slice(0, 2),
        tone: awake.has(p.roomSeat)
          ? "awake"
          : vote?.nominee === p.roomSeat
            ? "nominee"
            : vote?.nominator === p.roomSeat
              ? "nominator"
              : null,
        hand: handOf(view, p.roomSeat),
      },
    ];
  });
}

function EndGameModal({ onClose }: { onClose: () => void }) {
  const { st } = useStoryteller();
  const [winner, setWinner] = useState<"good" | "evil">("good");
  const [reason, setReason] = useState("");
  return (
    <Modal onClose={onClose} size="sm" title="End the game">
      <ModalBody>
        <SegmentedControl
          options={[
            { value: "good", label: "Good wins", tone: "sky" },
            { value: "evil", label: "Evil wins", tone: "rose" },
          ]}
          value={winner}
          onChange={setWinner}
          shape="rounded"
        />
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why (the town will see this)"
          maxLength={200}
        />
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!reason.trim()}
          onClick={() => {
            st({ kind: "end-game", winner, reason: reason.trim() });
            onClose();
          }}
        >
          End the game
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function RevealScript() {
  const { view } = useStoryteller();
  const state = view.companion;
  if (!state) return null;
  const shown = view.shown.some(Boolean);
  return (
    <div className="flex flex-col gap-2 text-sm text-fg-secondary">
      <p>
        The Grimoire is dealt. Check it on the square — swap any character from a seat's sheet —
        then show everyone their character.
      </p>
      {shown && (
        <p>
          {view.shown.filter((s) => s?.acknowledged).length} of {state.players.length} have looked.
          Begin the first night when everyone has.
        </p>
      )}
    </div>
  );
}

function ActionBar({ onEnd }: { onEnd: () => void }) {
  const { view, st } = useStoryteller();
  const phase = view.phase.kind;
  return (
    <div className="flex h-actions items-center gap-2 overflow-x-auto px-1">
      {view.stage === "setup" && (
        <Button
          size="sm"
          variant="solid"
          tone="amber"
          disabled={!view.setup?.bag}
          onClick={() => st({ kind: "deal" })}
        >
          Deal the characters
        </Button>
      )}
      {view.stage === "reveal" && !view.shown.some(Boolean) && (
        <Button
          size="sm"
          variant="solid"
          tone="amber"
          onClick={() => st({ kind: "reveal-characters" })}
        >
          Show everyone their character
        </Button>
      )}
      {view.stage === "reveal" && view.shown.some(Boolean) && (
        <Button size="sm" variant="solid" tone="amber" onClick={() => st({ kind: "begin-night" })}>
          Begin the first night
        </Button>
      )}
      {phase === "night" && (
        <Button size="sm" variant="solid" tone="amber" onClick={() => st({ kind: "dawn" })}>
          Dawn
        </Button>
      )}
      {phase === "day" && (
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => st({ kind: "nominations", open: !view.day.nominationsOpen })}
          >
            {view.day.nominationsOpen ? "Close nominations" : "Open nominations"}
          </Button>
          <Button size="sm" variant="solid" tone="amber" onClick={() => st({ kind: "end-day" })}>
            End the day
          </Button>
        </>
      )}
      <span className="flex-1" />
      {view.stage !== "setup" && view.stage !== "over" && (
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={!view.undoLabel}
            title={view.undoLabel ?? undefined}
            onClick={() => st({ kind: "undo" })}
          >
            ↶ Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!view.redoLabel}
            title={view.redoLabel ?? undefined}
            onClick={() => st({ kind: "redo" })}
          >
            ↷ Redo
          </Button>
          <Button size="sm" variant="ghost" onClick={onEnd}>
            End game…
          </Button>
        </>
      )}
    </div>
  );
}

/** The Storyteller's desk: the Grimoire on the square, the script, the town's talk. */
export function StorytellerScreen() {
  const { view, endActions, error } = useStoryteller();
  const seats = useGrimoireSeats();
  const [sheet, setSheet] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const phase = view.phase.kind;

  return (
    <GameScreen
      leftSidebar={
        <div className="flex flex-col gap-3">
          {error && <ErrorAlert message={error} />}
          {view.stage === "setup" ? (
            <SetupScript />
          ) : view.stage === "reveal" ? (
            <RevealScript />
          ) : phase === "night" ? (
            <NightScript />
          ) : phase === "day" ? (
            <DayScript />
          ) : (
            <div className="flex flex-col gap-2">
              {endActions.map((a) => (
                <Button key={a.label} size="sm" variant={a.variant} onClick={a.onClick}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      }
      leftSidebarTitle={phaseTitle(view)}
      sidebar={<ChatRail />}
      actionBar={<ActionBar onEnd={() => setEnding(true)} />}
    >
      <TownSquare
        seats={seats}
        clockAt={clockChair(view)}
        onSeatClick={view.companion ? setSheet : undefined}
        ariaLabel="The Grimoire"
        center={
          <>
            <span className="text-xs font-bold uppercase tracking-eyebrow text-fg-muted">
              Storyteller
            </span>
            <span className="text-3xl font-black text-fg-strong">{phaseTitle(view)}</span>
            {view.phase.kind === "ended" && (
              <span className="text-sm text-fg-secondary">{view.phase.reason}</span>
            )}
          </>
        }
      />
      {sheet !== null && <SeatSheet roomSeat={sheet} onClose={() => setSheet(null)} />}
      {ending && <EndGameModal onClose={() => setEnding(false)} />}
    </GameScreen>
  );
}
