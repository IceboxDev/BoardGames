import type {
  CompanionPlayer,
  CompanionState,
  Protection,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  abilityVoid,
  aliveCount,
  canBeNominated,
  canNominate,
  endDay,
  endGame,
  executeAboutToDie,
  executeScapegoatInstead,
  giveBeggarToken,
  isEvilPlayer,
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
  spareByPacifist,
  votesRequired,
  voudonActive,
  winPrompts,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  executionOutcome,
  mayorWin,
  slayerShot,
  virginNomination,
} from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import { recordVote, tallyVotes } from "@boardgames/core/games/blood-on-the-clocktower/voting";
import { useState } from "react";
import { Button } from "../../../components/ui";
import type { HistoryActions } from "./Companion";
import { CharacterIcon, Panel, SeatPicker } from "./common";
import { useHandOver } from "./privacy-context";
import type { UpdateState } from "./store";
import { Callout, Hint, Inset, useSeatPick } from "./ui";
import { VoteTally } from "./VoteTally";

/**
 * Day tracker: dawn recap, nomination + vote referee (threshold, about-to-die,
 * ties), Virgin and Slayer interceptions, execution, and end-of-day checks
 * (Saint loss, Mayor three-alive win). Every rule verdict comes from core's
 * `decisions.ts`; the panels only word them.
 */
export default function DayPanel({
  state,
  update,
  history,
}: {
  state: CompanionState;
  update: UpdateState;
  history?: HistoryActions;
}) {
  const required = votesRequired(state);
  const alive = aliveCount(state);
  const executed = state.day.executed;
  const tb = state.script === "trouble-brewing";
  const voudon = voudonActive(state);
  const bishop = state.players.find((p) => p.alive && !p.left && p.character === "bishop");
  // Panels that name a secret role stay off the screen while the phone is
  // in a player's hands.
  const handOver = useHandOver();

  return (
    <>
      <DawnRecap state={state} history={history} />
      {state.mastermindExtraDay && (
        <Callout tone="rose">
          MASTERMIND DAY (say nothing!): the Demon is secretly dead. If a GOOD player is executed
          today — even surviving it — evil wins. If an EVIL player is executed, or nobody is, good
          wins at dusk.
        </Callout>
      )}
      {minstrelActive(state) && !handOver && (
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
          <Hint tone="purple" className="mt-1">
            The BISHOP presides: only YOU (the Storyteller) may nominate — and you must nominate at
            least one player of the {isEvilPlayer(bishop) ? "GOOD" : "EVIL"} team today (the
            opposite of the Bishop's alignment).
          </Hint>
        )}
        {state.players
          .filter((p) => p.tripleVote || p.negativeVote)
          .map((p) => (
            <Hint key={p.seat} tone="purple" className="mt-1">
              {p.name}'s vote counts {p.tripleVote ? "as 3 votes" : "NEGATIVELY (−1)"} today — count
              it aloud accordingly.
            </Hint>
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

      {!handOver && <JudgePanel state={state} update={update} />}
      {!handOver && <GossipPanel state={state} update={update} />}
      <GunslingerPanel state={state} update={update} />
      <BeggarPanel state={state} update={update} />
      {tb && <SlayerPanel state={state} update={update} />}
      <EndDayPanel state={state} update={update} />
    </>
  );
}

/**
 * Last night's toll, straight from state — never reconstructed from the log.
 * "Back to the night" takes back every change since the last night step, so
 * a dawn announced one tap too early (or a mis-recorded kill) can be fixed
 * in the wizard instead of the Grimoire.
 */
function DawnRecap({ state, history }: { state: CompanionState; history?: HistoryActions }) {
  const last = state.lastNight;
  if (!last) return null;
  return (
    <Panel tone="gold">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-fg-primary">
          {last.died.length === 0
            ? "Dawn breaks — nobody died tonight."
            : `Dawn breaks — died tonight: ${last.died.map((s) => nameAt(state, s)).join(", ")}.`}
        </p>
        {history?.canBackToNight && (
          <Button variant="ghost" size="xs" className="shrink-0" onClick={history.backToNight}>
            ← Back to the night
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Never reveal how anyone died, or what character they were.
      </p>
    </Panel>
  );
}

/** A dead Moonchild must publicly curse an alive player, right now. */
function MoonchildPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const pending = state.moonchildPending;
  const pick = useSeatPick();
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
        <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
        <Button
          variant="danger"
          block
          disabled={pick.seat === undefined}
          onClick={() => {
            const target = pick.seat;
            if (target === undefined) return;
            update((s) => recordMoonchildChoice(s, target));
            pick.clear();
          }}
        >
          {pick.seat !== undefined
            ? `${nameAt(state, pick.seat)} is cursed`
            : "Record their choice"}
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
                update((s) => recordJudgeRuling(s, judge.seat, nominee, true));
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
  const pick = useSeatPick();
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
          selected={pick.selected}
          disabledSeats={[gunslinger.seat]}
          onToggle={pick.toggle}
        />
        <Button
          variant="danger"
          block
          disabled={pick.seat === undefined}
          onClick={() => {
            const target = pick.seat;
            if (target === undefined) return;
            update((s) => recordGunslingerShot(s, target));
            pick.clear();
          }}
        >
          {pick.seat !== undefined ? `${nameAt(state, pick.seat)} is shot` : "Pick who they shoot"}
        </Button>
      </div>
    </Panel>
  );
}

/** A dead player hands the Beggar their ghost-vote token. */
function BeggarPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const beggar = state.players.find((p) => p.alive && p.character === "beggar");
  const pick = useSeatPick();
  if (!beggar) return null;
  const donors = state.players.filter((p) => !p.left && !p.alive && p.ghostVote);
  if (donors.length === 0) return null;
  const donor = pick.seat !== undefined ? playerAt(state, pick.seat) : undefined;
  return (
    <Panel title="Beggar" tone="day">
      <p className="text-xs text-fg-muted">
        A dead player may give {beggar.name} their vote token — the Beggar then learns their
        alignment (whisper it to them). The donor can no longer vote.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <SeatPicker
          state={state}
          selected={pick.selected}
          disabledSeats={state.players.filter((p) => p.alive || !p.ghostVote).map((p) => p.seat)}
          deadSelectable
          onToggle={pick.toggle}
        />
        {donor && (
          <Hint tone="purple">
            Tell the Beggar: {donor.name} is {isEvilPlayer(donor) ? "EVIL" : "GOOD"}.
          </Hint>
        )}
        <Button
          variant="secondary"
          block
          disabled={pick.seat === undefined}
          onClick={() => {
            const seat = pick.seat;
            if (seat === undefined) return;
            update((s) => giveBeggarToken(s, seat));
            pick.clear();
          }}
        >
          Record the token hand-over
        </Button>
      </div>
    </Panel>
  );
}

/**
 * A confirmed pick, collapsed to one 44px row so the panel never stacks two
 * identical seat grids and the counter stays inside the viewport.
 */
function ChosenRow({
  label,
  player,
  onChange,
}: {
  label: string;
  player: CompanionPlayer;
  onChange: () => void;
}) {
  const handOver = useHandOver();
  return (
    <Inset className="flex min-h-11 items-center gap-2 py-0">
      <span className="w-20 shrink-0 text-3xs font-bold uppercase tracking-pill text-fg-muted">
        {label}
      </span>
      {!handOver && <CharacterIcon character={player.character} size="sm" decorative />}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">
        {player.name}
      </span>
      <Button variant="ghost" size="xs" onClick={onChange}>
        Change
      </Button>
    </Inset>
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
  // The raised hands (the assistant's tally) — or a hand-counted number when
  // the Storyteller switches to counting by themselves.
  const [voters, setVoters] = useState<number[]>([]);
  const [manual, setManual] = useState<number | undefined>();
  const required = votesRequired(state);
  const aboutToDie = state.day.aboutToDie;
  const tally = tallyVotes(state, voters).total;
  const votes = manual ?? tally;

  const virgin =
    nominator !== undefined && nominee !== undefined
      ? virginNomination(state, nominator, nominee)
      : undefined;

  function reset() {
    setNominator(undefined);
    setNominee(undefined);
    setVoters([]);
    setManual(undefined);
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
            player={playerAt(state, nominator)}
            onChange={() => {
              setNominator(undefined);
              setVoters([]);
              setManual(undefined);
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
              player={playerAt(state, nominee)}
              onChange={() => {
                setNominee(undefined);
                setVoters([]);
                setManual(undefined);
              }}
            />
          ))}

        {virgin && nominator !== undefined && nominee !== undefined && (
          <VirginIntercept
            state={state}
            update={update}
            nominator={nominator}
            virginSeat={nominee}
            outcome={virgin}
            onDone={reset}
          />
        )}

        {!virgin && nominator !== undefined && nominee !== undefined && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-fg-secondary">
                {manual === undefined
                  ? "Tap each raised hand, clockwise from the nominee."
                  : "Hand-counted total."}{" "}
                {required}+ needed.
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => (manual === undefined ? setManual(tally) : setManual(undefined))}
              >
                {manual === undefined ? "Count by hand" : "Tap hands instead"}
              </Button>
            </div>
            {manual === undefined ? (
              <VoteTally
                state={state}
                nominee={nominee}
                voters={voters}
                onToggle={(seat) =>
                  setVoters((prev) =>
                    prev.includes(seat) ? prev.filter((v) => v !== seat) : [...prev, seat],
                  )
                }
              />
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  aria-label="One vote fewer"
                  onClick={() => setManual(Math.max(0, manual - 1))}
                >
                  −
                </Button>
                <span
                  className={`w-16 text-center text-4xl font-bold tabular-nums ${
                    manual >= required ? "text-rose-300" : "text-fg-strong"
                  }`}
                >
                  {manual}
                </span>
                <Button
                  variant="secondary"
                  size="lg"
                  aria-label="One vote more"
                  onClick={() => setManual(manual + 1)}
                >
                  +
                </Button>
              </div>
            )}
            {manual === undefined && (
              <p
                className={`text-center text-4xl font-bold tabular-nums ${
                  tally >= required ? "text-rose-300" : "text-fg-strong"
                }`}
              >
                {tally}
              </p>
            )}
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                update((s) =>
                  manual === undefined
                    ? recordVote(s, nominator, nominee, voters)
                    : recordNomination(s, nominator, nominee, manual),
                );
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
  outcome,
  onDone,
}: {
  state: CompanionState;
  update: UpdateState;
  nominator: number;
  virginSeat: number;
  outcome: NonNullable<ReturnType<typeof virginNomination>>;
  onDone: () => void;
}) {
  const who = nameAt(state, nominator);
  const verdict =
    outcome.kind === "executes"
      ? `${who} really is a Townsfolk — they are executed immediately.`
      : outcome.kind === "spy-may-register"
        ? `${who} is the SPY — they MAY register as a Townsfolk. Your call: execute them, or nothing happens.`
        : outcome.reason === "nominator-not-townsfolk"
          ? `${who} is NOT a Townsfolk (the Drunk is an Outsider too) — nothing happens; proceed to the vote.`
          : "The Virgin's ability is void (drunk/poisoned) — nothing happens; proceed to the vote.";
  return (
    <Callout tone="amber">
      <p className="text-sm">
        First nomination of the Virgin! {verdict} Either way the ability is spent.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {outcome.kind !== "nothing" && (
          <Button
            variant="danger"
            block
            onClick={() => {
              update((s) => recordVirginTrigger(s, nominator, virginSeat, true));
              onDone();
            }}
          >
            Execute {who} now
          </Button>
        )}
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
    </Callout>
  );
}

/** How an execution that does not kill is announced (BMR shields only). */
const EXECUTION_HINT: Record<Protection, string> = {
  "devils-advocate": "The Devil's Advocate protects them — executed but LIVES.",
  "sober-sailor": "The sober Sailor cannot die — executed but LIVES.",
  "tea-lady": "The Tea Lady protects them — executed but LIVES.",
  fool: "The Fool's first death — executed but LIVES (ability spent).",
  innkeeper: "The Innkeeper protects them — executed but LIVES.",
  // Trouble Brewing's wards only stop the Demon; never an execution.
  monk: "",
  soldier: "",
};

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
  const name = nameAt(state, seat);
  const outcome = executionOutcome(state, seat);
  const hints: string[] = outcome.protections.map((p) => EXECUTION_HINT[p]).filter(Boolean);
  if (outcome.zombuulFakeDeath) {
    hints.push("The Zombuul will only APPEAR to die — announce a normal death.");
  }
  const scapegoat =
    outcome.scapegoatSeat !== undefined ? nameAt(state, outcome.scapegoatSeat) : undefined;
  const pacifist =
    outcome.pacifistSeat !== undefined ? nameAt(state, outcome.pacifistSeat) : undefined;

  return (
    <Callout tone="rose">
      <p className="text-3xs uppercase tracking-pill text-rose-300">About to die</p>
      <p className="text-sm font-normal text-fg-primary">
        <b>{name}</b> is about to die with {votes} votes. Call a last round of nominations first — a
        later nominee can still overtake.
      </p>
      {outcome.saintLoss && (
        <Hint tone="rose">
          They are the SAINT — executing them loses the game for good. (Their team, that is.)
        </Hint>
      )}
      {hints.map((h) => (
        <Hint key={h} tone="sky">
          {h}
        </Hint>
      ))}
      <Button variant="danger" size="lg" block onClick={() => update(executeAboutToDie)}>
        Execute {name}
      </Button>
      {pacifist && (
        <>
          <Button variant="warning" block onClick={() => update((s) => spareByPacifist(s, seat))}>
            Executed but LIVES ({pacifist} — Pacifist)
          </Button>
          <p className="font-normal text-fg-muted">
            A sober Pacifist is in play and {name} is good — you MAY spare them. Once per game is
            about right.
          </p>
        </>
      )}
      {scapegoat && (
        <>
          <Button
            variant="warning"
            block
            onClick={() => update((s) => executeScapegoatInstead(s, seat))}
          >
            Execute {scapegoat} (Scapegoat) instead
          </Button>
          <p className="font-normal text-fg-muted">
            {scapegoat} shares {name}'s alignment — you MAY execute the Scapegoat in their place. It
            still counts as today's execution; the Undertaker sees a Scapegoat.
          </p>
        </>
      )}
    </Callout>
  );
}

function SlayerPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const [open, setOpen] = useState(false);
  const shooter = useSeatPick();
  const target = useSeatPick();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Slayer shot…
      </Button>
    );
  }

  const outcome =
    shooter.seat !== undefined && target.seat !== undefined
      ? slayerShot(state, shooter.seat, target.seat)
      : undefined;
  const shooterName = shooter.seat !== undefined ? nameAt(state, shooter.seat) : "";
  const targetName = target.seat !== undefined ? nameAt(state, target.seat) : "";
  const verdict = outcome
    ? outcome.kind === "dies"
      ? `${shooterName} really is the Slayer and ${targetName} really is the Demon — they die.`
      : outcome.kind === "recluse-may-register"
        ? `${targetName} is the Recluse — you MAY let them register as the Demon and die.`
        : outcome.reason === "not-demon"
          ? `${targetName} is not the Demon — nothing happens. The Slayer's ability is spent.`
          : `${shooterName} is not a working Slayer (${
              outcome.reason === "spent"
                ? "spent"
                : outcome.reason === "slayer-void"
                  ? "drunk/poisoned"
                  : "bluff"
            }) — nothing happens.`
    : undefined;

  return (
    <Panel title="Slayer shot (public, once per game)" tone="day">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-fg-secondary">Who claims the shot?</p>
        <SeatPicker state={state} selected={shooter.selected} onToggle={shooter.toggle} />
        {shooter.seat !== undefined && (
          <>
            <p className="text-xs font-semibold text-fg-secondary">Target?</p>
            <SeatPicker
              state={state}
              selected={target.selected}
              disabledSeats={[shooter.seat]}
              onToggle={target.toggle}
            />
          </>
        )}
        {outcome && shooter.seat !== undefined && target.seat !== undefined && (
          <div className="flex flex-col gap-2">
            <Hint tone={outcome.kind === "dies" ? "rose" : "amber"}>{verdict}</Hint>
            <div className="flex flex-col gap-2 sm:flex-row">
              {outcome.kind !== "nothing" && (
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    const [s, t] = [shooter.seat, target.seat];
                    if (s === undefined || t === undefined) return;
                    update((st) => recordSlayerShot(st, s, t, true));
                    setOpen(false);
                  }}
                >
                  {targetName} dies
                </Button>
              )}
              <Button
                variant="secondary"
                block
                onClick={() => {
                  const [s, t] = [shooter.seat, target.seat];
                  if (s === undefined || t === undefined) return;
                  update((st) => recordSlayerShot(st, s, t, false));
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
        <Button className="mt-2" variant="primary" size="lg" block onClick={() => update(endDay)}>
          Day ends — good wins
        </Button>
      </Panel>
    );
  }
  const mayor = mayorWin(state);
  const mayorName = state.players.find((p) => p.alive && p.character === "mayor")?.name;

  return (
    <Panel tone="night" title="End the day">
      {mayor?.kind === "blocked-by-travellers" && (
        <Callout tone="amber" className="mb-2">
          {mayorName} is the sober Mayor, but {mayor.alive} players live — travellers count for the
          Mayor's three-alive win, so they must be exiled before the day ends for it to trigger.
        </Callout>
      )}
      {mayor?.kind === "available" && (
        <Callout tone="amber" className="mb-2">
          <p className="text-sm">
            Three players live, no execution, and {mayorName} is the sober Mayor — if the day ends
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
        </Callout>
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
