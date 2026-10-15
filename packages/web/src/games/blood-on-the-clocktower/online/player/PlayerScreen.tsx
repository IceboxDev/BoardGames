import { useState } from "react";
import { GameScreen } from "../../../../components/game-layout";
import { Button, ErrorAlert } from "../../../../components/ui";
import { ChatRail } from "../components/ChatRail";
import { type SquareSeat, TownSquare } from "../components/TownSquare";
import { usePlayer } from "../context";
import { clockChair, handOf, phaseTitle } from "../helpers";
import { ClaimDialog, InfoDialog, NominateDialog, WakeDialog } from "./dialogs";
import { YouPanel } from "./YouPanel";

/** The square as this player may see it: the town's knowledge, their own token, and (at the end) the truth. */
function useTownSeats(): SquareSeat[] {
  const { view } = usePlayer();
  const truth = view.reveal?.grimoire;
  const vote = view.day.vote;
  return view.town.map((t) => {
    const real = truth?.players.find((p) => p.roomSeat === t.seat);
    const character =
      real?.character ??
      t.traveller ??
      (t.seat === view.you ? view.me.shown?.character : undefined);
    return {
      seat: t.seat,
      name: view.names[t.seat] ?? `Player ${t.seat}`,
      alive: t.alive,
      ghostVote: t.ghostVote,
      left: t.left,
      connected: view.connected[t.seat] ?? false,
      ...(character ? { character } : {}),
      notes: t.seat === view.you ? ["you"] : [],
      tone:
        vote?.nominee === t.seat
          ? "nominee"
          : vote?.nominator === t.seat
            ? "nominator"
            : t.seat === view.you
              ? "selected"
              : null,
      hand: handOf(view, t.seat),
    };
  });
}

function Center() {
  const { view } = usePlayer();
  const vote = view.day.vote;
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;
  if (vote && view.phase.kind === "day") {
    const hands = vote.hands.filter(Boolean).length;
    return (
      <>
        <span className="text-xs font-bold uppercase tracking-eyebrow text-fg-muted">
          {vote.kind === "exile" ? "Exile vote" : "Nomination"}
        </span>
        <span className="text-xl font-bold text-fg-strong">
          {name(vote.nominator)} → {name(vote.nominee)}
        </span>
        <span className="text-sm text-fg-secondary">
          {vote.result
            ? `${vote.result.votes} votes (${vote.result.required} needed): ${vote.result.outcome}`
            : vote.status === "open"
              ? "Hear them out — the clock starts soon."
              : vote.status === "done"
                ? `${hands} hand${hands === 1 ? "" : "s"} — the Storyteller counts.`
                : `${hands} hand${hands === 1 ? "" : "s"} raised`}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-3xl font-black text-fg-strong">{phaseTitle(view)}</span>
      {view.phase.kind === "night" && (
        <span className="text-sm text-fg-secondary">
          {view.me.wake ? "You are awake." : "The town sleeps. Close your eyes."}
        </span>
      )}
      {view.phase.kind === "ended" && (
        <span className="text-sm text-fg-secondary">{view.phase.reason}</span>
      )}
      {view.stage === "setup" && (
        <span className="text-sm text-fg-secondary">The Storyteller is preparing the town.</span>
      )}
    </>
  );
}

function ActionBar({ onNominate, onClaim }: { onNominate: () => void; onClaim: () => void }) {
  const { view, act, endActions } = usePlayer();
  const vote = view.day.vote;
  const me = view.town.find((t) => t.seat === view.you);
  const myHand = handOf(view, view.you);
  const canNominate =
    view.phase.kind === "day" &&
    view.day.nominationsOpen &&
    (!vote || vote.status === "done") &&
    Boolean(me);
  return (
    <div className="flex h-actions items-center gap-2 overflow-x-auto px-1">
      {view.stage === "reveal" && view.me.shown && !view.me.shown.acknowledged && (
        <Button
          size="sm"
          variant="solid"
          tone="amber"
          onClick={() => act({ kind: "ack-character" })}
        >
          I've seen my character
        </Button>
      )}
      {canNominate && (
        <Button size="sm" variant="secondary" onClick={onNominate}>
          Nominate…
        </Button>
      )}
      {vote && myHand && !myHand.locked && vote.status !== "done" && (
        <Button
          size="sm"
          variant="solid"
          tone={myHand.up ? "sky" : "amber"}
          onClick={() => act({ kind: "hand", up: !myHand.up })}
        >
          {myHand.up ? "Lower my hand" : "Raise my hand"}
        </Button>
      )}
      {view.stage === "play" && view.phase.kind === "day" && (
        <Button size="sm" variant="ghost" onClick={onClaim}>
          Claim…
        </Button>
      )}
      {view.stage === "over" &&
        endActions.map((a) => (
          <Button key={a.label} size="sm" variant={a.variant} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
    </div>
  );
}

/** A player's screen: the town square, who you are, and the town's talk. */
export function PlayerScreen() {
  const { view, error } = usePlayer();
  const seats = useTownSeats();
  const [dialog, setDialog] = useState<"nominate" | "claim" | null>(null);
  const [hiddenWake, setHiddenWake] = useState<string | null>(null);
  const unread = view.me.inbox.find((d) => !d.read);
  const wake = view.me.wake;

  return (
    <GameScreen
      leftSidebar={
        <div className="flex flex-col gap-3">
          {error && <ErrorAlert message={error} />}
          <YouPanel />
        </div>
      }
      leftSidebarLabel="You"
      sidebar={<ChatRail />}
      actionBar={
        <ActionBar onNominate={() => setDialog("nominate")} onClaim={() => setDialog("claim")} />
      }
    >
      <TownSquare seats={seats} clockAt={clockChair(view)} center={<Center />} />
      {unread ? (
        <InfoDialog key={unread.id} delivery={unread} />
      ) : wake && hiddenWake !== wake.stepId ? (
        <WakeDialog key={wake.stepId} onHide={() => setHiddenWake(wake.stepId)} />
      ) : null}
      {dialog === "nominate" && <NominateDialog onClose={() => setDialog(null)} />}
      {dialog === "claim" && <ClaimDialog onClose={() => setDialog(null)} />}
    </GameScreen>
  );
}
