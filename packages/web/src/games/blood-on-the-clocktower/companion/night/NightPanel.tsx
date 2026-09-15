import type {
  CompanionState,
  NightStep,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  isStepResolved,
  moveNightCursor,
  nightCursorIndex,
  nightQueue,
  nightStepId,
  playerAt,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { Button } from "../../../../components/ui";
import { RADIUS_CARD_XL } from "../../../../components/ui/radii";
import { Panel } from "../common";
import { useHandOver } from "../privacy-context";
import type { UpdateState } from "../store";
import { HandedOver, StepDone } from "../ui";
import { isVoided, type WakeStep } from "./helpers";
import { VoidWarning, WakeHeader } from "./shared";
import {
  AdvocateStep,
  ApprenticeStep,
  AssassinStep,
  BmrDemonStep,
  ChambermaidStep,
  CourtierStep,
  ExorcistStep,
  GamblerStep,
  GodfatherStep,
  GossipKillStep,
  GrandmotherDiesStep,
  GrandmotherStep,
  InnkeeperStep,
  LunaticActStep,
  LunaticInfoStep,
  MoonchildKillStep,
  ProfessorStep,
  PukkaVictimStep,
  SailorStep,
  TinkerStep,
} from "./steps-bmr";
import {
  ButlerStep,
  ChefStep,
  Dawn,
  DemonInfo,
  EmpathStep,
  FortuneTellerStep,
  ImpStep,
  MinionInfo,
  MonkStep,
  PairInfoStep,
  PoisonerStep,
  RavenkeeperStep,
  SpyStep,
  UndertakerStep,
  VoteMarkStep,
  YouAreImp,
} from "./steps-tb";

/**
 * Step-by-step night runner following the boxed night sheet. Each step tells
 * the Storyteller exactly what to do, computes the TRUE information to give,
 * records choices (poison, protection, kills) into the Grimoire, and flags
 * drunk/poisoned wakers whose ability is void.
 *
 * The queue is rebuilt from state after every action; the cursor and every
 * "already ran" mark live in `state.nightProgress` (core), so a tab switch,
 * a phone lock or a refresh lands the Storyteller back on the same step with
 * the same buttons.
 */
export default function NightPanel({
  state,
  update,
}: {
  state: CompanionState;
  update: UpdateState;
}) {
  const queue = nightQueue(state);
  const idx = nightCursorIndex(state, queue);
  const step = queue[idx];
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  if (!step) return null;

  return (
    <>
      <StepBody
        key={`${night}-${nightStepId(step)}-${step.kind === "wake" ? step.character : ""}`}
        state={state}
        update={update}
        step={step}
        resolved={isStepResolved(state, step)}
      />
      {/* Step navigation lives in a bar stuck to the bottom of the Screen
          scroll container — the thumb zone. Sticky (not fixed) so it can
          never cover the last row of a tall step: at scroll end it sits in
          normal flow below the card. The step counter rides along, so
          progress is always visible without a duplicate label up top. */}
      <div
        className={`sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-raised-2 flex items-center justify-between gap-2 ${RADIUS_CARD_XL} border border-line bg-surface-900/95 px-2 py-1.5 shadow-lg shadow-black/40`}
      >
        <Button
          variant="secondary"
          size="md"
          className="min-h-10"
          disabled={idx === 0}
          onClick={() => update((s) => moveNightCursor(s, -1))}
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
          onClick={() => update((s) => moveNightCursor(s, 1))}
        >
          Next →
        </Button>
      </div>
    </>
  );
}

/** Steps that exist only to show the Storyteller who is what. */
const INFO_STEPS = new Set(["minion-info", "demon-info", "you-are-imp", "lunatic-info"]);

function StepBody({
  state,
  update,
  step,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  step: NightStep;
  resolved: boolean;
}) {
  const handOver = useHandOver();
  if (handOver && INFO_STEPS.has(step.kind)) {
    return (
      <Panel tone="night">
        <HandedOver what="This info step" />
      </Panel>
    );
  }
  switch (step.kind) {
    case "minion-info":
      return <MinionInfo state={state} />;
    case "demon-info":
      return <DemonInfo state={state} />;
    case "you-are-imp":
      return <YouAreImp state={state} seat={step.seat} />;
    case "lunatic-info":
      return <LunaticInfoStep state={state} seat={step.seat} />;
    case "apprentice":
      return <ApprenticeStep state={state} update={update} seat={step.seat} resolved={resolved} />;
    case "gossip-kill":
      return <GossipKillStep state={state} update={update} resolved={resolved} />;
    case "tinker":
      return <TinkerStep state={state} update={update} seat={step.seat} resolved={resolved} />;
    case "moonchild-kill":
      return (
        <MoonchildKillStep state={state} update={update} target={step.target} resolved={resolved} />
      );
    case "grandmother-dies":
      return (
        <GrandmotherDiesStep
          state={state}
          update={update}
          grandmotherSeat={step.grandmotherSeat}
          grandchildSeat={step.grandchildSeat}
          resolved={resolved}
        />
      );
    case "pukka-victim":
      return (
        <PukkaVictimStep state={state} update={update} target={step.target} resolved={resolved} />
      );
    case "dawn":
      return <Dawn state={state} update={update} />;
    case "wake":
      return (
        <Panel tone="night">
          <div className="flex flex-col gap-3">
            <WakeHeader state={state} step={step} />
            <VoidWarning state={state} step={step} />
            <WakeBody state={state} update={update} step={step} resolved={resolved} />
          </div>
        </Panel>
      );
  }
}

/** Steps that render their own done-state (partial progress, a reveal). */
const OWN_DONE_STATE = new Set(["imp", "zombuul", "pukka", "shabaloth", "po", "grandmother"]);

function WakeBody({
  state,
  update,
  step,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  step: WakeStep;
  resolved: boolean;
}) {
  const voided = isVoided(step);
  const props = { state, update, step, voided };
  // The Lunatic's wake step carries their BELIEVED demon — intercept before
  // the switch would hand it the real demon's UI.
  if (playerAt(state, step.seat).character === "lunatic") return <LunaticActStep {...props} />;
  if (resolved && !OWN_DONE_STATE.has(step.character)) {
    return <StepDone>Recorded — continue with Next.</StepDone>;
  }
  switch (step.character) {
    case "poisoner":
      return <PoisonerStep {...props} />;
    case "monk":
      return <MonkStep {...props} />;
    case "washerwoman":
      return <PairInfoStep {...props} type="townsfolk" />;
    case "librarian":
      return <PairInfoStep {...props} type="outsider" />;
    case "investigator":
      return <PairInfoStep {...props} type="minion" />;
    case "chef":
      return <ChefStep {...props} />;
    case "empath":
      return <EmpathStep {...props} />;
    case "fortune-teller":
      return <FortuneTellerStep {...props} />;
    case "butler":
      return <ButlerStep {...props} />;
    case "spy":
      return <SpyStep {...props} />;
    case "imp":
      return <ImpStep {...props} />;
    case "thief":
      return <VoteMarkStep {...props} kind="thief" />;
    case "bureaucrat":
      return <VoteMarkStep {...props} kind="bureaucrat" />;
    case "ravenkeeper":
      return <RavenkeeperStep {...props} />;
    case "undertaker":
      return <UndertakerStep {...props} />;
    // ── Bad Moon Rising ─────────────────────────────────────────────
    case "sailor":
      return <SailorStep {...props} />;
    case "innkeeper":
      return <InnkeeperStep {...props} />;
    case "courtier":
      return <CourtierStep {...props} />;
    case "gambler":
      return <GamblerStep {...props} />;
    case "exorcist":
      return <ExorcistStep {...props} />;
    case "devils-advocate":
      return <AdvocateStep {...props} />;
    case "assassin":
      return <AssassinStep {...props} />;
    case "godfather":
      return <GodfatherStep {...props} />;
    case "professor":
      return <ProfessorStep {...props} />;
    case "grandmother":
      return <GrandmotherStep {...props} />;
    case "chambermaid":
      return <ChambermaidStep {...props} />;
    case "zombuul":
    case "pukka":
    case "shabaloth":
    case "po":
      return <BmrDemonStep {...props} />;
    default:
      return (
        <p className="text-sm text-fg-muted">
          No recorded effect — resolve at the table and move on.
        </p>
      );
  }
}
