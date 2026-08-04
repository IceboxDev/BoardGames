import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionState,
  NightStep,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  changeCharacter,
  chefNumber,
  dawn,
  empathNumber,
  firstNightPairSuggestion,
  fortuneTellerPing,
  nightQueue,
  playerAt,
  recordDemonKill,
  setButlerMaster,
  setMonkProtection,
  setNegativeVote,
  setNightStep,
  setPoison,
  setTripleVote,
  undertakerInfo,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useState } from "react";
import { Button } from "../../../components/ui";
import type { UpdateState } from "./Companion";
import { CharacterIcon, CharacterTag, Panel, SeatPicker } from "./common";

/**
 * Step-by-step night runner following the boxed night sheet. Each step tells
 * the Storyteller exactly what to do, computes the TRUE information to give,
 * records choices (poison, protection, kills) into the Grimoire, and flags
 * drunk/poisoned wakers whose ability is void.
 */
export default function NightPanel({
  state,
  update,
}: {
  state: CompanionState;
  update: UpdateState;
}) {
  const queue = nightQueue(state);
  const idx = Math.min(state.nightStep, queue.length - 1);
  const step = queue[idx];
  const night = state.phase.kind === "night" ? state.phase.night : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={idx === 0}
          onClick={() => update((s) => setNightStep(s, idx - 1))}
        >
          ← Back
        </Button>
        <span className="text-xs font-bold uppercase tracking-pill text-fg-secondary">
          Step {idx + 1} / {queue.length}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={idx >= queue.length - 1}
          onClick={() => update((s) => setNightStep(s, idx + 1))}
        >
          Next →
        </Button>
      </div>
      <StepBody
        key={`${night}-${idx}-${stepKey(step)}`}
        state={state}
        update={update}
        step={step}
      />
    </>
  );
}

function stepKey(step: NightStep): string {
  switch (step.kind) {
    case "wake":
      return `${step.character}-${step.seat}`;
    case "you-are-imp":
      return `imp-${step.seat}`;
    default:
      return step.kind;
  }
}

function VoidWarning({ step }: { step: Extract<NightStep, { kind: "wake" }> }) {
  if (!step.isDrunk && !step.poisoned) return null;
  return (
    <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-2 text-xs font-semibold text-amber-200">
      {step.isDrunk ? "This player is secretly the Drunk" : "This player is poisoned"} — their
      ability is VOID. Act the scene out normally, but give false info and record no real effect.
    </p>
  );
}

function WakeHeader({
  state,
  step,
}: {
  state: CompanionState;
  step: Extract<NightStep, { kind: "wake" }>;
}) {
  const p = playerAt(state, step.seat);
  const c = CHARACTERS[step.character];
  return (
    <div className="flex items-start gap-3">
      <CharacterIcon character={step.character} size="lg" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-fg-secondary">
          Wake <b className="text-white">{p.name}</b> — <CharacterTag character={step.character} />
          {step.isDrunk && <span className="text-amber-300"> (really the Drunk)</span>}
        </p>
        {(night(c, state) ?? c.ability) && (
          <p className="text-xs leading-relaxed text-fg-muted">{night(c, state) ?? c.ability}</p>
        )}
      </div>
    </div>
  );
}

function night(c: (typeof CHARACTERS)[CharacterId], state: CompanionState): string | undefined {
  const firstNight = state.phase.kind === "night" && state.phase.night === 1;
  return firstNight ? c.firstNightAction : c.otherNightsAction;
}

function StepBody({
  state,
  update,
  step,
}: {
  state: CompanionState;
  update: UpdateState;
  step: NightStep;
}) {
  switch (step.kind) {
    case "minion-info":
      return <MinionInfo state={state} />;
    case "demon-info":
      return <DemonInfo state={state} />;
    case "you-are-imp":
      return (
        <Panel tone="danger" title="New Demon">
          <div className="flex items-center gap-3">
            <CharacterIcon character="imp" size="lg" />
            <p className="text-sm text-fg-primary">
              Wake <b>{playerAt(state, step.seat).name}</b>. Show the YOU ARE info and the{" "}
              <CharacterTag character="imp" /> token, then put them back to sleep.
            </p>
          </div>
        </Panel>
      );
    case "dawn":
      return <Dawn state={state} update={update} />;
    case "wake":
      return <WakeStep state={state} update={update} step={step} />;
  }
}

function MinionInfo({ state }: { state: CompanionState }) {
  const minions = state.players.filter((p) => CHARACTERS[p.character].type === "minion");
  const demon = state.players.find((p) => CHARACTERS[p.character].type === "demon");
  return (
    <Panel tone="night" title="Minion info (7+ players)">
      <p className="text-sm text-fg-primary">
        Wake all Minions together. Let them see each other, then show the THIS IS THE DEMON info and
        point at <b>{demon?.name}</b>. Put them back to sleep.
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {minions.map((p) => (
          <li key={p.seat} className="flex items-center justify-between gap-2">
            <span className="text-fg-primary">{p.name}</span>
            <span className="flex items-center gap-1.5">
              <CharacterIcon character={p.character} size="sm" />
              <CharacterTag character={p.character} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DemonInfo({ state }: { state: CompanionState }) {
  const minions = state.players.filter((p) => CHARACTERS[p.character].type === "minion");
  const demon = state.players.find((p) => CHARACTERS[p.character].type === "demon");
  return (
    <Panel tone="night" title="Demon info (7+ players)">
      <p className="text-sm text-fg-primary">
        Wake the Demon — <b>{demon?.name}</b>. Show THESE ARE YOUR MINIONS and point to{" "}
        {minions.map((m) => m.name).join(", ")}. Then show THESE CHARACTERS ARE NOT IN PLAY with the
        three bluffs:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.demonBluffs.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm"
          >
            <CharacterIcon character={id} size="sm" />
            <CharacterTag character={id} />
          </span>
        ))}
      </div>
    </Panel>
  );
}

function Dawn({ state, update }: { state: CompanionState; update: UpdateState }) {
  const died = state.players.filter((p) => p.diedTonight);
  return (
    <Panel tone="gold" title="Dawn">
      <p className="text-sm text-fg-primary">
        Wait five to ten seconds, then say <i>“All players, eyes open.”</i>{" "}
        {died.length === 0
          ? "Announce that nobody died tonight — but not why."
          : "Announce who died — but never how or as what."}
      </p>
      {died.length > 0 && (
        <p className="mt-2 text-lg font-bold text-white">
          Died tonight: {died.map((p) => p.name).join(", ")}
        </p>
      )}
      <Button className="mt-3" variant="primary" size="lg" block onClick={() => update(dawn)}>
        Announce dawn — begin the day
      </Button>
    </Panel>
  );
}

// ── Individual wake steps ─────────────────────────────────────────────

function WakeStep({
  state,
  update,
  step,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
}) {
  const voided = step.isDrunk || step.poisoned;
  return (
    <Panel tone="night">
      <div className="flex flex-col gap-3">
        <WakeHeader state={state} step={step} />
        <VoidWarning step={step} />
        <WakeBody state={state} update={update} step={step} voided={voided} />
      </div>
    </Panel>
  );
}

function WakeBody({
  state,
  update,
  step,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
}) {
  switch (step.character) {
    case "poisoner":
      return <PoisonerStep state={state} update={update} />;
    case "monk":
      return <MonkStep state={state} update={update} step={step} voided={voided} />;
    case "washerwoman":
      return <PairInfoStep state={state} step={step} type="townsfolk" voided={voided} />;
    case "librarian":
      return <PairInfoStep state={state} step={step} type="outsider" voided={voided} />;
    case "investigator":
      return <PairInfoStep state={state} step={step} type="minion" voided={voided} />;
    case "chef":
      return (
        <TrueNumber
          label="Pairs of neighbouring evil players"
          value={chefNumber(state)}
          voided={voided}
        />
      );
    case "empath":
      return (
        <TrueNumber
          label="Evil among their two alive neighbours"
          value={empathNumber(state, step.seat)}
          voided={voided}
        />
      );
    case "fortune-teller":
      return <FortuneTellerStep state={state} step={step} voided={voided} />;
    case "butler":
      return <ButlerStep state={state} update={update} step={step} voided={voided} />;
    case "spy":
      return (
        <p className="text-sm text-fg-primary">
          Show them the <b>Grimoire tab</b> of this screen for as long as they need — shield it from
          everyone else.{" "}
          {voided && (
            <span className="text-amber-300">
              They are poisoned: their ability is void, so you may show nothing or a misleading view
              instead.
            </span>
          )}
        </p>
      );
    case "imp":
      return <ImpStep state={state} update={update} step={step} voided={voided} />;
    case "thief":
      return (
        <VoteMarkStep state={state} update={update} step={step} voided={voided} kind="thief" />
      );
    case "bureaucrat":
      return (
        <VoteMarkStep state={state} update={update} step={step} voided={voided} kind="bureaucrat" />
      );
    case "ravenkeeper":
      return <RavenkeeperStep state={state} voided={voided} />;
    case "undertaker":
      return <UndertakerStep state={state} voided={voided} />;
    default:
      return (
        <p className="text-sm text-fg-muted">
          No recorded effect — resolve at the table and move on.
        </p>
      );
  }
}

function PoisonerStep({ state, update }: { state: CompanionState; update: UpdateState }) {
  const current = state.players.find((p) => p.poisoned)?.seat;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at — poison is recorded for tonight and tomorrow day.
      </p>
      <SeatPicker
        state={state}
        selected={current !== undefined ? [current] : []}
        onToggle={(seat) => update((s) => setPoison(s, seat === current ? undefined : seat))}
      />
    </div>
  );
}

function MonkStep({
  state,
  update,
  step,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
}) {
  const current = state.players.find((p) => p.protectedTonight)?.seat;
  if (voided) {
    return (
      <p className="text-sm text-fg-primary">
        Let them point at a player as usual — but record <b>no protection</b>: their ability is void
        tonight.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">Tap who they protect (not themself).</p>
      <SeatPicker
        state={state}
        selected={current !== undefined ? [current] : []}
        disabledSeats={[step.seat]}
        onToggle={(seat) =>
          update((s) => setMonkProtection(s, seat === current ? undefined : seat))
        }
      />
    </div>
  );
}

function PairInfoStep({
  state,
  step,
  type,
  voided,
}: {
  state: CompanionState;
  step: Extract<NightStep, { kind: "wake" }>;
  type: "townsfolk" | "outsider" | "minion";
  voided: boolean;
}) {
  const [current, setCurrent] = useState(() => firstNightPairSuggestion(state, step.seat, type));

  function reshuffle() {
    setCurrent(firstNightPairSuggestion(state, step.seat, type));
  }

  if (!current) {
    return (
      <p className="text-sm text-fg-primary">
        No {type} is in play — show a <b>0</b> (zero).
        {voided && <span className="text-amber-300"> (Ability void — you may show anything.)</span>}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <CharacterIcon character={current.character} size="lg" />
        <p className="text-sm text-fg-primary">
          {voided ? "A plausible FAKE to show:" : "Suggested true info:"} show the{" "}
          <CharacterTag character={current.character} /> token, then point at{" "}
          <b>{playerAt(state, current.realSeat).name}</b> and{" "}
          <b>{playerAt(state, current.decoySeat).name}</b>.
        </p>
      </div>
      {!voided && (
        <p className="text-xs text-fg-muted">
          {playerAt(state, current.realSeat).name} really is the{" "}
          {CHARACTERS[current.character].name}; the other is the decoy. Pick different players at
          the table if you prefer — this is only a suggestion.
        </p>
      )}
      <Button variant="secondary" size="sm" onClick={reshuffle}>
        Shuffle suggestion
      </Button>
    </div>
  );
}

function TrueNumber({ label, value, voided }: { label: string; value: number; voided: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <p className="text-xs font-bold uppercase tracking-pill text-fg-secondary">{label}</p>
      <p className="text-5xl font-bold text-white">{value}</p>
      {voided && (
        <p className="text-xs font-semibold text-amber-300">
          True answer shown — their ability is void, so show any number you like instead.
        </p>
      )}
    </div>
  );
}

function FortuneTellerStep({
  state,
  step,
  voided,
}: {
  state: CompanionState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (seat: number) =>
    setPicked((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev.slice(-1), seat],
    );
  const ready = picked.length === 2;
  const ping = ready && fortuneTellerPing(state, picked[0], picked[1]);
  const recluseIn = picked.some((s) => playerAt(state, s).character === "recluse");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the two players they point at. Dead players may be chosen.
      </p>
      <SeatPicker state={state} selected={picked} onToggle={toggle} deadSelectable />
      {ready && (
        <div className="flex flex-col items-center gap-1 py-1">
          <p className={`text-4xl font-bold ${ping ? "text-rose-300" : "text-emerald-300"}`}>
            {ping ? "YES" : "NO"}
          </p>
          <p className="text-xs text-fg-muted">
            {ping ? "Nod — a Demon (or the red herring) is among them." : "Shake your head."}
          </p>
          {recluseIn && !ping && (
            <p className="text-xs font-semibold text-amber-300">
              The Recluse is among them — you MAY let them register as the Demon and say yes.
            </p>
          )}
          {voided && (
            <p className="text-xs font-semibold text-amber-300">
              Ability void — answer whatever serves the story.
            </p>
          )}
        </div>
      )}
      {step.isDrunk && !ready && (
        <p className="text-xs text-fg-muted">
          The true reading appears once two players are picked.
        </p>
      )}
    </div>
  );
}

function ButlerStep({
  state,
  update,
  step,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
}) {
  const current = playerAt(state, step.seat).butlerMaster;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap their chosen master — tomorrow the Butler may only vote if that player votes. Dead
        players are a legal pick: a ghost vote still counts as the master voting.
        {voided && " (Poisoned: the restriction won't actually bind them.)"}
      </p>
      <SeatPicker
        state={state}
        selected={current !== undefined ? [current] : []}
        disabledSeats={[step.seat]}
        deadSelectable
        onToggle={(seat) => update((s) => setButlerMaster(s, step.seat, seat))}
      />
    </div>
  );
}

function ImpStep({
  state,
  update,
  step,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
}) {
  const [target, setTarget] = useState<number | undefined>();
  const [starPassTo, setStarPassTo] = useState<number | undefined>();
  const done = state.players.some((p) => p.diedTonight);

  if (voided) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Imp is poisoned — let them point at a player, but <b>nobody dies</b> tonight.
        </p>
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
        <Button
          variant="secondary"
          block
          disabled={target === undefined}
          onClick={() =>
            update((s) =>
              target !== undefined ? recordDemonKill(s, target, "safe", "the Imp was poisoned") : s,
            )
          }
        >
          Record: no death
        </Button>
      </div>
    );
  }

  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const isSelf = target === step.seat;
  const guarded =
    targetPlayer &&
    !isSelf &&
    (targetPlayer.protectedTonight ||
      (targetPlayer.character === "soldier" && !targetPlayer.poisoned));
  const guardReason = targetPlayer?.protectedTonight
    ? "protected by the Monk"
    : "the Soldier — safe from the Demon";
  const isMayor = targetPlayer?.character === "mayor" && !targetPlayer.poisoned && !isSelf;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">Tap who the Imp points at.</p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        onToggle={(seat) => {
          setTarget(seat === target ? undefined : seat);
          setStarPassTo(undefined);
        }}
      />
      {targetPlayer && !isSelf && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-surface-950/60 p-2">
          {guarded && (
            <p className="text-xs font-semibold text-sky-300">
              {targetPlayer.name} is {guardReason} — recommend: nobody dies.
            </p>
          )}
          {isMayor && (
            <p className="text-xs font-semibold text-amber-300">
              {targetPlayer.name} is the Mayor — you MAY kill another player instead (change the tap
              above), let the Mayor die, or kill no one.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="danger"
              block
              onClick={() => update((s) => recordDemonKill(s, targetPlayer.seat, "dies"))}
            >
              {targetPlayer.name} dies
            </Button>
            <Button
              variant="secondary"
              block
              onClick={() =>
                update((s) =>
                  recordDemonKill(s, targetPlayer.seat, "safe", guarded ? guardReason : undefined),
                )
              }
            >
              Nobody dies
            </Button>
          </div>
        </div>
      )}
      {targetPlayer && isSelf && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-2">
          <p className="text-xs font-semibold text-rose-200">
            The Imp is killing themself — a Minion becomes the Imp. Pick who inherits (the Scarlet
            Woman first, if in play):
          </p>
          <SeatPicker
            state={state}
            selected={starPassTo !== undefined ? [starPassTo] : []}
            onToggle={(seat) => setStarPassTo(seat === starPassTo ? undefined : seat)}
            disabledSeats={state.players
              .filter((p) => !(p.alive && CHARACTERS[p.character].type === "minion"))
              .map((p) => p.seat)}
            showCharacters
          />
          <Button
            variant="danger"
            block
            disabled={starPassTo === undefined}
            onClick={() =>
              update((s) => {
                if (starPassTo === undefined) return s;
                let next = recordDemonKill(s, step.seat, "dies");
                next = changeCharacter(next, starPassTo, "imp");
                return next;
              })
            }
          >
            Imp dies — pass to {starPassTo !== undefined ? playerAt(state, starPassTo).name : "…"}
          </Button>
          <p className="text-xs text-fg-muted">
            Wake the new Imp NOW: show YOU ARE and the Imp token, then put them to sleep.
          </p>
        </div>
      )}
      {done && (
        <p className="text-xs font-semibold text-emerald-300">
          Kill recorded — continue with Next.
        </p>
      )}
    </div>
  );
}

/** Thief (−1 vote) and Bureaucrat (×3 votes) share the same pick-a-player shape. */
function VoteMarkStep({
  state,
  update,
  step,
  voided,
  kind,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
  voided: boolean;
  kind: "thief" | "bureaucrat";
}) {
  const current = state.players.find((p) =>
    kind === "thief" ? p.negativeVote : p.tripleVote,
  )?.seat;
  const setter = kind === "thief" ? setNegativeVote : setTripleVote;
  if (voided) {
    return (
      <p className="text-sm text-fg-primary">
        Let them point at a player as usual — but record <b>no mark</b>: their ability is void
        tonight.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at (not themself — dead players are allowed). Tomorrow that player's vote
        counts {kind === "thief" ? "NEGATIVELY (−1)" : "as 3 votes"}.
      </p>
      <SeatPicker
        state={state}
        selected={current !== undefined ? [current] : []}
        disabledSeats={[step.seat]}
        deadSelectable
        onToggle={(seat) => update((s) => setter(s, seat === current ? undefined : seat))}
      />
    </div>
  );
}

function RavenkeeperStep({ state, voided }: { state: CompanionState; voided: boolean }) {
  const [picked, setPicked] = useState<number | undefined>();
  const player = picked !== undefined ? playerAt(state, picked) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">They died tonight — wake them; tap who they point at.</p>
      <SeatPicker
        state={state}
        selected={picked !== undefined ? [picked] : []}
        onToggle={(seat) => setPicked(seat === picked ? undefined : seat)}
        deadSelectable
      />
      {player && (
        <div className="flex flex-col items-center gap-1 py-1 text-center">
          <p className="text-sm text-fg-secondary">Show the token:</p>
          <CharacterIcon character={player.character} size="xl" />
          <p className="text-2xl font-bold">
            <CharacterTag character={player.character} />
          </p>
          {player.character === "spy" && (
            <p className="text-xs font-semibold text-amber-300">
              The Spy may register as a Townsfolk or Outsider — you may show a good token instead.
            </p>
          )}
          {player.character === "recluse" && (
            <p className="text-xs font-semibold text-amber-300">
              The Recluse may register as evil — you may show a Minion or Demon token instead.
            </p>
          )}
          {voided && (
            <p className="text-xs font-semibold text-amber-300">
              Ability void — show any token you like.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function UndertakerStep({ state, voided }: { state: CompanionState; voided: boolean }) {
  const executed = undertakerInfo(state);
  const executedName = state.lastExecution ? nameOf(state, state.lastExecution.seat) : undefined;
  if (!executed) {
    return (
      <p className="text-sm text-fg-muted">No execution yesterday — this step should not occur.</p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 py-1 text-center">
      <p className="text-sm text-fg-secondary">{executedName} was executed — show the token:</p>
      <CharacterIcon character={executed} size="xl" />
      <p className="text-2xl font-bold">
        <CharacterTag character={executed} />
      </p>
      {executed === "spy" && (
        <p className="text-xs font-semibold text-amber-300">
          The Spy may register as good — you may show a Townsfolk or Outsider token instead.
        </p>
      )}
      {executed === "recluse" && (
        <p className="text-xs font-semibold text-amber-300">
          The Recluse may register as evil — you may show a Minion or Demon token instead.
        </p>
      )}
      {voided && (
        <p className="text-xs font-semibold text-amber-300">
          Ability void — show any token you like.
        </p>
      )}
    </div>
  );
}

function nameOf(state: CompanionState, seat: number): string {
  return playerAt(state, seat).name;
}
