import type { PlayerView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { useState } from "react";
import { GameActionBar, GameScreen } from "../../../../components/game-layout";
import { Button, ErrorAlert } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { ChatRail } from "../components/ChatRail";
import { PhaseBanner } from "../components/PhaseBanner";
import { PhaseTrack } from "../components/PhaseTrack";
import { type SquareSeat, TownSquare } from "../components/TownSquare";
import { usePlayer } from "../context";
import {
  clockReachesAt,
  dayPartOf,
  executionNews,
  formatCountdown,
  morningNews,
  readyLabelOf,
} from "../day-parts";
import { clockChair, handOf, phaseTitle } from "../helpers";
import { useServerClockSync, useServerNow } from "../server-clock";
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

const name = (view: PlayerView, seat: number) => view.names[seat] ?? `Player ${seat}`;

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold uppercase tracking-eyebrow text-fg-muted">{children}</span>
  );
}

/** The middle of the square during a nomination: who, the count, and when the clock reaches you. */
function VoteCenter({ view }: { view: PlayerView }) {
  const now = useServerNow();
  const vote = view.day.vote;
  if (!vote) return null;
  const hands = vote.hands.filter(Boolean).length;
  const mine = handOf(view, view.you);
  const reaches = clockReachesAt(view, view.you);
  const part = dayPartOf(view);
  let yours: string;
  if (vote.nominee === view.you) yours = "You're on the block — make your case in the chat.";
  else if (!mine) yours = "You aren't voting on this one.";
  else if (mine.locked || vote.status === "done")
    yours = mine.up ? "Your hand was up. It counts." : "Your hand stayed down.";
  else if (reaches !== null)
    yours = `${mine.up ? "Your hand is up" : "Raise your hand to vote"} — the clock reaches you in ${formatCountdown(reaches - now)}.`;
  else yours = mine.up ? "Your hand is up." : "Raise your hand to vote.";
  return (
    <>
      <Eyebrow>
        {part === "defence"
          ? "Accusation and defence"
          : part === "counting"
            ? "Counting"
            : vote.kind === "exile"
              ? "Exile vote"
              : "The vote"}
      </Eyebrow>
      <span className="text-2xl font-black text-fg-strong">
        {name(view, vote.nominator)} → {name(view, vote.nominee)}
      </span>
      <span className="text-4xl font-black tabular-nums text-amber-200">✋ {hands}</span>
      <span
        className={cn(
          "text-sm",
          mine && !mine.locked && !mine.up && reaches !== null && reaches - now < 4000
            ? "font-semibold text-amber-200"
            : "text-fg-secondary",
        )}
      >
        {yours}
      </span>
    </>
  );
}

function Center() {
  const { view } = usePlayer();
  const part = dayPartOf(view);
  const vote = view.day.vote;
  switch (part) {
    case "defence":
    case "voting":
    case "counting":
      return <VoteCenter view={view} />;
    case "night":
      return (
        <>
          <span className="text-4xl">🌙</span>
          <span className="text-3xl font-black text-fg-strong">{phaseTitle(view)}</span>
          <span className="text-sm text-fg-secondary">
            {view.me.wake ? "You are awake." : "The town sleeps. Close your eyes."}
          </span>
        </>
      );
    case "discussion":
      return (
        <>
          <Eyebrow>{phaseTitle(view)}</Eyebrow>
          <span className="text-3xl font-black text-fg-strong">Discussion</span>
          <span className="text-sm text-fg-secondary">{morningNews(view)}</span>
          <span className="text-sm text-fg-muted">
            Talk in the town square. Nominations open when the timer runs out.
          </span>
        </>
      );
    case "nominations": {
      const nominated = view.day.nominators.includes(view.you);
      return (
        <>
          <Eyebrow>{phaseTitle(view)}</Eyebrow>
          <span className="text-3xl font-black text-fg-strong">Nominations</span>
          {vote?.result && (
            <span className="text-sm text-fg-secondary">
              Last: {vote.result.votes} on {name(view, vote.nominee)} ({vote.result.required}{" "}
              needed) — {vote.result.outcome}.
            </span>
          )}
          <span className="text-sm text-fg-muted">
            {nominated
              ? "You have nominated today."
              : "Nominate a living player, or let the timer run out."}
          </span>
        </>
      );
    }
    case "dusk":
      return (
        <>
          <span className="text-4xl">🌆</span>
          <span className="text-3xl font-black text-fg-strong">Dusk</span>
          <span className="text-sm text-fg-secondary">
            {executionNews(view) ?? "Nobody is executed today."}
          </span>
        </>
      );
    default:
      return (
        <>
          <span className="text-3xl font-black text-fg-strong">{phaseTitle(view)}</span>
          {view.phase.kind === "ended" && (
            <span className="text-sm text-fg-secondary">{view.phase.reason}</span>
          )}
          {view.stage === "setup" && (
            <span className="text-sm text-fg-secondary">
              The Storyteller is preparing the town.
            </span>
          )}
        </>
      );
  }
}

function ActionBar({ onNominate, onClaim }: { onNominate: () => void; onClaim: () => void }) {
  const { view, act, endActions } = usePlayer();
  const vote = view.day.vote;
  const me = view.town.find((t) => t.seat === view.you);
  const myHand = handOf(view, view.you);
  const part = dayPartOf(view);
  const canNominate =
    part === "nominations" && Boolean(me?.alive) && !view.day.nominators.includes(view.you);
  const readyLabel = readyLabelOf(part);
  const ready = (view.day.ready ?? []).includes(view.you);
  return (
    <GameActionBar
      end={
        view.stage === "play" &&
        view.phase.kind === "day" && (
          <Button size="sm" variant="ghost" onClick={onClaim}>
            Claim an ability…
          </Button>
        )
      }
    >
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
      {vote && myHand && !myHand.locked && vote.status !== "done" && (
        <Button
          size="md"
          variant="solid"
          tone={myHand.up ? "sky" : "amber"}
          onClick={() => act({ kind: "hand", up: !myHand.up })}
        >
          {myHand.up ? "Lower my hand" : "✋ Raise my hand"}
        </Button>
      )}
      {canNominate && (
        <Button size="sm" variant="solid" tone="rose" onClick={onNominate}>
          Nominate…
        </Button>
      )}
      {readyLabel && (
        <Button
          size="sm"
          variant={ready ? "tinted" : "secondary"}
          tone={ready ? "emerald" : undefined}
          aria-pressed={ready}
          title={
            ready
              ? "Waiting for the others — click to take it back"
              : "Tell the Storyteller you're done with this part of the day"
          }
          onClick={() => act({ kind: "ready", ready: !ready })}
        >
          {ready ? "✓ Ready" : readyLabel}
        </Button>
      )}
      {view.stage === "over" &&
        endActions.map((a) => (
          <Button key={a.label} size="sm" variant={a.variant} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
    </GameActionBar>
  );
}

/** A player's screen: the town square, who you are, and the town's talk. */
export function PlayerScreen() {
  const { view, error } = usePlayer();
  useServerClockSync(view);
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
      <PhaseTrack view={view} />
      <div className="relative flex min-h-0 flex-1">
        <TownSquare
          seats={seats}
          clockAt={clockChair(view)}
          center={<Center />}
          night={view.phase.kind === "night"}
        />
        <PhaseBanner view={view} />
      </div>
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
