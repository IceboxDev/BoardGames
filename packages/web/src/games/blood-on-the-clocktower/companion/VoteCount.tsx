import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  nameAt,
  playerAt,
  voteResult,
  votesRequired,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  tallyVotes,
  type VoterStatus,
  voteOrder,
  voterStatus,
} from "@boardgames/core/games/blood-on-the-clocktower/voting";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { CharacterIcon } from "./common";
import { useHandOver } from "./privacy-context";
import { Hint } from "./ui";

/**
 * The hand count as the clock hand runs it at the table: one player at a
 * time, clockwise from the nominee's left, the nominee last. The phone names
 * who to look at; the Storyteller answers "up" or "down" on two halves of
 * the screen without looking for a name. Players who cannot vote are skipped
 * (and shown so in the strip); each hand counts by core's rules (ghost votes,
 * Beggar tokens, the Butler's master, ×3 / −1 marks, the Voudon). On a
 * keyboard: → up, ← down, Backspace back one hand.
 */
export function VoteCount({
  state,
  nominator,
  nominee,
  onRecord,
  onCancel,
}: {
  state: CompanionState;
  nominator: number;
  nominee: number;
  onRecord: (voters: number[]) => void;
  onCancel: () => void;
}) {
  const handOver = useHandOver();
  const order = voteOrder(state, nominee);
  const voters = order.filter((seat) => voterStatus(state, seat).kind !== "no-vote");
  const [answers, setAnswers] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [at, setAt] = useState(0);
  const done = at >= voters.length;
  const current = done ? undefined : voters[at];
  const raised = voters.filter((seat) => answers.get(seat) === true);
  const tally = tallyVotes(state, raised);
  const required = votesRequired(state);

  function answer(up: boolean) {
    if (current === undefined) return;
    setAnswers((prev) => new Map(prev).set(current, up));
    setAt((i) => i + 1);
  }
  const back = () => setAt((i) => Math.max(0, i - 1));

  // The strip follows the clock: the current voter stays in view.
  const stripRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!strip || !chip) return;
    strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
  });

  // A laptop at the table: arrows answer, Backspace steps back.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
      else if (e.key === "Backspace") back();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-bold text-fg-strong">
        {nameAt(state, nominator)} → {nameAt(state, nominee)}
      </p>
      <ol
        ref={stripRef}
        className="scrollbar-thin relative flex gap-1 overflow-x-auto pb-1"
        aria-label="Counting order"
      >
        {order.map((seat) => {
          const p = playerAt(state, seat);
          const skipped = !voters.includes(seat);
          const up = answers.get(seat);
          const mark = skipped ? "–" : up === true ? "✋" : up === false ? "·" : "";
          const word = skipped
            ? "no vote"
            : up === true
              ? "hand up"
              : up === false
                ? "hand down"
                : "";
          return (
            <li
              key={seat}
              aria-label={word ? `${p.name}: ${word}` : p.name}
              aria-current={seat === current ? "step" : undefined}
              className={cn(
                "flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-ui-md border border-line-soft bg-fill-soft px-0.5 py-1 text-3xs",
                skipped && "opacity-40",
                up === true && "border-amber-400/60 bg-amber-500/15",
                seat === current && "border-fg-strong ring-1 ring-fg-strong",
              )}
            >
              {!handOver && <CharacterIcon character={p.character} size="sm" decorative />}
              <span className="max-w-full truncate font-semibold text-fg-primary">{p.name}</span>
              <span aria-hidden className="h-3.5 text-xs leading-none text-amber-300">
                {mark}
              </span>
            </li>
          );
        })}
      </ol>

      {current !== undefined ? (
        <>
          <div
            className="flex min-h-48 flex-col items-center justify-center gap-1 text-center"
            aria-live="polite"
          >
            <span className="text-3xs font-bold uppercase tracking-eyebrow text-fg-muted">
              Hand {at + 1} of {voters.length}
            </span>
            {!handOver && (
              <CharacterIcon character={playerAt(state, current).character} size="xl" decorative />
            )}
            <span className="max-w-full text-5xl font-black leading-none break-words text-fg-strong">
              {nameAt(state, current)}
            </span>
            <span className="min-h-5 text-sm font-semibold text-amber-300">
              {current === nominee
                ? "The nominee, counted last"
                : voterCaption(state, voterStatus(state, current), raised, handOver)}
            </span>
            <span className="text-sm text-fg-muted">
              {voters[at + 1] !== undefined ? `then ${nameAt(state, voters[at + 1])}` : "last hand"}
            </span>
          </div>
          <Tally state={state} total={tally.total} required={required} nominee={nominee} />
          <div className="grid h-40 grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="lg"
              bleed
              className="rounded-ui-lg text-xl"
              onClick={() => answer(false)}
            >
              Hand down
            </Button>
            <Button
              variant="solid"
              tone="amber"
              size="lg"
              bleed
              className="rounded-ui-lg text-xl"
              onClick={() => answer(true)}
            >
              ✋ Hand up
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="xs" disabled={at === 0} onClick={back}>
              ← Back one hand
            </Button>
            <Button variant="ghost" size="xs" onClick={onCancel}>
              Cancel the count
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
            <span className="text-3xs font-bold uppercase tracking-eyebrow text-fg-muted">
              Count done
            </span>
            <span className="text-6xl font-black leading-none tabular-nums text-fg-strong">
              {tally.total}
            </span>
            {raised.length > 0 ? (
              <ul className="flex flex-wrap justify-center gap-1" aria-label="Raised hands">
                {raised.map((seat) => (
                  <li
                    key={seat}
                    className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-100"
                  >
                    {nameAt(state, seat)}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-fg-muted">No hands went up.</span>
            )}
          </div>
          <Tally state={state} total={tally.total} required={required} nominee={nominee} />
          {!handOver &&
            tally.hands
              .filter((h) => h.status.kind === "butler" && h.counted === 0)
              .map((h) => (
                <Hint key={h.seat}>
                  {nameAt(state, h.seat)} is the Butler — their hand doesn't count without{" "}
                  {h.status.kind === "butler" ? nameAt(state, h.status.master) : "their master"}.
                </Hint>
              ))}
          <Button variant="primary" size="lg" block onClick={() => onRecord(raised)}>
            Record {tally.total} vote{tally.total === 1 ? "" : "s"} on {nameAt(state, nominee)}
          </Button>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="xs" onClick={back}>
              ← Back one hand
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setAnswers(new Map());
                setAt(0);
              }}
            >
              Count again
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** The running total and what it would do, worded the way the table hears it. */
function Tally({
  state,
  total,
  required,
  nominee,
}: {
  state: CompanionState;
  total: number;
  required: number;
  nominee: number;
}) {
  const best = state.day.highestVotes;
  const result = voteResult(state, total);
  const meaning =
    result === "about-to-die"
      ? `${nameAt(state, nominee)} would be about to die`
      : result === "tied"
        ? `ties ${best}: nobody dies`
        : total < required
          ? `${required - total} short`
          : `doesn't beat ${best}`;
  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-3 text-sm text-fg-secondary">
      <span>
        <b
          className={cn(
            "text-2xl tabular-nums",
            result === "about-to-die" ? "text-rose-300" : "text-fg-strong",
          )}
        >
          {total}
        </b>{" "}
        of {required} needed{best > 0 && ` · beat ${best}`}
      </span>
      <span>{meaning}</span>
    </p>
  );
}

/** Why this hand counts differently. A player holding the phone learns only who is dead. */
function voterCaption(
  state: CompanionState,
  status: VoterStatus,
  raised: number[],
  handOver: boolean,
): string {
  if (status.kind === "ghost") return "Ghost vote: raising it spends it";
  if (handOver) return "";
  switch (status.kind) {
    case "alive":
      return status.weight === 3
        ? "Counts ×3 (Bureaucrat)"
        : status.weight === -1
          ? "Counts −1 (Thief)"
          : "";
    case "beggar":
      return `Beggar · ${status.tokens} token${status.tokens === 1 ? "" : "s"}`;
    case "butler":
      return raised.includes(status.master)
        ? "Butler · their master voted"
        : `Butler · counts only if ${nameAt(state, status.master)} voted`;
    case "no-vote":
      return "";
  }
}
