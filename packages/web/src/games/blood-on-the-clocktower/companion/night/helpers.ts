import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionState,
  DeathCause,
  NightStep,
  Protection,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { playerAt } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { deathOutcome } from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import type { UpdateState } from "../store";

// Non-component helpers for the night wizard (kept out of the component
// modules so they stay Fast-Refresh clean).

export type WakeStep = Extract<NightStep, { kind: "wake" }>;

export type StepProps = {
  state: CompanionState;
  update: UpdateState;
  step: WakeStep;
  /** The waker's ability is void (Drunk/Lunatic, poisoned, or BMR-drunk). */
  voided: boolean;
};

export const isVoided = (step: WakeStep) => step.isDrunk || step.poisoned || Boolean(step.drunk);

/** The ability text for tonight — the first-night line on night 1. */
export function nightAbility(character: CharacterId, state: CompanionState): string | undefined {
  const c = CHARACTERS[character];
  const firstNight = state.phase.kind === "night" && state.phase.night === 1;
  return (firstNight ? c.firstNightAction : c.otherNightsAction) ?? c.ability;
}

const PROTECTION_HINT: Record<Protection, (name: string) => string> = {
  monk: (n) => `${n} is protected by the Monk — the attack fails.`,
  soldier: (n) => `${n} is the Soldier — safe from the Demon.`,
  innkeeper: (n) => `${n} is protected by the Innkeeper — cannot die tonight.`,
  "sober-sailor": (n) => `${n} is the sober Sailor — cannot die.`,
  "tea-lady": (n) => `${n} is protected by the Tea Lady — cannot die.`,
  "devils-advocate": (n) => `${n} is the Devil's Advocate's client — executed but LIVES.`,
  fool: (n) => `${n} is the Fool — their first death won't happen (ability spent instead).`,
};

/** The rule-fixed lines about killing `seat` by `cause` — what the engine will do. */
export function deathHints(state: CompanionState, seat: number, cause: DeathCause): string[] {
  const name = playerAt(state, seat).name;
  const out = deathOutcome(state, seat, cause);
  if (out.alreadyDead) return [`${name} is already dead — nothing happens (a fine bluff-assist).`];
  const hints = out.protections.map((p) => PROTECTION_HINT[p](name));
  if (out.zombuulFakeDeath) {
    hints.push(`${name} is the Zombuul — they will only APPEAR to die and secretly live on.`);
  }
  return hints;
}

/** Spy / Recluse misregistration reminders for an info step. */
export function misregistrationHints(
  state: CompanionState,
  learnerSeat: number,
  type: "townsfolk" | "outsider" | "minion",
): string | undefined {
  const spy = state.players.find((p) => p.seat !== learnerSeat && !p.left && p.character === "spy");
  const recluse = state.players.find(
    (p) => p.seat !== learnerSeat && !p.left && p.character === "recluse",
  );
  if (type === "minion" && recluse) {
    return `${recluse.name} is the Recluse — they may register as a Minion; you may show a Minion token and point at them instead.`;
  }
  if (type !== "minion" && spy) {
    return `${spy.name} is the Spy — they may register as a${
      type === "outsider" ? "n Outsider" : " Townsfolk"
    }; you may show such a token and point at them instead.`;
  }
  return undefined;
}
