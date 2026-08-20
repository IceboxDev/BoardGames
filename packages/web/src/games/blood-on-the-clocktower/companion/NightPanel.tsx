import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTERS,
  charactersOfType,
  sheetOrderOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionState,
  NightStep,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  abilityVoid,
  aliveNeighbours,
  chambermaidNumber,
  changeCharacter,
  chefNumber,
  clearPoCharge,
  dawn,
  empathNumber,
  firstNightPairSuggestion,
  fortuneTellerPing,
  kill,
  nightQueue,
  playerAt,
  recordAdvocateChoice,
  recordAssassinKill,
  recordCourtierChoice,
  recordDemonKill,
  recordExorcistChoice,
  recordGamblerGuess,
  recordGodfatherKill,
  recordGoonTrigger,
  recordInnkeeperChoice,
  recordPoCharge,
  recordProfessorChoice,
  recordPukkaPoison,
  recordSailorChoice,
  regurgitate,
  resolvePukkaVictim,
  setApprenticeAbility,
  setButlerMaster,
  setGrandchild,
  setLunaticChoices,
  setMonkProtection,
  setNegativeVote,
  setNightStep,
  setPoison,
  setShabalothVictims,
  setTripleVote,
  teaLadyProtectedSeats,
  undertakerInfo,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useId, useState } from "react";
import { Button, Select } from "../../../components/ui";
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
      <StepBody
        key={`${night}-${idx}-${stepKey(step)}`}
        state={state}
        update={update}
        step={step}
      />
      {/* Step navigation lives in a bar stuck to the bottom of the Screen
          scroll container — the thumb zone. Sticky (not fixed) so it can
          never cover the last row of a tall step: at scroll end it sits in
          normal flow below the card. The step counter rides along, so
          progress is always visible without a duplicate label up top. */}
      <div className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-surface-900/95 px-2 py-1.5 shadow-lg shadow-black/40">
        <Button
          variant="secondary"
          size="md"
          className="min-h-10"
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
          size="md"
          className="min-h-10"
          disabled={idx >= queue.length - 1}
          onClick={() => update((s) => setNightStep(s, idx + 1))}
        >
          Next →
        </Button>
      </div>
    </>
  );
}

function stepKey(step: NightStep): string {
  switch (step.kind) {
    case "wake":
      return `${step.character}-${step.seat}`;
    case "you-are-imp":
      return `imp-${step.seat}`;
    case "lunatic-info":
    case "apprentice":
    case "tinker":
      return `${step.kind}-${step.seat}`;
    case "moonchild-kill":
    case "pukka-victim":
      return `${step.kind}-${step.target}`;
    case "grandmother-dies":
      return `${step.kind}-${step.grandmotherSeat}`;
    default:
      return step.kind;
  }
}

function VoidWarning({
  state,
  step,
}: {
  state: CompanionState;
  step: Extract<NightStep, { kind: "wake" }>;
}) {
  if (!step.isDrunk && !step.poisoned && !step.drunk) return null;
  const bmr = state.script === "bad-moon-rising";
  const label = step.isDrunk
    ? bmr
      ? "This player is secretly the LUNATIC — their Demon ability is fake"
      : "This player is secretly the Drunk"
    : step.poisoned
      ? "This player is poisoned"
      : "This player is drunk";
  return (
    <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-2 text-xs font-semibold text-amber-200">
      {label} — their ability is VOID. Act the scene out normally, but give false info and record no
      real effect.
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
  const bmr = state.script === "bad-moon-rising";
  return (
    <div className="flex items-start gap-3">
      <CharacterIcon character={step.character} size="lg" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-fg-secondary">
          Wake <b className="text-white">{p.name}</b> — <CharacterTag character={step.character} />
          {step.isDrunk && (
            <span className="text-amber-300"> (really the {bmr ? "Lunatic" : "Drunk"})</span>
          )}
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
    case "lunatic-info":
      return <LunaticInfoStep state={state} step={step} />;
    case "apprentice":
      return <ApprenticeStep state={state} update={update} seat={step.seat} />;
    case "gossip-kill":
      return <StorytellerKillStep state={state} update={update} kind="gossip" />;
    case "tinker":
      return <TinkerStep state={state} update={update} seat={step.seat} />;
    case "moonchild-kill":
      return <MoonchildKillStep state={state} update={update} target={step.target} />;
    case "grandmother-dies":
      return (
        <GrandmotherDiesStep
          state={state}
          update={update}
          grandmotherSeat={step.grandmotherSeat}
          grandchildSeat={step.grandchildSeat}
        />
      );
    case "pukka-victim":
      return <PukkaVictimStep state={state} update={update} target={step.target} standalone />;
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
  const lunatic = state.players.find((p) => p.character === "lunatic");
  return (
    <Panel tone="night" title="Demon info (7+ players)">
      <p className="text-sm text-fg-primary">
        Wake the Demon — <b>{demon?.name}</b>
        {lunatic && (
          <>
            {" "}
            (they drew the Lunatic token: show YOU ARE and the real{" "}
            <CharacterTag character={demon?.character ?? "imp"} /> token first)
          </>
        )}
        . Show THESE ARE YOUR MINIONS and point to {minions.map((m) => m.name).join(", ")}. Then
        show THESE CHARACTERS ARE NOT IN PLAY with the three bluffs:
      </p>
      {lunatic && (
        <p className="mt-2 text-xs font-semibold text-purple-300">
          Also show THIS PLAYER IS, the Lunatic token, and point at {lunatic.name} — the real Demon
          must know their Lunatic.
        </p>
      )}
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
  const voided = step.isDrunk || step.poisoned || Boolean(step.drunk);
  return (
    <Panel tone="night">
      <div className="flex flex-col gap-3">
        <WakeHeader state={state} step={step} />
        <VoidWarning state={state} step={step} />
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
  // The Lunatic's wake step carries their BELIEVED demon — intercept before
  // the switch would hand it the real demon's UI.
  if (playerAt(state, step.seat).character === "lunatic") {
    return <LunaticActStep state={state} update={update} step={step} />;
  }
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
    case "chef": {
      const hints: string[] = [];
      const spy = state.players.find((p) => !p.left && p.character === "spy");
      const recluse = state.players.find((p) => !p.left && p.character === "recluse");
      if (spy) hints.push(`${spy.name} (Spy) may register as GOOD — you may show fewer pairs.`);
      if (recluse) {
        hints.push(`${recluse.name} (Recluse) may register as EVIL — you may show more pairs.`);
      }
      return (
        <TrueNumber
          label="Pairs of neighbouring evil players"
          value={chefNumber(state)}
          voided={voided}
          hints={hints}
        />
      );
    }
    case "empath": {
      const neighbours = aliveNeighbours(state, step.seat).map((s) => playerAt(state, s));
      const hints: string[] = [];
      for (const n of neighbours) {
        if (n.character === "spy") {
          hints.push(`Neighbour ${n.name} is the Spy — may register as GOOD (show less).`);
        }
        if (n.character === "recluse") {
          hints.push(`Neighbour ${n.name} is the Recluse — may register as EVIL (show more).`);
        }
      }
      return (
        <TrueNumber
          label="Evil among their two alive neighbours"
          value={empathNumber(state, step.seat)}
          voided={voided}
          hints={hints}
        />
      );
    }
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
    // ── Bad Moon Rising ─────────────────────────────────────────────
    case "sailor":
      return <SailorStep state={state} update={update} step={step} voided={voided} />;
    case "innkeeper":
      return <InnkeeperStep state={state} update={update} step={step} voided={voided} />;
    case "courtier":
      return <CourtierStep update={update} step={step} />;
    case "gambler":
      return <GamblerStep state={state} update={update} step={step} voided={voided} />;
    case "exorcist":
      return <ExorcistStep state={state} update={update} step={step} voided={voided} />;
    case "devils-advocate":
      return <AdvocateStep state={state} update={update} step={step} voided={voided} />;
    case "assassin":
      return <AssassinStep state={state} update={update} step={step} voided={voided} />;
    case "godfather":
      return <GodfatherStep state={state} update={update} step={step} voided={voided} />;
    case "professor":
      return <ProfessorStep state={state} update={update} step={step} voided={voided} />;
    case "grandmother":
      return <GrandmotherStep state={state} update={update} step={step} voided={voided} />;
    case "chambermaid":
      return <ChambermaidStep state={state} update={update} step={step} voided={voided} />;
    case "zombuul":
    case "pukka":
    case "shabaloth":
    case "po":
      return <BmrDemonStep state={state} update={update} step={step} voided={voided} />;
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

  // The Spy may register as a Townsfolk/Outsider (Washerwoman/Librarian), the
  // Recluse as a Minion (Investigator) — the Storyteller may point at them.
  const spy = state.players.find((p) => p.seat !== step.seat && p.character === "spy");
  const recluse = state.players.find((p) => p.seat !== step.seat && p.character === "recluse");
  const misregisterHint =
    type === "minion" && recluse
      ? `${recluse.name} is the Recluse — they may register as a Minion; you may show a Minion token and point at them instead.`
      : type !== "minion" && spy
        ? `${spy.name} is the Spy — they may register as a${type === "outsider" ? "n Outsider" : " Townsfolk"}; you may show such a token and point at them instead.`
        : undefined;

  if (!current) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          No {type} is in play — show a <b>0</b> (zero).
          {voided && (
            <span className="text-amber-300"> (Ability void — you may show anything.)</span>
          )}
        </p>
        {!voided && misregisterHint && (
          <p className="text-xs font-semibold text-amber-300">{misregisterHint}</p>
        )}
      </div>
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
      {!voided && misregisterHint && (
        <p className="text-xs font-semibold text-amber-300">{misregisterHint}</p>
      )}
      <Button variant="secondary" size="sm" onClick={reshuffle}>
        Shuffle suggestion
      </Button>
    </div>
  );
}

function TrueNumber({
  label,
  value,
  voided,
  hints = [],
}: {
  label: string;
  value: number;
  voided: boolean;
  hints?: string[];
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <p className="text-xs font-bold uppercase tracking-pill text-fg-secondary">{label}</p>
      <p className="text-5xl font-bold text-white">{value}</p>
      {voided && (
        <p className="text-xs font-semibold text-amber-300">
          True answer shown — their ability is void, so show any number you like instead.
        </p>
      )}
      {!voided &&
        hints.map((h) => (
          <p key={h} className="text-center text-xs font-semibold text-amber-300">
            {h}
          </p>
        ))}
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
          deadSelectable
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

  if (done) {
    return (
      <p className="text-xs font-semibold text-emerald-300">Kill recorded — continue with Next.</p>
    );
  }

  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const isSelf = target === step.seat;
  const targetDead = targetPlayer !== undefined && !targetPlayer.alive;
  const guarded =
    targetPlayer &&
    !isSelf &&
    !targetDead &&
    (targetPlayer.protectedTonight ||
      (targetPlayer.character === "soldier" && !targetPlayer.poisoned));
  const guardReason = targetPlayer?.protectedTonight
    ? "protected by the Monk"
    : "the Soldier — safe from the Demon";
  const isMayor =
    targetPlayer?.character === "mayor" && !targetPlayer.poisoned && !isSelf && !targetDead;
  const selfProtected = isSelf && playerAt(state, step.seat).protectedTonight;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who the Imp points at — a dead player is a legal choice (no death; helps a Soldier/Monk
        bluff).
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        deadSelectable
        onToggle={(seat) => {
          setTarget(seat === target ? undefined : seat);
          setStarPassTo(undefined);
        }}
      />
      {targetPlayer && !isSelf && targetDead && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-surface-950/60 p-2">
          <p className="text-xs font-semibold text-sky-300">
            {targetPlayer.name} is already dead — nobody dies tonight.
          </p>
          <Button
            variant="secondary"
            block
            onClick={() =>
              update((s) =>
                recordDemonKill(s, targetPlayer.seat, "safe", "the Imp attacked a dead player"),
              )
            }
          >
            Nobody dies
          </Button>
        </div>
      )}
      {targetPlayer && !isSelf && !targetDead && (
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
      {targetPlayer && isSelf && selfProtected && (
        <div className="flex flex-col gap-2 rounded-lg border border-sky-400/30 bg-surface-950/60 p-2">
          <p className="text-xs font-semibold text-sky-300">
            The Imp is protected by the Monk — the self-kill fails: the Imp stays alive and NO new
            Imp is created.
          </p>
          <Button
            variant="secondary"
            block
            onClick={() =>
              update((s) => recordDemonKill(s, step.seat, "safe", "protected by the Monk"))
            }
          >
            Nobody dies
          </Button>
        </div>
      )}
      {targetPlayer && isSelf && !selfProtected && (
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

// ══ Bad Moon Rising steps ═════════════════════════════════════════════

/** Reasons a night kill on this target will bounce (the engine enforces them). */
function killHints(state: CompanionState, seat: number): string[] {
  const p = playerAt(state, seat);
  const hints: string[] = [];
  if (!p.alive) {
    hints.push(`${p.name} is already dead — nothing happens (a fine bluff-assist).`);
    return hints;
  }
  if (p.safeTonight) hints.push(`${p.name} is protected by the Innkeeper — cannot die tonight.`);
  if (p.character === "sailor" && !abilityVoid(state, p)) {
    hints.push(`${p.name} is the sober Sailor — cannot die.`);
  }
  if (teaLadyProtectedSeats(state).includes(seat)) {
    hints.push(`${p.name} is protected by the Tea Lady — cannot die.`);
  }
  if (p.character === "fool" && !p.usedAbility && !abilityVoid(state, p)) {
    hints.push(`${p.name} is the Fool — their first death won't happen (ability spent instead).`);
  }
  if (p.character === "zombuul" && !p.registersDead && !abilityVoid(state, p)) {
    hints.push(`${p.name} is the Zombuul — they will only APPEAR to die and secretly live on.`);
  }
  return hints;
}

/**
 * Warning + one-tap resolution when a night pick lands on the Goon: the first
 * chooser each night goes drunk and the Goon flips to their alignment.
 */
function GoonWarning({
  state,
  update,
  chooserSeat,
  targetSeat,
}: {
  state: CompanionState;
  update: UpdateState;
  chooserSeat: number;
  targetSeat: number;
}) {
  const target = playerAt(state, targetSeat);
  if (target.character !== "goon" || target.left || !target.alive) return null;
  const triggeredTonight = state.players.some(
    (p) => p.drunkSource === "goon" && (p.drunkNights ?? 0) > 0,
  );
  const chooser = playerAt(state, chooserSeat);
  if (triggeredTonight) {
    return (
      <p className="text-xs font-semibold text-purple-300">
        The Goon already made someone drunk tonight — this later pick resolves normally.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-purple-400/25 bg-purple-400/5 p-2">
      <p className="text-xs font-semibold text-purple-300">
        {target.name} is the GOON — the first player to choose them tonight goes drunk, their
        ability does nothing, and the Goon becomes their alignment.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => update((s) => recordGoonTrigger(s, chooserSeat))}
      >
        {chooser.name} is drunk — Goon flips to {isEvilSeat(state, chooserSeat) ? "EVIL" : "GOOD"}
      </Button>
    </div>
  );
}

function isEvilSeat(state: CompanionState, seat: number): boolean {
  const p = playerAt(state, seat);
  if (p.alignment) return p.alignment === "evil";
  const type = CHARACTERS[p.character].type;
  return type === "minion" || type === "demon";
}

/** Shared dies / nobody-dies resolver for a Demon-style night attack. */
function KillButtons({
  state,
  update,
  targetSeat,
  onResolved,
}: {
  state: CompanionState;
  update: UpdateState;
  targetSeat: number;
  onResolved?: () => void;
}) {
  const target = playerAt(state, targetSeat);
  const hints = killHints(state, targetSeat);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-surface-950/60 p-2">
      {hints.map((h) => (
        <p key={h} className="text-xs font-semibold text-sky-300">
          {h}
        </p>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="danger"
          block
          onClick={() => {
            update((s) => recordDemonKill(s, targetSeat, "dies"));
            onResolved?.();
          }}
        >
          {target.name} dies
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => {
            update((s) => recordDemonKill(s, targetSeat, "safe"));
            onResolved?.();
          }}
        >
          Nobody dies
        </Button>
      </div>
    </div>
  );
}

function SailorStep({
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
  if (voided) {
    return (
      <p className="text-sm text-fg-primary">
        The Sailor is already drunk — let them point at an alive player, but record{" "}
        <b>no new drunkenness</b> (and remember: a drunk Sailor CAN die).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the ALIVE player they point at (themself included). Then decide who leaves the tavern
        legless: choosing a Townsfolk usually means the Townsfolk; anyone else usually means the
        Sailor.
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && (
        <>
          <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={target} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              block
              onClick={() => update((s) => recordSailorChoice(s, step.seat, target, "target"))}
            >
              {nameOf(state, target)} is drunk
            </Button>
            <Button
              variant="secondary"
              block
              onClick={() => update((s) => recordSailorChoice(s, step.seat, target, "sailor"))}
            >
              The Sailor is drunk
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InnkeeperStep({
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
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (seat: number) =>
    setPicked((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev.slice(-1), seat],
    );
  if (voided) {
    return (
      <p className="text-sm text-fg-primary">
        Let them point at two players as usual — but record <b>no protection and no drunkenness</b>:
        their ability is void tonight.
      </p>
    );
  }
  const ready = picked.length === 2;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the two players they point at — both are safe from death tonight, and ONE of them (your
        choice) is drunk until dusk.
      </p>
      <SeatPicker state={state} selected={picked} onToggle={toggle} />
      {ready && (
        <>
          {picked.map((seat) => (
            <GoonWarning
              key={seat}
              state={state}
              update={update}
              chooserSeat={step.seat}
              targetSeat={seat}
            />
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            {picked.map((seat) => (
              <Button
                key={seat}
                variant="secondary"
                block
                onClick={() =>
                  update((s) => recordInnkeeperChoice(s, [picked[0], picked[1]], seat))
                }
              >
                Safe both — {nameOf(state, seat)} is drunk
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CourtierStep({
  update,
  step,
}: {
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
}) {
  const [choice, setChoice] = useState<CharacterId | "">("");
  const fieldId = useId();
  const options = sheetOrderOf("bad-moon-rising").filter(
    (id) => CHARACTERS[id].type !== "traveller",
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They shake their head no (nothing happens — they'll wake again tomorrow), or point at a
        CHARACTER on the sheet: if it's in play, that player is drunk for 3 nights & 3 days, and the
        Courtier's once-per-game ability is spent.
      </p>
      <div className="flex items-center gap-2">
        <Select
          id={`${fieldId}-courtier`}
          aria-label="Character the Courtier chose"
          block={false}
          size="sm"
          value={choice}
          onChange={(e) => setChoice(e.target.value as CharacterId | "")}
          className="min-w-0 flex-1"
        >
          <option value="">— they pass tonight…</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {CHARACTERS[id].name}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          disabled={!choice}
          onClick={() => {
            if (!choice) return;
            update((s) => recordCourtierChoice(s, step.seat, choice));
          }}
        >
          Record
        </Button>
      </div>
      {choice === "goon" && (
        <p className="text-xs font-semibold text-purple-300">
          Choosing the Goon backfires: the Courtier goes drunk and the Goon turns good — record it
          with the Goon buttons after this.
        </p>
      )}
    </div>
  );
}

function GamblerStep({
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
  const [guess, setGuess] = useState<CharacterId | "">("");
  const fieldId = useId();
  const options = sheetOrderOf("bad-moon-rising");
  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const correct = targetPlayer !== undefined && guess !== "" && targetPlayer.character === guess;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They point at ANY player (dead or themself included) and a character on the sheet. Wrong
        guess: they die. Never reveal whether they were right.
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        deadSelectable
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && (
        <>
          <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={target} />
          <Select
            id={`${fieldId}-guess`}
            aria-label="Character the Gambler guessed"
            size="sm"
            value={guess}
            onChange={(e) => setGuess(e.target.value as CharacterId | "")}
          >
            <option value="">— their guess…</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {CHARACTERS[id].name}
              </option>
            ))}
          </Select>
          {guess !== "" && (
            <>
              <p
                className={`text-sm font-semibold ${correct ? "text-emerald-300" : "text-rose-300"}`}
              >
                {correct
                  ? "Correct — nothing happens."
                  : voided
                    ? "Wrong — but their ability is void: they survive."
                    : "WRONG — the Gambler dies."}
              </p>
              <Button
                variant={correct || voided ? "secondary" : "danger"}
                block
                onClick={() => {
                  if (target === undefined) return;
                  update((s) => recordGamblerGuess(s, step.seat, target, guess));
                }}
              >
                Record the gamble
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ExorcistStep({
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
  const lastChoice = playerAt(state, step.seat).lastChoice;
  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const targetIsDemon =
    targetPlayer !== undefined &&
    CHARACTERS[targetPlayer.character].type === "demon" &&
    (targetPlayer.alive || targetPlayer.registersDead);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at — a different player than last night (dead players allowed; smart
        against a Zombuul).
        {voided && " Their ability is void: even the Demon stays unblocked."}
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        disabledSeats={lastChoice !== undefined ? [lastChoice] : []}
        deadSelectable
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && (
        <>
          <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={target} />
          {targetIsDemon && !voided && (
            <p className="text-sm font-semibold text-rose-300">
              {nameOf(state, target)} IS the Demon — after recording, wake the Demon, show them the
              Exorcist token and point at the Exorcist. The Demon does not act tonight.
            </p>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              update((s) => recordExorcistChoice(s, step.seat, target));
              setTarget(undefined);
            }}
          >
            Record: exorcise {nameOf(state, target)}
          </Button>
        </>
      )}
    </div>
  );
}

function AdvocateStep({
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
  const lastChoice = playerAt(state, step.seat).lastChoice;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the LIVING player they point at (themself allowed, last night's pick not). If executed
        tomorrow, that player doesn't die.
        {voided && " Ability void tonight: the pick is noted but grants NO protection."}
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        disabledSeats={lastChoice !== undefined ? [lastChoice] : []}
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && (
        <>
          <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={target} />
          <Button
            variant="primary"
            block
            onClick={() => {
              update((s) => recordAdvocateChoice(s, step.seat, target));
              setTarget(undefined);
            }}
          >
            Record: {nameOf(state, target)} survives execution tomorrow
          </Button>
        </>
      )}
    </div>
  );
}

function AssassinStep({
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
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They shake their head no (they'll wake again tomorrow), or point at a player: that player
        dies — <b>no protection prevents it</b>.
        {voided && " Their ability is void tonight: a strike does nothing, but is still spent."}
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && (
        <>
          {playerAt(state, target).character === "goon" && (
            <p className="text-xs font-semibold text-purple-300">
              The Goon dies to the Assassin — but still flips to EVIL first. Record the flip with
              the Goon's player sheet afterwards if you honour it.
            </p>
          )}
          <Button
            variant="danger"
            block
            onClick={() => {
              update((s) => recordAssassinKill(s, step.seat, target));
              setTarget(undefined);
            }}
          >
            Assassinate {nameOf(state, target)}
          </Button>
        </>
      )}
    </div>
  );
}

function GodfatherStep({
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
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  if (night === 1) {
    const outsiders = state.players.filter((p) => CHARACTERS[p.character].type === "outsider");
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          Show them the character tokens of all Outsiders in play
          {outsiders.length === 0 && " — none"}:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {outsiders.map((p) => (
            <span
              key={p.seat}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold"
            >
              <CharacterIcon character={p.character} size="sm" />
              <CharacterTag character={p.character} />
            </span>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Show only the TOKENS, never who holds them.
          {voided && " (Ability void — you may show anything.)"}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        An Outsider died today — the Godfather points at any player. That player dies.
        {voided && " Their ability is void tonight: nothing happens."}
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && !voided && (
        <>
          {killHints(state, target).map((h) => (
            <p key={h} className="text-xs font-semibold text-sky-300">
              {h}
            </p>
          ))}
          <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={target} />
          <Button
            variant="danger"
            block
            onClick={() => {
              update((s) => recordGodfatherKill(s, target));
              setTarget(undefined);
            }}
          >
            {nameOf(state, target)} dies
          </Button>
        </>
      )}
    </div>
  );
}

function ProfessorStep({
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
  const alive = state.players.filter((p) => p.alive).map((p) => p.seat);
  const targetPlayer = target !== undefined ? playerAt(state, target) : undefined;
  const wouldWork =
    targetPlayer !== undefined && CHARACTERS[targetPlayer.character].type === "townsfolk";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They shake their head no (they'll wake again tomorrow), or point at a DEAD player: if that
        player is a Townsfolk, they are resurrected. Either way a pick spends the ability.
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        disabledSeats={alive}
        deadSelectable
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {targetPlayer && target !== undefined && (
        <>
          <p className="text-sm font-semibold text-fg-primary">
            {voided
              ? "Ability void — nothing happens (and it is spent)."
              : wouldWork
                ? `${targetPlayer.name} is a Townsfolk — they LIVE. If they have a first-night ability, wake them now to use it again.`
                : `${targetPlayer.name} is not a Townsfolk — nothing happens.`}
          </p>
          <Button
            variant={wouldWork && !voided ? "primary" : "secondary"}
            block
            onClick={() => {
              update((s) => recordProfessorChoice(s, step.seat, target));
              setTarget(undefined);
            }}
          >
            Record the attempt
          </Button>
        </>
      )}
    </div>
  );
}

function GrandmotherStep({
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
  const gm = playerAt(state, step.seat);
  const [pick, setPick] = useState<number | undefined>();
  if (gm.grandchild !== undefined) {
    const child = playerAt(state, gm.grandchild);
    return (
      <div className="flex flex-col items-center gap-1 py-1 text-center">
        <p className="text-sm text-fg-secondary">
          Show the token, then point at <b>{child.name}</b>:
        </p>
        <CharacterIcon character={child.character} size="xl" />
        <p className="text-2xl font-bold">
          <CharacterTag character={child.character} />
        </p>
        {voided && (
          <p className="text-xs font-semibold text-amber-300">
            Ability void — you may show any player and token instead.
          </p>
        )}
      </div>
    );
  }
  const candidates = state.players.filter(
    (p) =>
      p.seat !== step.seat &&
      !p.left &&
      ["townsfolk", "outsider"].includes(CHARACTERS[p.character].type),
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Pick their grandchild — a good resident. The Grandmother learns the player AND their real
        character; if the Demon ever kills the grandchild, the Grandmother dies too.
      </p>
      <SeatPicker
        state={state}
        selected={pick !== undefined ? [pick] : []}
        disabledSeats={state.players
          .filter((p) => !candidates.some((c) => c.seat === p.seat))
          .map((p) => p.seat)}
        showCharacters
        onToggle={(seat) => setPick(seat === pick ? undefined : seat)}
      />
      <Button
        variant="primary"
        block
        disabled={pick === undefined}
        onClick={() => {
          if (pick === undefined) return;
          update((s) => setGrandchild(s, step.seat, pick));
        }}
      >
        {pick !== undefined ? `${nameOf(state, pick)} is the grandchild` : "Pick the grandchild"}
      </Button>
    </div>
  );
}

function ChambermaidStep({
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
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (seat: number) =>
    setPicked((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev.slice(-1), seat],
    );
  const dead = state.players.filter((p) => !p.alive).map((p) => p.seat);
  const ready = picked.length === 2;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They point at two ALIVE players (not themself). Show fingers: how many woke tonight due to
        their own ability (drunk/poisoned wakers still count; info shown to Minions/Demon doesn't).
      </p>
      <SeatPicker
        state={state}
        selected={picked}
        disabledSeats={[step.seat, ...dead]}
        onToggle={toggle}
      />
      {ready && (
        <>
          {picked.map((seat) => (
            <GoonWarning
              key={seat}
              state={state}
              update={update}
              chooserSeat={step.seat}
              targetSeat={seat}
            />
          ))}
          <div className="flex flex-col items-center gap-1 py-1">
            <p className="text-5xl font-bold text-white">{chambermaidNumber(state, picked)}</p>
            {voided && (
              <p className="text-xs font-semibold text-amber-300">
                True answer shown — their ability is void, so show any number you like instead.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The Lunatic acting out their fake Demon attacks (other nights). */
function LunaticActStep({
  state,
  update,
  step,
}: {
  state: CompanionState;
  update: UpdateState;
  step: Extract<NightStep, { kind: "wake" }>;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const believed = CHARACTERS[step.character];
  const toggle = (seat: number) =>
    setPicked((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat].slice(-3),
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-primary">
        They believe they are the <b>{believed.name}</b> — let them make that Demon's choices.
        <b> Nothing actually happens.</b> Record the picks so you can show them to the real Demon.
      </p>
      <SeatPicker state={state} selected={picked} deadSelectable onToggle={toggle} />
      <Button
        variant="secondary"
        block
        disabled={picked.length === 0}
        onClick={() => update((s) => setLunaticChoices(s, picked))}
      >
        Record the Lunatic's picks
      </Button>
      {state.lunaticChoices && state.lunaticChoices.length > 0 && (
        <p className="text-xs font-semibold text-emerald-300">
          Recorded — the Demon's step will show them.
        </p>
      )}
    </div>
  );
}

/** First-night fake info for the Lunatic. */
function LunaticInfoStep({
  state,
  step,
}: {
  state: CompanionState;
  step: Extract<NightStep, { kind: "lunatic-info" }>;
}) {
  const p = playerAt(state, step.seat);
  const believed = p.believedCharacter ? CHARACTERS[p.believedCharacter] : undefined;
  const minionCount = state.players.filter((x) => CHARACTERS[x.character].type === "minion").length;
  return (
    <Panel tone="danger" title="Lunatic — fake Demon info">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CharacterIcon character="lunatic" size="lg" />
          <p className="text-sm text-fg-primary">
            Wake <b>{p.name}</b> and treat them exactly like the Demon
            {believed && (
              <>
                {" "}
                (they believe they are the <b>{believed.name}</b>)
              </>
            )}
            .
          </p>
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-primary">
          <li>
            Show THESE ARE YOUR MINIONS and point at <b>{minionCount}</b> player
            {minionCount === 1 ? "" : "s"} of your choice — any players at all.
          </li>
          <li>Show three "not in play" bluffs — these may even be characters that ARE in play.</li>
          {p.believedCharacter === "pukka" && (
            <li>
              They think they're the Pukka, so let them "poison" someone now — it does nothing.
            </li>
          )}
        </ul>
        <p className="text-xs text-fg-muted">
          The real Demon learns who the Lunatic is right after, at the real Demon info step.
        </p>
      </div>
    </Panel>
  );
}

/** A newly seated Apprentice gains a Townsfolk (good) or Minion (evil) ability. */
function ApprenticeStep({
  state,
  update,
  seat,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
}) {
  const p = playerAt(state, seat);
  const evil = p.alignment === "evil";
  const [choice, setChoice] = useState<CharacterId | "">("");
  const fieldId = useId();
  const inPlay = new Set(state.players.filter((x) => !x.left).map((x) => x.character));
  const pool = charactersOfType(evil ? "minion" : "townsfolk", "bad-moon-rising").map((c) => c.id);
  return (
    <Panel tone="night" title="Apprentice — first night">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CharacterIcon character="apprentice" size="lg" />
          <p className="text-sm text-fg-primary">
            Wake <b>{p.name}</b>. Show YOU ARE, then a <b>{evil ? "Minion" : "Townsfolk"}</b> token
            — they gain that ability (a not-in-play character is strongly recommended). If it acts
            at night, they act from tonight on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            id={`${fieldId}-apprentice`}
            aria-label="Ability gained by the Apprentice"
            block={false}
            size="sm"
            value={choice}
            onChange={(e) => setChoice(e.target.value as CharacterId | "")}
            className="min-w-0 flex-1"
          >
            <option value="">— gained ability…</option>
            {pool.map((id) => (
              <option key={id} value={id}>
                {CHARACTERS[id].name}
                {inPlay.has(id) ? " (in play!)" : ""}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            disabled={!choice}
            onClick={() => {
              if (!choice) return;
              update((s) => setApprenticeAbility(s, seat, choice));
            }}
          >
            Record
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** The Gossip spoke true — the Storyteller kills a player of their choice. */
function StorytellerKillStep({
  state,
  update,
}: {
  state: CompanionState;
  update: UpdateState;
  kind: "gossip";
}) {
  const [target, setTarget] = useState<number | undefined>();
  return (
    <Panel tone="danger" title="Gossip — the statement was true">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Gossip's public statement today was TRUE — choose any player to die. Prefer someone
          who can actually die, so the Gossip's information means something.
        </p>
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
        {target !== undefined && (
          <>
            {killHints(state, target).map((h) => (
              <p key={h} className="text-xs font-semibold text-sky-300">
                {h}
              </p>
            ))}
            <Button
              variant="danger"
              block
              onClick={() => {
                update((s) => kill(s, target, "gossip"));
                setTarget(undefined);
              }}
            >
              {nameOf(state, target)} dies
            </Button>
          </>
        )}
        <p className="text-xs text-fg-muted">No good target? Skip with Next.</p>
      </div>
    </Panel>
  );
}

/** The Tinker might die at any time — the Storyteller's whim. */
function TinkerStep({
  state,
  update,
  seat,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
}) {
  const p = playerAt(state, seat);
  return (
    <Panel tone="night" title="Tinker — your call">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CharacterIcon character="tinker" size="lg" />
          <p className="text-sm text-fg-primary">
            <b>{p.name}</b> (Tinker) might die at any time, for no reason. A night death here can
            mask the Demon's pattern — or balance a lopsided game. Skip with Next; never end the
            game by it.
          </p>
        </div>
        {killHints(state, seat).map((h) => (
          <p key={h} className="text-xs font-semibold text-sky-300">
            {h}
          </p>
        ))}
        <Button variant="danger" block onClick={() => update((s) => kill(s, seat, "tinker"))}>
          {p.name} dies in an unfortunate accident
        </Button>
      </div>
    </Panel>
  );
}

/** The Moonchild's curse resolves tonight. */
function MoonchildKillStep({
  state,
  update,
  target,
}: {
  state: CompanionState;
  update: UpdateState;
  target: number;
}) {
  const p = playerAt(state, target);
  const good = !isEvilSeat(state, target);
  return (
    <Panel tone="danger" title="Moonchild's curse">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Moonchild cursed <b>{p.name}</b> — they are{" "}
          <b className={good ? "text-sky-300" : "text-rose-300"}>{good ? "GOOD" : "EVIL"}</b>, so{" "}
          {good ? "they die tonight" : "nothing happens"}. (If the Moonchild was drunk or poisoned
          when they chose, nothing happens either way.)
        </p>
        {good &&
          killHints(state, target).map((h) => (
            <p key={h} className="text-xs font-semibold text-sky-300">
              {h}
            </p>
          ))}
        <div className="flex flex-col gap-2 sm:flex-row">
          {good && (
            <Button
              variant="danger"
              block
              onClick={() => update((s) => kill(s, target, "moonchild"))}
            >
              {p.name} dies
            </Button>
          )}
          <Button
            variant="secondary"
            block
            onClick={() => update((s) => ({ ...s, moonchildTarget: undefined }))}
          >
            Nothing happens
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** The Demon killed the grandchild — the Grandmother dies of grief. */
function GrandmotherDiesStep({
  state,
  update,
  grandmotherSeat,
  grandchildSeat,
}: {
  state: CompanionState;
  update: UpdateState;
  grandmotherSeat: number;
  grandchildSeat: number;
}) {
  return (
    <Panel tone="danger" title="Grandmother">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Demon killed <b>{nameOf(state, grandchildSeat)}</b> — the grandchild of{" "}
          <b>{nameOf(state, grandmotherSeat)}</b>. The sober Grandmother dies too.
        </p>
        {killHints(state, grandmotherSeat).map((h) => (
          <p key={h} className="text-xs font-semibold text-sky-300">
            {h}
          </p>
        ))}
        <Button
          variant="danger"
          block
          onClick={() => update((s) => kill(s, grandmotherSeat, "grandmother"))}
        >
          {nameOf(state, grandmotherSeat)} dies too
        </Button>
      </div>
    </Panel>
  );
}

/** Last night's Pukka victim dies (or was protected), venom purged either way. */
function PukkaVictimStep({
  state,
  update,
  target,
  standalone = false,
}: {
  state: CompanionState;
  update: UpdateState;
  target: number;
  standalone?: boolean;
}) {
  const p = playerAt(state, target);
  const body = (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-primary">
        <b>{p.name}</b> has carried the Pukka's venom since last night — they die now, then become
        healthy.
      </p>
      {killHints(state, target).map((h) => (
        <p key={h} className="text-xs font-semibold text-sky-300">
          {h}
        </p>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="danger"
          block
          disabled={!p.alive}
          onClick={() => update((s) => resolvePukkaVictim(s, target, true))}
        >
          {p.name} dies
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => update((s) => resolvePukkaVictim(s, target, false))}
        >
          Protected — venom purged, no death
        </Button>
      </div>
    </div>
  );
  if (!standalone) return body;
  return (
    <Panel tone="danger" title="Pukka's venom (the Pukka is exorcised tonight)">
      {body}
    </Panel>
  );
}

/** The four BMR demons share the attack chrome but differ in kill pattern. */
function BmrDemonStep({
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
  const lunaticNote = state.lunaticChoices && state.lunaticChoices.length > 0 && (
    <p className="rounded-lg border border-purple-400/25 bg-purple-400/5 p-2 text-xs font-semibold text-purple-300">
      First: point at the Lunatic, show the Lunatic token, and point at the players the Lunatic
      chose — {state.lunaticChoices.map((s) => nameOf(state, s)).join(", ")}.
    </p>
  );
  switch (step.character) {
    case "zombuul":
      return (
        <div className="flex flex-col gap-2">
          {lunaticNote}
          <ZombuulOrSimpleKill state={state} update={update} voided={voided} />
        </div>
      );
    case "pukka":
      return (
        <div className="flex flex-col gap-2">
          {lunaticNote}
          <PukkaStep state={state} update={update} voided={voided} />
        </div>
      );
    case "shabaloth":
      return (
        <div className="flex flex-col gap-2">
          {lunaticNote}
          <ShabalothStep state={state} update={update} voided={voided} />
        </div>
      );
    case "po":
      return (
        <div className="flex flex-col gap-2">
          {lunaticNote}
          <PoStep state={state} update={update} voided={voided} />
        </div>
      );
    default:
      return null;
  }
}

function ZombuulOrSimpleKill({
  state,
  update,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  voided: boolean;
}) {
  const [target, setTarget] = useState<number | undefined>();
  const done = state.players.some((p) => p.diedTonight);
  if (done) {
    return (
      <p className="text-xs font-semibold text-emerald-300">Kill recorded — continue with Next.</p>
    );
  }
  const demon = state.players.find(
    (p) => (p.alive || p.registersDead) && CHARACTERS[p.character].type === "demon",
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at — dead players are a legal (deathless) choice.
        {voided && " The Demon is drunk/poisoned: nobody dies either way."}
      </p>
      <SeatPicker
        state={state}
        selected={target !== undefined ? [target] : []}
        deadSelectable
        onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
      />
      {target !== undefined && demon && (
        <GoonWarning state={state} update={update} chooserSeat={demon.seat} targetSeat={target} />
      )}
      {target !== undefined &&
        (voided ? (
          <Button
            variant="secondary"
            block
            onClick={() => {
              update((s) => recordDemonKill(s, target, "safe", "the Demon's ability is void"));
              setTarget(undefined);
            }}
          >
            Record: no death
          </Button>
        ) : (
          <KillButtons
            state={state}
            update={update}
            targetSeat={target}
            onResolved={() => setTarget(undefined)}
          />
        ))}
    </div>
  );
}

function PukkaStep({
  state,
  update,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  voided: boolean;
}) {
  const [target, setTarget] = useState<number | undefined>();
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const previous = state.pukkaVictim;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-muted">
          Tap who they point at — that player is <b>poisoned</b> now.
          {voided && " The Pukka is drunk/poisoned itself: its pick poisons NO ONE."}
        </p>
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
        {target !== undefined && (
          <>
            <GoonWarning
              state={state}
              update={update}
              chooserSeat={
                state.players.find((p) => p.character === "pukka" && (p.alive || p.registersDead))
                  ?.seat ?? target
              }
              targetSeat={target}
            />
            <Button
              variant={voided ? "secondary" : "danger"}
              block
              onClick={() => {
                if (!voided) update((s) => recordPukkaPoison(s, target));
                setTarget(undefined);
              }}
            >
              {voided ? "Record: nothing happens" : `${nameOf(state, target)} is poisoned`}
            </Button>
          </>
        )}
      </div>
      {previous !== undefined && night > 1 && (
        <PukkaVictimStep state={state} update={update} target={previous} />
      )}
    </div>
  );
}

function ShabalothStep({
  state,
  update,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  voided: boolean;
}) {
  const [target, setTarget] = useState<number | undefined>();
  const [resolved, setResolved] = useState<number[]>([]);
  const regurgitable = (state.shabalothVictims ?? []).filter(
    (s) => !playerAt(state, s).alive && !playerAt(state, s).left,
  );
  const demon = state.players.find((p) => p.character === "shabaloth" && p.alive);

  function afterResolve(seat: number) {
    const next = [...resolved, seat];
    setResolved(next);
    setTarget(undefined);
    if (next.length === 2) update((s) => setShabalothVictims(s, next));
  }

  return (
    <div className="flex flex-col gap-3">
      {regurgitable.length > 0 && resolved.length === 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2">
          <p className="text-xs font-semibold text-amber-200">
            You MAY first regurgitate one of last night's chosen players (rarely — once or twice a
            game): they return to life and may re-use even a spent ability.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {regurgitable.map((s) => (
              <Button
                key={s}
                variant="secondary"
                block
                onClick={() => update((st) => regurgitate(st, s))}
              >
                Regurgitate {nameOf(state, s)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-muted">
          They point at TWO players, one at a time ({resolved.length}/2 resolved). Dead players are
          legal picks.
          {voided && " The Shabaloth is drunk/poisoned: nobody dies."}
        </p>
        {resolved.length < 2 && (
          <SeatPicker
            state={state}
            selected={target !== undefined ? [target] : []}
            deadSelectable
            disabledSeats={resolved}
            onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
          />
        )}
        {target !== undefined && demon && (
          <GoonWarning state={state} update={update} chooserSeat={demon.seat} targetSeat={target} />
        )}
        {target !== undefined &&
          (voided ? (
            <Button
              variant="secondary"
              block
              onClick={() => {
                update((s) => recordDemonKill(s, target, "safe", "the Demon's ability is void"));
                afterResolve(target);
              }}
            >
              Record pick {resolved.length + 1}: no death
            </Button>
          ) : (
            <KillButtons
              state={state}
              update={update}
              targetSeat={target}
              onResolved={() => afterResolve(target)}
            />
          ))}
        {resolved.length === 2 && (
          <p className="text-xs font-semibold text-emerald-300">
            Both picks resolved — continue with Next.
          </p>
        )}
      </div>
    </div>
  );
}

function PoStep({
  state,
  update,
  voided,
}: {
  state: CompanionState;
  update: UpdateState;
  voided: boolean;
}) {
  const charged = Boolean(state.poCharged);
  const [target, setTarget] = useState<number | undefined>();
  const [resolved, setResolved] = useState<number[]>([]);
  const demon = state.players.find((p) => p.character === "po" && p.alive);
  const wanted = charged ? 3 : 1;

  function afterResolve(seat: number) {
    const next = [...resolved, seat];
    setResolved(next);
    setTarget(undefined);
    if (charged && next.length === 3) update(clearPoCharge);
  }

  return (
    <div className="flex flex-col gap-2">
      {charged ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-950/40 p-2 text-xs font-semibold text-rose-200">
          The Po chose no one last night — tonight it MUST point at THREE players ({resolved.length}
          /3 resolved).
        </p>
      ) : (
        <p className="text-xs text-fg-muted">
          They shake their head no (three attacks next time!), or point at one player.
          {voided && " The Po is drunk/poisoned: nobody dies (but a charge still counts)."}
        </p>
      )}
      {!charged && resolved.length === 0 && (
        <Button variant="secondary" block onClick={() => update(recordPoCharge)}>
          The Po chooses NO ONE — charge up
        </Button>
      )}
      {resolved.length < wanted && (
        <SeatPicker
          state={state}
          selected={target !== undefined ? [target] : []}
          deadSelectable
          disabledSeats={resolved}
          onToggle={(seat) => setTarget(seat === target ? undefined : seat)}
        />
      )}
      {target !== undefined && demon && (
        <GoonWarning state={state} update={update} chooserSeat={demon.seat} targetSeat={target} />
      )}
      {target !== undefined &&
        (voided ? (
          <Button
            variant="secondary"
            block
            onClick={() => {
              update((s) => recordDemonKill(s, target, "safe", "the Demon's ability is void"));
              afterResolve(target);
            }}
          >
            Record: no death
          </Button>
        ) : (
          <KillButtons
            state={state}
            update={update}
            targetSeat={target}
            onResolved={() => afterResolve(target)}
          />
        ))}
      {resolved.length >= wanted && (
        <p className="text-xs font-semibold text-emerald-300">
          {charged ? "All three attacks resolved" : "Attack resolved"} — continue with Next.
        </p>
      )}
    </div>
  );
}
