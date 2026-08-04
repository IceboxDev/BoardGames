import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  aliveCount,
  canBeNominated,
  canNominate,
  endDay,
  endGame,
  executeAboutToDie,
  nameAt,
  playerAt,
  recordNomination,
  recordSlayerShot,
  recordVirginTrigger,
  saintExecuted,
  votesRequired,
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
  const aboutToDie = state.day.aboutToDie;

  return (
    <>
      <DawnRecap state={state} />

      <Panel title={`Voting today — ${alive} alive`} tone="day">
        <p className="text-sm text-fg-primary">
          Execution needs <b>{required}+ votes</b> (half of {alive}, rounded up)
          {state.day.highestVotes > 0 && (
            <>
              {" "}
              and must beat today's best of <b>{state.day.highestVotes}</b>
            </>
          )}
          . Dead players vote with their one ghost vote; the Butler only votes if their master does.
        </p>
      </Panel>

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

      {aboutToDie && executed === undefined && (
        <ExecutePanel
          state={state}
          update={update}
          seat={aboutToDie.seat}
          votes={aboutToDie.votes}
        />
      )}

      <SlayerPanel state={state} update={update} />
      <EndDayPanel state={state} update={update} />
    </>
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

function NominationComposer({ state, update }: { state: CompanionState; update: UpdateState }) {
  const [nominator, setNominator] = useState<number | undefined>();
  const [nominee, setNominee] = useState<number | undefined>();
  const [votes, setVotes] = useState(0);
  const required = votesRequired(state);

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
        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-secondary">
            Nominator (alive, one nomination each)
          </p>
          <SeatPicker
            state={state}
            selected={nominator !== undefined ? [nominator] : []}
            disabledSeats={nominatorDisabled}
            onToggle={(seat) => setNominator(seat === nominator ? undefined : seat)}
          />
        </div>
        {nominator !== undefined && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-secondary">
              Nominee (each player nominated once per day — the dead may be nominated)
            </p>
            <SeatPicker
              state={state}
              selected={nominee !== undefined ? [nominee] : []}
              disabledSeats={nomineeDisabled}
              deadSelectable
              onToggle={(seat) => setNominee(seat === nominee ? undefined : seat)}
            />
          </div>
        )}

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
  // The trigger needs a REAL sober Virgin and a REAL Townsfolk nominator.
  const virginReal = virgin.character === "virgin" && !virgin.poisoned;
  const nominatorTownsfolk = CHARACTERS[nominatorPlayer.character].type === "townsfolk";
  const shouldTrigger = virginReal && nominatorTownsfolk;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2">
      <p className="text-sm font-semibold text-amber-200">
        First nomination of the Virgin!{" "}
        {shouldTrigger
          ? `${nominatorPlayer.name} really is a Townsfolk — they are executed immediately.`
          : virginReal
            ? `${nominatorPlayer.name} is NOT a Townsfolk — nothing happens; proceed to the vote.`
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

function ExecutePanel({
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
  const saintLoss = saintExecuted(state, seat);
  return (
    <Panel tone="danger" title="About to die">
      <p className="text-sm text-fg-primary">
        <b>{nameAt(state, seat)}</b> is about to die with {votes} votes. Call a last round of
        nominations first — a later nominee can still overtake.
      </p>
      {saintLoss && (
        <p className="mt-1 text-xs font-bold text-rose-300">
          They are the SAINT — executing them loses the game for good. (Their team, that is.)
        </p>
      )}
      <Button
        className="mt-2"
        variant="danger"
        size="lg"
        block
        onClick={() =>
          update((s) => {
            let next = executeAboutToDie(s);
            if (saintLoss) next = endGame(next, "evil", "the Saint was executed");
            return next;
          })
        }
      >
        Execute {nameAt(state, seat)}
      </Button>
    </Panel>
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
  const mayor = state.players.find((p) => p.alive && p.character === "mayor" && !p.poisoned);
  const mayorWin = noExecution && aliveCount(state) === 3 && mayor !== undefined;

  return (
    <Panel tone="night" title="End the day">
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
      <Button className="mt-2" variant="primary" size="lg" block onClick={() => update(endDay)}>
        {noExecution ? "End day without execution — night falls" : "Night falls"}
      </Button>
    </Panel>
  );
}
