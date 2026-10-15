// A woken player's answer, turned into the Grimoire edits it asks for.
//
// The online Storyteller sees the Poisoner tap "Ben" and gets a one-click
// "Poison Ben" — the same reducer the phone wizard's button runs, offered as
// a `CompanionAction` the Storyteller sends. Where the rules leave a choice
// to the Storyteller (who the Sailor's drunkenness falls on, which Innkeeper
// guest is drunk, the Imp's star-pass heir) every option is offered. Nothing
// here is applied on its own: the Storyteller is the boss.

import type { CompanionAction } from "../actions.ts";
import { CHARACTERS } from "../characters.ts";
import { type NightStep, nameAt, playerAt } from "../companion.ts";
import { demonAttackOutcome } from "../decisions.ts";
import type { CompanionState } from "../schema.ts";
import type { WakeChoice } from "../wake-prompts.ts";

export interface Resolution {
  readonly label: string;
  readonly action: CompanionAction;
  /** Shown with a warning colour: someone dies, or the rules bend. */
  readonly grave?: boolean;
}

function demonKill(state: CompanionState, target: number): Resolution[] {
  const outcome = demonAttackOutcome(state, target);
  const name = nameAt(state, target);
  if (outcome.self) {
    // The Imp's star pass: they die, and a Minion becomes the Imp.
    return outcome.starPassCandidates.map((heir) => ({
      label: `Imp dies — ${nameAt(state, heir)} becomes the Imp`,
      action: {
        type: "batch",
        actions: [
          { type: "recordDemonKill", target, outcome: "dies" },
          { type: "changeCharacter", seat: heir, character: "imp" },
        ],
      },
      grave: true,
    }));
  }
  const options: Resolution[] = [
    {
      label: outcome.protections.length > 0 ? `Attack ${name} (protected)` : `Kill ${name}`,
      action: { type: "recordDemonKill", target, outcome: "dies" },
      grave: true,
    },
    {
      label: `${name} survives`,
      action: { type: "recordDemonKill", target, outcome: "safe" },
    },
  ];
  return options;
}

/**
 * The edits `choice` (in chairs) asks for at `step`. Empty when the step only
 * informs, or the answer is incomplete.
 */
export function resolutionsFor(
  state: CompanionState,
  step: NightStep,
  choice: WakeChoice | undefined,
): Resolution[] {
  if (step.kind !== "wake") return [];
  const me = step.seat;
  const picks = choice?.seats ?? [];
  const [a, b] = picks;
  const name = (s: number) => nameAt(state, s);
  const voided = step.isDrunk || step.poisoned || step.drunk === true;
  const p = playerAt(state, me);

  // A Lunatic acts as the Demon they believe they are: the real Demon is told
  // their choices; nothing dies.
  if (p.character === "lunatic") {
    return [
      {
        label:
          picks.length > 0
            ? `Note the Lunatic's pick: ${picks.map(name).join(", ")}`
            : "The Lunatic chose no one",
        action: { type: "setLunaticChoices", seats: [...picks] },
      },
    ];
  }

  switch (step.character) {
    case "poisoner":
      return a === undefined
        ? []
        : [{ label: `Poison ${name(a)}`, action: { type: "setPoison", seat: a } }];
    case "monk":
      return a === undefined || voided
        ? []
        : [{ label: `Protect ${name(a)}`, action: { type: "setMonkProtection", seat: a } }];
    case "butler":
      return a === undefined
        ? []
        : [
            {
              label: `${name(a)} is the master`,
              action: { type: "setButlerMaster", butlerSeat: me, masterSeat: a },
            },
          ];
    case "bureaucrat":
      return a === undefined || voided
        ? []
        : [{ label: `${name(a)}'s vote counts 3×`, action: { type: "setTripleVote", seat: a } }];
    case "thief":
      return a === undefined || voided
        ? []
        : [{ label: `${name(a)}'s vote counts −1`, action: { type: "setNegativeVote", seat: a } }];
    case "imp":
    case "zombuul":
      if (a === undefined) return [];
      return voided
        ? [
            {
              label: `${name(a)} survives (ability void)`,
              action: {
                type: "recordDemonKill",
                target: a,
                outcome: "safe",
                note: "the Demon's ability is void",
              },
            },
          ]
        : demonKill(state, a);
    case "shabaloth":
      if (picks.length === 0) return [];
      return voided
        ? [
            {
              label: "Nobody dies (ability void)",
              action: {
                type: "batch",
                actions: picks.map((t) => ({
                  type: "recordDemonKill" as const,
                  target: t,
                  outcome: "safe" as const,
                  note: "the Demon's ability is void",
                })),
              },
            },
          ]
        : [
            {
              label: `Kill ${picks.map(name).join(" and ")}`,
              action: {
                type: "batch",
                actions: picks.map((t) => ({
                  type: "recordDemonKill" as const,
                  target: t,
                  outcome: "dies" as const,
                })),
              },
              grave: true,
            },
          ];
    case "po":
      if (picks.length === 0)
        return [{ label: "The Po charges up", action: { type: "recordPoCharge" } }];
      return voided
        ? [
            {
              label: "Nobody dies (ability void)",
              action: {
                type: "batch",
                actions: picks.map((t) => ({
                  type: "recordDemonKill" as const,
                  target: t,
                  outcome: "safe" as const,
                  note: "the Demon's ability is void",
                })),
              },
            },
          ]
        : [
            {
              label: `Kill ${picks.map(name).join(", ")}`,
              action: {
                type: "batch",
                actions: picks.map((t) => ({
                  type: "recordDemonKill" as const,
                  target: t,
                  outcome: "dies" as const,
                })),
              },
              grave: true,
            },
          ];
    case "pukka":
      if (a === undefined) return [];
      return voided
        ? [
            {
              label: `${name(a)} isn't poisoned (ability void)`,
              action: {
                type: "recordDemonKill",
                target: a,
                outcome: "safe",
                note: "the Pukka's ability is void",
              },
            },
          ]
        : [
            {
              label: `Poison ${name(a)} (last night's victim dies)`,
              action: { type: "recordPukkaPoison", targetSeat: a },
              grave: true,
            },
          ];
    case "sailor":
      return a === undefined
        ? []
        : [
            {
              label: `${name(a)} is drunk`,
              action: {
                type: "recordSailorChoice",
                sailorSeat: me,
                targetSeat: a,
                whoIsDrunk: "target",
              },
            },
            {
              label: `The Sailor is drunk`,
              action: {
                type: "recordSailorChoice",
                sailorSeat: me,
                targetSeat: a,
                whoIsDrunk: "sailor",
              },
            },
          ];
    case "innkeeper":
      return a === undefined || b === undefined
        ? []
        : [a, b].map((drunk) => ({
            label: `Both safe — ${name(drunk)} is drunk`,
            action: {
              type: "recordInnkeeperChoice",
              innkeeperSeat: me,
              guests: [a, b],
              drunkSeat: drunk,
            },
          }));
    case "courtier":
      return choice?.character
        ? [
            {
              label: `The ${CHARACTERS[choice.character].name} is drunk for 3 days`,
              action: {
                type: "recordCourtierChoice",
                courtierSeat: me,
                character: choice.character,
              },
            },
          ]
        : [];
    case "gambler":
      return a === undefined || !choice?.character
        ? []
        : [
            {
              label: `${name(a)} as the ${CHARACTERS[choice.character].name}`,
              action: {
                type: "recordGamblerGuess",
                gamblerSeat: me,
                targetSeat: a,
                guess: choice.character,
              },
              grave: true,
            },
          ];
    case "exorcist":
      return a === undefined
        ? []
        : [
            {
              label: `Exorcise ${name(a)}`,
              action: { type: "recordExorcistChoice", exorcistSeat: me, targetSeat: a },
            },
          ];
    case "devils-advocate":
      return a === undefined
        ? []
        : [
            {
              label: `${name(a)} survives execution tomorrow`,
              action: { type: "recordAdvocateChoice", advocateSeat: me, targetSeat: a },
            },
          ];
    case "assassin":
      return a === undefined
        ? []
        : [
            {
              label: `Assassinate ${name(a)}`,
              action: { type: "recordAssassinKill", assassinSeat: me, targetSeat: a },
              grave: true,
            },
          ];
    case "godfather":
      return a === undefined
        ? []
        : [
            {
              label: `Kill ${name(a)}`,
              action: { type: "recordGodfatherKill", godfatherSeat: me, targetSeat: a },
              grave: true,
            },
          ];
    case "professor":
      return a === undefined
        ? []
        : [
            {
              label: `Try to resurrect ${name(a)}`,
              action: { type: "recordProfessorChoice", professorSeat: me, targetSeat: a },
            },
          ];
    default:
      return [];
  }
}
