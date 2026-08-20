import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  abilityVoid,
  aliveCount,
  aliveResidents,
  canBeNominated,
  canNominate,
  endDay,
  endGame,
  executeAboutToDie,
  executeScapegoatInstead,
  giveBeggarToken,
  isEvilPlayer,
  mastermindVerdict,
  minstrelActive,
  nameAt,
  playerAt,
  recordGossipStatement,
  recordGunslingerShot,
  recordJudgeRuling,
  recordMoonchildChoice,
  recordNomination,
  recordSlayerShot,
  recordVirginTrigger,
  saintExecuted,
  survivedExecution,
  teaLadyProtectedSeats,
  votesRequired,
  voudonActive,
  winPrompts,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useState } from "react";
import { Button } from "../../../components/ui";
import type { UpdateState } from "./Companion";
import { Panel, SeatPicker } from "./common";

/**
 * Day tracker: dawn recap, nomination + vote referee (threshold, about-to-die,
 * ties), Virgin and Slayer interceptions, execution, and end-of-day checks
 * (Saint loss, Mayor three-alive win).
 */
export default function DayPanel({
  state,
  update,
}: {
  state: CompanionState;
  update: UpdateState;
}) {
  const required = votesRequired(state);
  const alive = aliveCount(state);
  const executed = state.day.executed;
  const tb = state.script === "trouble-brewing";
  const voudon = voudonActive(state);
  const bishop = state.players.find((p) => p.alive && !p.left && p.character === "bishop");

  return (
    <>
      <DawnRecap state={state} />
      {state.mastermindExtraDay && <MastermindBanner />}
      {minstrelActive(state) && (
        <Panel tone="gold">
          <p className="text-sm font-semibold text-fg-primary">
            The Minstrel plays on: EVERYONE except Travellers (and the Minstrel) is drunk until dusk
            tomorrow — every ability is void today and tonight.
          </p>
        </Panel>
      )}

      <Panel title={`Voting today — ${alive} alive`} tone="day">
        {voudon ? (
          <p className="text-sm text-fg-primary">
            The VOUDON holds court: only the Voudon and the DEAD may vote (no vote tokens spent,
            vote as often as they like — the living keep their hands down). No 50% floor: whoever
            has the most votes today is executed
            {state.day.highestVotes > 0 && (
              <>
                {" "}
                (current best <b>{state.day.highestVotes}</b>, must be beaten)
              </>
            )}
            .
          </p>
        ) : (
          <p className="text-sm text-fg-primary">
            Execution needs <b>{required}+ votes</b> (half of {alive}, rounded up)
            {state.day.highestVotes > 0 && (
              <>
                {" "}
                and must beat today's best of <b>{state.day.highestVotes}</b>
              </>
            )}
            . Dead players vote with their one ghost vote
            {tb && "; the Butler only votes if their master does"}.
          </p>
        )}
        {bishop && (
          <p className="mt-1 text-xs font-semibold text-purple-300">
            The BISHOP presides: only YOU (the Storyteller) may nominate — and you must nominate at
            least one player of the {isEvilPlayer(bishop) ? "GOOD" : "EVIL"} team today (the
            opposite of the Bishop's alignment).
          </p>
        )}
        {state.players
          .filter((p) => p.tripleVote || p.negativeVote)
          .map((p) => (
            <p key={p.seat} className="mt-1 text-xs font-semibold text-purple-300">
              {p.name}'s vote counts {p.tripleVote ? "as 3 votes" : "NEGATIVELY (−1)"} today — count
              it aloud accordingly.
            </p>
          ))}
      </Panel>

      <MoonchildPanel state={state} update={update} />

      {executed === undefined ? (
        <NominationComposer state={state} update={update} />
      ) : (
        <Panel tone="danger" title="Execution done">
          <p className="text-sm text-fg-primary">
            <b>{nameAt(state, executed)}</b> was executed today — only one execution per day, so the
            day is effectively over.
          </p>
        </Panel>
      )}

      <JudgePanel state={state} update={update} />
      <GossipPanel state={state} update={update} />
      <GunslingerPanel state={state} update={update} />
      <BeggarPanel state={state} update={update} />
      {tb && <SlayerPanel state={state} update={update} />}
      <EndDayPanel state={state} update={update} />
    </>
  );
}

function MastermindBanner() {
  return (
    <Panel tone="danger">
      <p className="text-sm font-semibold text-rose-200">
        MASTERMIND DAY (say nothing!): the Demon is secretly dead. If a GOOD player is executed
        today — even surviving it — evil wins. If an EVIL player is executed, or nobody is, good
        wins at dusk.
      </p>
    </Panel>
  );
}

/** A dead Moonchild must publicly curse an alive player, right now. */
function MoonchildPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const pending = state.moonchildPending;
  const [target, setTarget] = useState<number | undefined>();
  if (pending === undefined) return null;
  const moonchild = playerAt(state, pending);
  return (
    <Panel tone="danger" title="Moonchild has died">
      <p className="text-sm text-fg-primary">
        <b>{moonchild.name}</b> just learned they are dead — they must publicly choose one ALIVE
        player within a minute or two. If that player is good, they die tonight.
        {abilityVoid(state, moonchild) &&
          " (The Moonchild is drunk/poisoned — the curse will do nothing, but let them choose.)"}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
        <Button
          variant="danger"
          block
          disabled={target === undefined}
          onClick={() => {
            if (target === undefined) return;
            update((s) => recordMoonchildChoice(s, target));
            setTarget(undefined);
          }}
        >
          {target !== undefined ? `${nameAt(state, target)} is cursed` : "Record their choice"}
        </Button>
      </div>
    </Panel>
  );
}

/** The Gossip's daily public statement — true statements kill tonight. */
function GossipPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const gossip = state.players.find((p) => p.alive && p.character === "gossip");
  if (!gossip) return null;
  if (state.gossipTrue) {
    return (
      <Panel title="Gossip" tone="day">
        <p className="text-sm font-semibold text-amber-200">
          Statement recorded as TRUE — a player of your choice dies tonight (there'll be a night
          step for it).
        </p>
        <Button
          className="mt-2"
          variant="ghost"
          size="xs"
          onClick={() => update((s) => recordGossipStatement(s, false))}
        >
          Undo — it was false after all
        </Button>
      </Panel>
    );
  }
  return (
    <Panel title="Gossip" tone="day">
      <p className="text-xs text-fg-muted">
        {gossip.name} may make one public statement today. If it is TRUE, you kill a player of your
        choice tonight. Judge the statement as worded — vague statements don't count.
        {abilityVoid(state, gossip) &&
          " They are drunk/poisoned right now: if still impaired tonight, no one dies."}
      </p>
      <Button
        className="mt-2"
        variant="secondary"
        size="sm"
        onClick={() => update((s) => recordGossipStatement(s, true))}
      >
        Their statement today was TRUE
      </Button>
    </Panel>
  );
}

/** The Judge may force one nomination's execution to pass or fail. */
function JudgePanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const judge = state.players.find(
    (p) => p.alive && !p.left && p.character === "judge" && !p.usedAbility,
  );
  const [open, setOpen] = useState(false);
  if (!judge || state.day.executed !== undefined) return null;
  const lastNomination = state.day.nominations.at(-1);
  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Judge's ruling…
      </Button>
    );
  }
  if (!lastNomination) {
    return (
      <Panel title="Judge" tone="day">
        <p className="text-sm text-fg-muted">
          No nomination yet today — the Judge can only rule on a current nomination (and never on
          their own).
        </p>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Close
        </Button>
      </Panel>
    );
  }
  const nominee = lastNomination.nominee;
  const ownNomination = lastNomination.nominator === judge.seat;
  return (
    <Panel title="Judge (once per game)" tone="day">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          Current nomination: <b>{nameAt(state, nominee)}</b> (by{" "}
          {nameAt(state, lastNomination.nominator)}, {lastNomination.votes} votes).{" "}
          {ownNomination
            ? "The Judge nominated this themselves — they may NOT rule on it."
            : "The Judge may force this execution to pass or fail, regardless of votes."}
        </p>
        {!ownNomination && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="danger"
              block
              onClick={() => {
                update((s) => {
                  let next = recordJudgeRuling(s, judge.seat, nominee, true);
                  if (s.mastermindExtraDay && next.phase.kind !== "ended") {
                    const winner = mastermindVerdict(s, nominee);
                    next = endGame(
                      next,
                      winner,
                      winner === "good"
                        ? "an evil player was executed on the Mastermind's final day"
                        : "a good player was executed on the Mastermind's final day",
                    );
                  }
                  return next;
                });
                setOpen(false);
              }}
            >
              Execution SUCCEEDS
            </Button>
            <Button
              variant="secondary"
              block
              onClick={() => {
                update((s) => recordJudgeRuling(s, judge.seat, nominee, false));
                setOpen(false);
              }}
            >
              Execution fails
            </Button>
          </div>
        )}
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

/** The Gunslinger may kill one voter per day, after the first vote is tallied. */
function GunslingerPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const gunslinger = state.players.find((p) => p.alive && p.character === "gunslinger");
  const [target, setTarget] = useState<number | undefined>();
  if (!gunslinger) return null;
  if (state.day.gunslingerUsed) {
    return (
      <Panel title="Gunslinger" tone="day">
        <p className="text-sm text-fg-muted">The Gunslinger has already fired today.</p>
      </Panel>
    );
  }
  const noVoteYet = state.day.nominations.length === 0;
  return (
    <Panel title="Gunslinger" tone="day">
      <p className="text-xs text-fg-muted">
        After the FIRST vote of the day is tallied, {gunslinger.name} may publicly choose a player
        that voted — they die. Not an execution: the day continues and the Undertaker learns
        nothing.
        {noVoteYet && " No vote has been tallied yet."}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          disabledSeats={[gunslinger.seat]}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
        <Button
          variant="danger"
          block
          disabled={target === undefined}
          onClick={() => {
            if (target === undefined) return;
            update((s) => recordGunslingerShot(s, target));
            setTarget(undefined);
          }}
        >
          {target !== undefined ? `${nameAt(state, target)} is shot` : "Pick who they shoot"}
        </Button>
      </div>
    </Panel>
  );
}

/** A dead player hands the Beggar their ghost-vote token. */
function BeggarPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const beggar = state.players.find((p) => p.alive && p.character === "beggar");
  const [donor, setDonor] = useState<number | undefined>();
  if (!beggar) return null;
  const donors = state.players.filter((p) => !p.left && !p.alive && p.ghostVote);
  if (donors.length === 0) return null;
  const donorPlayer = donor !== undefined ? playerAt(state, donor) : undefined;
  return (
    <Panel title="Beggar" tone="day">
      <p className="text-xs text-fg-muted">
        A dead player may give {beggar.name} their vote token — the Beggar then learns their
        alignment (whisper it to them). The donor can no longer vote.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <SeatPicker
          state={state}
          selected={donor !== undefined ? [donor] : []}
          disabledSeats={state.players.filter((p) => p.alive || !p.ghostVote).map((p) => p.seat)}
          deadSelectable
          onToggle={(seat) => setDonor(seat === donor ? undefined : seat)}
        />
        {donorPlayer && (
          <p className="text-xs font-semibold text-purple-300">
            Tell the Beggar: {donorPlayer.name} is {isEvilPlayer(donorPlayer) ? "EVIL" : "GOOD"}.
          </p>
        )}
        <Button
          variant="secondary"
          block
          disabled={donor === undefined}
          onClick={() => {
            if (donor === undefined) return;
            update((s) => giveBeggarToken(s, donor));
            setDonor(undefined);
          }}
        >
          Record the token hand-over
        </Button>
      </div>
    </Panel>
  );
}

function DawnRecap({ state }: { state: CompanionState }) {
  const lastDawn = [...state.log].reverse().find((e) => e.text.startsWith("Dawn breaks"));
  if (!lastDawn) return null;
  return (
    <Panel tone="gold">
      <p className="text-sm font-semibold text-fg-primary">{lastDawn.text}</p>
      <p className="mt-1 text-xs text-fg-muted">
        Never reveal how anyone died, or what character they were.
      </p>
    </Panel>
  );
}

/**
 * A confirmed pick, collapsed to one 44px row so the panel never stacks two
 * identical seat grids and the counter stays inside the viewport.
 */
function ChosenRow({
  label,
  name,
  onChange,
}: {
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-surface-950/60 px-2">
      <span className="w-20 shrink-0 text-3xs font-bold uppercase tracking-pill text-fg-muted">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">{name}</span>
      <Button variant="ghost" size="xs" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

/**
 * One stable panel for the whole nomination ritual. Each pick collapses to a
 * ChosenRow, so exactly one seat grid is ever visible and the vote counter
 * renders in the freed space — on a 390×844 phone the full flow (pick, pick,
 * tally, record) fits without scrolling. The about-to-die resolution renders
 * INSIDE this panel too: content swaps, position doesn't.
 */
function NominationComposer({ state, update }: { state: CompanionState; update: UpdateState }) {
  const [nominator, setNominator] = useState<number | undefined>();
  const [nominee, setNominee] = useState<number | undefined>();
  const [votes, setVotes] = useState(0);
  const required = votesRequired(state);
  const aboutToDie = state.day.aboutToDie;

  const nomineePlayer = nominee !== undefined ? playerAt(state, nominee) : undefined;
  const virginCase =
    nomineePlayer !== undefined &&
    nominator !== undefined &&
    (nomineePlayer.believedCharacter ?? nomineePlayer.character) === "virgin" &&
    nomineePlayer.alive &&
    !nomineePlayer.usedAbility;

  function reset() {
    setNominator(undefined);
    setNominee(undefined);
    setVotes(0);
  }

  const nominatorDisabled = state.players
    .filter((p) => !canNominate(state, p.seat))
    .map((p) => p.seat);
  const nomineeDisabled = state.players
    .filter((p) => !canBeNominated(state, p.seat) || p.seat === nominator)
    .map((p) => p.seat);

  return (
    <Panel title="Nomination" tone="day">
      <div className="flex flex-col gap-3">
        {aboutToDie && (
          <ExecuteBlock
            state={state}
            update={update}
            seat={aboutToDie.seat}
            votes={aboutToDie.votes}
          />
        )}

        {nominator === undefined ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-secondary">
              Nominator (alive, one nomination each)
            </p>
            <SeatPicker
              state={state}
              selected={[]}
              disabledSeats={nominatorDisabled}
              onToggle={(seat) => {
                setNominator(seat);
                // A player can't nominate themself — a stale nominee pick
                // that matches the new nominator is cleared.
                if (seat === nominee) setNominee(undefined);
              }}
            />
          </div>
        ) : (
          <ChosenRow
            label="Nominator"
            name={nameAt(state, nominator)}
            onChange={() => {
              setNominator(undefined);
              setVotes(0);
            }}
          />
        )}

        {nominator !== undefined &&
          (nominee === undefined ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-fg-secondary">
                Nominee (each player nominated once per day — the dead may be nominated)
              </p>
              <SeatPicker
                state={state}
                selected={[]}
                disabledSeats={nomineeDisabled}
                deadSelectable
                onToggle={(seat) => setNominee(seat)}
              />
            </div>
          ) : (
            <ChosenRow
              label="Nominee"
              name={nameAt(state, nominee)}
              onChange={() => {
                setNominee(undefined);
                setVotes(0);
              }}
            />
          ))}

        {virginCase && nominator !== undefined && nominee !== undefined && (
          <VirginIntercept
            state={state}
            update={update}
            nominator={nominator}
            virginSeat={nominee}
            onDone={reset}
          />
        )}

        {!virginCase && nominator !== undefined && nominee !== undefined && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-fg-secondary">
              Count hands (clockwise from the nominee). {required}+ needed.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setVotes(Math.max(0, votes - 1))}
              >
                −
              </Button>
              <span
                className={`w-16 text-center text-4xl font-bold tabular-nums ${
                  votes >= required ? "text-rose-300" : "text-white"
                }`}
              >
                {votes}
              </span>
              <Button variant="secondary" size="lg" onClick={() => setVotes(votes + 1)}>
                +
              </Button>
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                update((s) => recordNomination(s, nominator, nominee, votes));
                reset();
              }}
            >
              Record {votes} vote{votes === 1 ? "" : "s"} on {nameAt(state, nominee)}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function VirginIntercept({
  state,
  update,
  nominator,
  virginSeat,
  onDone,
}: {
  state: CompanionState;
  update: UpdateState;
  nominator: number;
  virginSeat: number;
  onDone: () => void;
}) {
  const virgin = playerAt(state, virginSeat);
  const nominatorPlayer = playerAt(state, nominator);
  // The trigger needs a REAL sober Virgin and a REAL Townsfolk nominator —
  // except the Spy, who MAY register as a Townsfolk (Storyteller's choice).
  const virginReal = virgin.character === "virgin" && !virgin.poisoned;
  const nominatorTownsfolk = CHARACTERS[nominatorPlayer.character].type === "townsfolk";
  const nominatorSpy = nominatorPlayer.character === "spy";
  const shouldTrigger = virginReal && nominatorTownsfolk;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2">
      <p className="text-sm font-semibold text-amber-200">
        First nomination of the Virgin!{" "}
        {shouldTrigger
          ? `${nominatorPlayer.name} really is a Townsfolk — they are executed immediately.`
          : virginReal && nominatorSpy
            ? `${nominatorPlayer.name} is the SPY — they MAY register as a Townsfolk. Your call: execute them, or nothing happens.`
            : virginReal
              ? `${nominatorPlayer.name} is NOT a Townsfolk (the Drunk is an Outsider too) — nothing happens; proceed to the vote.`
              : "The Virgin's ability is void (drunk/poisoned) — nothing happens; proceed to the vote."}{" "}
        Either way the ability is spent.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="danger"
          block
          onClick={() => {
            update((s) => recordVirginTrigger(s, nominator, virginSeat, true));
            onDone();
          }}
        >
          Execute {nominatorPlayer.name} now
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => {
            // Only spends the ability — the composer then shows the normal
            // vote counter for this same nomination.
            update((s) => recordVirginTrigger(s, nominator, virginSeat, false));
          }}
        >
          No trigger — vote normally
        </Button>
      </div>
    </div>
  );
}

/**
 * The about-to-die resolution. Renders as a danger inset INSIDE the
 * Nomination panel (not a separate panel below it), so the Execute action
 * appears where the Record button just was — content swaps, position holds —
 * while further overtaking nominations stay available beneath it.
 */
function ExecuteBlock({
  state,
  update,
  seat,
  votes,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
  votes: number;
}) {
  const bmr = state.script === "bad-moon-rising";
  const saintLoss = !bmr && saintExecuted(state, seat);
  const nominee = playerAt(state, seat);
  // Scapegoat redirect: an alive Scapegoat of the nominee's alignment may be
  // executed instead — the Storyteller's call.
  const scapegoat = state.players.find(
    (p) =>
      p.alive && p.character === "scapegoat" && (p.alignment === "evil") === isEvilPlayer(nominee),
  );

  // BMR: reasons the execution will succeed but not kill (the engine enforces
  // these on its own — the hints tell the Storyteller what to announce).
  const hints: string[] = [];
  if (bmr) {
    const sober = !abilityVoid(state, nominee);
    if (nominee.survivesExecution) {
      hints.push("The Devil's Advocate protects them — executed but LIVES.");
    }
    if (nominee.character === "sailor" && sober) {
      hints.push("The sober Sailor cannot die — executed but LIVES.");
    }
    if (teaLadyProtectedSeats(state).includes(seat)) {
      hints.push("The Tea Lady protects them — executed but LIVES.");
    }
    if (nominee.character === "fool" && !nominee.usedAbility && sober) {
      hints.push("The Fool's first death — executed but LIVES (ability spent).");
    }
    if (nominee.character === "zombuul" && !nominee.registersDead && sober) {
      hints.push("The Zombuul will only APPEAR to die — announce a normal death.");
    }
  }
  const pacifist = bmr
    ? state.players.find((p) => p.alive && p.character === "pacifist" && !abilityVoid(state, p))
    : undefined;
  const pacifistOption = pacifist !== undefined && !isEvilPlayer(nominee) && hints.length === 0;

  // On the Mastermind's final day the executed player's TEAM decides the game
  // — whether or not they survive the execution itself.
  const settleMastermind = (s: CompanionState, next: CompanionState): CompanionState => {
    if (!s.mastermindExtraDay || next.phase.kind === "ended") return next;
    const winner = mastermindVerdict(s, seat);
    return endGame(
      next,
      winner,
      winner === "good"
        ? "an evil player was executed on the Mastermind's final day"
        : "a good player was executed on the Mastermind's final day",
    );
  };

  return (
    <div className="rounded-lg border border-rose-400/35 bg-rose-950/40 p-2">
      <p className="text-3xs font-bold uppercase tracking-pill text-rose-300">About to die</p>
      <p className="mt-1 text-sm text-fg-primary">
        <b>{nameAt(state, seat)}</b> is about to die with {votes} votes. Call a last round of
        nominations first — a later nominee can still overtake.
      </p>
      {saintLoss && (
        <p className="mt-1 text-xs font-bold text-rose-300">
          They are the SAINT — executing them loses the game for good. (Their team, that is.)
        </p>
      )}
      {hints.map((h) => (
        <p key={h} className="mt-1 text-xs font-semibold text-sky-300">
          {h}
        </p>
      ))}
      <Button
        className="mt-2"
        variant="danger"
        size="lg"
        block
        onClick={() =>
          update((s) => {
            let next = executeAboutToDie(s);
            if (saintLoss) next = endGame(next, "evil", "the Saint was executed");
            return settleMastermind(s, next);
          })
        }
      >
        Execute {nameAt(state, seat)}
      </Button>
      {pacifistOption && (
        <>
          <Button
            className="mt-2"
            variant="warning"
            block
            onClick={() =>
              update((s) =>
                settleMastermind(s, survivedExecution(s, seat, "the Pacifist spares them")),
              )
            }
          >
            Executed but LIVES ({pacifist?.name} — Pacifist)
          </Button>
          <p className="mt-1 text-xs text-fg-muted">
            A sober Pacifist is in play and {nameAt(state, seat)} is good — you MAY spare them. Once
            per game is about right.
          </p>
        </>
      )}
      {scapegoat && (
        <>
          <Button
            className="mt-2"
            variant="warning"
            block
            onClick={() => update((s) => executeScapegoatInstead(s, seat))}
          >
            Execute {scapegoat.name} (Scapegoat) instead
          </Button>
          <p className="mt-1 text-xs text-fg-muted">
            {scapegoat.name} shares {nameAt(state, seat)}'s alignment — you MAY execute the
            Scapegoat in their place. It still counts as today's execution; the Undertaker sees a
            Scapegoat.
          </p>
        </>
      )}
    </div>
  );
}

function SlayerPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const [open, setOpen] = useState(false);
  const [shooter, setShooter] = useState<number | undefined>();
  const [target, setTarget] = useState<number | undefined>();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Slayer shot…
      </Button>
    );
  }

  const shooterPlayer = shooter !== undefined ? playerAt(state, shooter) : undefined;
  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const realShot =
    shooterPlayer !== undefined &&
    shooterPlayer.character === "slayer" &&
    !shooterPlayer.poisoned &&
    !shooterPlayer.usedAbility;
  const targetIsDemon =
    targetPlayer !== undefined && CHARACTERS[targetPlayer.character].type === "demon";
  const targetIsRecluse = targetPlayer?.character === "recluse";
  const wouldDie = realShot && targetIsDemon;

  return (
    <Panel title="Slayer shot (public, once per game)" tone="day">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-fg-secondary">Who claims the shot?</p>
        <SeatPicker
          state={state}
          selected={shooter !== undefined ? [shooter] : []}
          onToggle={(seat) => setShooter(seat === shooter ? undefined : seat)}
        />
        {shooter !== undefined && (
          <>
            <p className="text-xs font-semibold text-fg-secondary">Target?</p>
            <SeatPicker
              state={state}
              selected={target !== undefined ? [target] : []}
              disabledSeats={[shooter]}
              onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
            />
          </>
        )}
        {shooterPlayer && targetPlayer && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-fg-primary">
              {wouldDie
                ? `${shooterPlayer.name} really is the Slayer and ${targetPlayer.name} really is the Demon — they die.`
                : realShot && targetIsRecluse
                  ? `${targetPlayer.name} is the Recluse — you MAY let them register as the Demon and die.`
                  : realShot
                    ? `${targetPlayer.name} is not the Demon — nothing happens. The Slayer's ability is spent.`
                    : `${shooterPlayer.name} is not a working Slayer (bluff, drunk, poisoned or spent) — nothing happens.`}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="danger"
                block
                onClick={() => {
                  update((s) => recordSlayerShot(s, shooterPlayer.seat, targetPlayer.seat, true));
                  setOpen(false);
                }}
              >
                {targetPlayer.name} dies
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => {
                  update((s) => recordSlayerShot(s, shooterPlayer.seat, targetPlayer.seat, false));
                  setOpen(false);
                }}
              >
                Nothing happens
              </Button>
            </div>
          </div>
        )}
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

function EndDayPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const noExecution = state.day.executed === undefined;
  const promptsPending = winPrompts(state).length > 0;
  if (state.mastermindExtraDay && noExecution) {
    return (
      <Panel tone="night" title="End the day">
        <p className="text-sm font-semibold text-amber-200">
          Mastermind's final day with NO execution — when the day ends, <b>good wins</b> (the Demon
          is already dead).
        </p>
        <Button
          className="mt-2"
          variant="primary"
          size="lg"
          block
          onClick={() =>
            update((s) => endGame(s, "good", "no one was executed on the Mastermind's final day"))
          }
        >
          Day ends — good wins
        </Button>
      </Panel>
    );
  }
  const mayor = state.players.find((p) => p.alive && p.character === "mayor" && !p.poisoned);
  // "Only 3 players live" — travellers DO count as players for the Mayor's
  // win, so they must be exiled before the day ends for the three to line up.
  const alive = aliveCount(state);
  const mayorWin = noExecution && alive === 3 && mayor !== undefined;
  const mayorBlockedByTravellers =
    noExecution && mayor !== undefined && alive > 3 && aliveResidents(state) <= 3;

  return (
    <Panel tone="night" title="End the day">
      {mayorBlockedByTravellers && (
        <p className="mb-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2 text-xs font-semibold text-amber-200">
          {mayor?.name} is the sober Mayor, but {alive} players live — travellers count for the
          Mayor's three-alive win, so they must be exiled before the day ends for it to trigger.
        </p>
      )}
      {mayorWin && (
        <div className="mb-2 flex flex-col gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2">
          <p className="text-sm font-semibold text-amber-200">
            Three players live, no execution, and {mayor.name} is the sober Mayor — if the day ends
            now, <b>good wins</b>.
          </p>
          <Button
            variant="primary"
            block
            onClick={() =>
              update((s) => endGame(s, "good", "three alive, no execution — the Mayor's team wins"))
            }
          >
            Declare good victory (Mayor)
          </Button>
        </div>
      )}
      <p className="text-xs text-fg-muted">
        Take thirty seconds to think about the coming night, then send everyone to sleep.
      </p>
      {/* While a victory prompt is pending, exactly one button on this screen
          may be loud — the declaration. Ending the day stays possible (the
          Storyteller always has the final call) but steps back to secondary. */}
      {promptsPending ? (
        <>
          <Button
            className="mt-2"
            variant="secondary"
            size="lg"
            block
            onClick={() => update(endDay)}
          >
            {noExecution ? "End day without execution — night falls" : "Night falls"}
          </Button>
          <p className="mt-1 text-center text-xs text-fg-muted">
            A victory prompt is waiting above — declare it, or continue at your own call.
          </p>
        </>
      ) : (
        <Button className="mt-2" variant="primary" size="lg" block onClick={() => update(endDay)}>
          {noExecution ? "End day without execution — night falls" : "Night falls"}
        </Button>
      )}
    </Panel>
  );
}
