import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionState,
  DeathCause,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  infoGivenTonight,
  isEvilPlayer,
  PROTECTION_TEXT,
  playerAt,
  recordDemonKill,
  recordGoonTrigger,
  recordInfoGiven,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { demonAttackOutcome } from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import { useState } from "react";
import { Button } from "../../../../components/ui";
import { CharacterIcon, CharacterTag } from "../common";
import { useHandOver } from "../privacy-context";
import type { UpdateState } from "../store";
import { Callout, HandedOver, Hint, Inset, StepDone } from "../ui";
import { deathHints, isVoided, nightAbility, type WakeStep } from "./helpers";

export function WakeHeader({ state, step }: { state: CompanionState; step: WakeStep }) {
  const p = playerAt(state, step.seat);
  const bmr = state.script === "bad-moon-rising";
  const text = nightAbility(step.character, state);
  // The waker holds the phone in hand-over mode: they know the character they
  // believe they are, never that they are really the Drunk / Lunatic.
  const handOver = useHandOver();
  return (
    <div className="flex items-start gap-3">
      <CharacterIcon character={step.character} size="lg" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-fg-secondary">
          Wake <b className="text-fg-strong">{p.name}</b> —{" "}
          <CharacterTag character={step.character} />
          {step.isDrunk && !handOver && (
            <span className="text-amber-300"> (really the {bmr ? "Lunatic" : "Drunk"})</span>
          )}
          {p.character === "apprentice" && <span className="text-purple-300"> (Apprentice)</span>}
        </p>
        {text && <p className="text-xs leading-relaxed text-fg-muted">{text}</p>}
      </div>
    </div>
  );
}

export function VoidWarning({ state, step }: { state: CompanionState; step: WakeStep }) {
  if (!isVoided(step)) return null;
  const bmr = state.script === "bad-moon-rising";
  const label = step.isDrunk
    ? bmr
      ? "This player is secretly the LUNATIC — their Demon ability is fake"
      : "This player is secretly the Drunk"
    : step.poisoned
      ? "This player is poisoned"
      : "This player is drunk";
  return (
    <Callout tone="amber">
      {label} — their ability is VOID. Act the scene out normally, but give false info and record no
      real effect.
    </Callout>
  );
}

// ── Deaths ────────────────────────────────────────────────────────────

export function DeathHints({
  state,
  seat,
  cause,
}: {
  state: CompanionState;
  seat: number;
  cause: DeathCause;
}) {
  return (
    <>
      {deathHints(state, seat, cause).map((h) => (
        <Hint key={h} tone="sky">
          {h}
        </Hint>
      ))}
    </>
  );
}

/**
 * Shared resolver for a Demon-style night attack on `targetSeat`. When a
 * rule fixes the outcome (already dead, Monk, Innkeeper…) only the
 * matching record button is offered — the engine would bounce the kill
 * anyway, and the log should say why.
 */
export function KillButtons({
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
  const outcome = demonAttackOutcome(state, targetSeat);
  const fixed = outcome.alreadyDead || outcome.protections.length > 0;
  const handOver = useHandOver();
  if (handOver) {
    return (
      <Inset className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          {target.name} chosen. Hand the phone back — the Storyteller resolves the attack.
        </p>
      </Inset>
    );
  }
  // The log line for a bounced attack names the reason the engine would give.
  const safeNote = outcome.alreadyDead
    ? `${target.name} was already dead`
    : outcome.protections[0] && PROTECTION_TEXT[outcome.protections[0]];
  return (
    <Inset className="flex flex-col gap-2">
      <DeathHints state={state} seat={targetSeat} cause="demon" />
      {outcome.mayorRedirect && (
        <Hint tone="amber">
          {target.name} is the Mayor — you MAY kill another player instead (change the tap above),
          let the Mayor die, or kill no one.
        </Hint>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {!fixed && (
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
        )}
        <Button
          variant="secondary"
          block
          onClick={() => {
            update((s) => recordDemonKill(s, targetSeat, "safe", safeNote || undefined));
            onResolved?.();
          }}
        >
          Nobody dies
        </Button>
      </div>
    </Inset>
  );
}

/**
 * Warning + one-tap resolution when a night pick lands on the Goon: the first
 * chooser each night goes drunk and the Goon flips to their alignment.
 */
export function GoonWarning({
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
      <Hint tone="purple">
        The Goon already made someone drunk tonight — this later pick resolves normally.
      </Hint>
    );
  }
  return (
    <Callout tone="purple">
      {target.name} is the GOON — the first player to choose them tonight goes drunk, their ability
      does nothing, and the Goon becomes their alignment.
      <Button
        variant="secondary"
        size="sm"
        onClick={() => update((s) => recordGoonTrigger(s, chooserSeat))}
      >
        {chooser.name} is drunk — Goon flips to {isEvilPlayer(chooser) ? "EVIL" : "GOOD"}
      </Button>
    </Callout>
  );
}

/** "The Spy may register as good / the Recluse as evil" for a revealed token. */
export function TokenMisregistration({ character }: { character: CharacterId }) {
  if (character === "spy") {
    return (
      <Hint tone="amber">
        The Spy may register as a Townsfolk or Outsider — you may show a good token instead.
      </Hint>
    );
  }
  if (character === "recluse") {
    return (
      <Hint tone="amber">
        The Recluse may register as evil — you may show a Minion or Demon token instead.
      </Hint>
    );
  }
  return null;
}

// ── Recording what was told ───────────────────────────────────────────

/**
 * A true number with a stepper for what the Storyteller actually said. The
 * stepper starts on the truth (or on what was recorded earlier tonight), so
 * an honest answer is one tap — and a lie is remembered next to the truth.
 */
export function TrueNumber({
  state,
  update,
  seat,
  label,
  value,
  voided,
  hints = [],
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
  label: string;
  value: number;
  voided: boolean;
  hints?: string[];
}) {
  const recorded = infoGivenTonight(state, seat);
  const [told, setTold] = useState(() => {
    const n = recorded ? Number(recorded.told) : Number.NaN;
    return Number.isFinite(n) ? n : value;
  });
  const handOver = useHandOver();
  if (handOver) return <HandedOver what="The answer" />;
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <p className="text-xs font-bold uppercase tracking-pill text-fg-secondary">{label}</p>
      <p className="text-5xl font-bold text-fg-strong">{value}</p>
      {voided && (
        <Hint>True answer shown — their ability is void, so show any number you like instead.</Hint>
      )}
      {!voided &&
        hints.map((h) => (
          <Hint key={h} align="center">
            {h}
          </Hint>
        ))}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-secondary">Told</span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="One fewer"
          onClick={() => setTold((t) => Math.max(0, t - 1))}
        >
          −
        </Button>
        <span
          className={`w-8 text-center text-2xl font-bold tabular-nums ${
            told === value ? "text-fg-strong" : "text-amber-300"
          }`}
        >
          {told}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="One more"
          onClick={() => setTold((t) => t + 1)}
        >
          +
        </Button>
        <Button
          variant={recorded && Number(recorded.told) === told ? "secondary" : "primary"}
          size="sm"
          onClick={() => update((s) => recordInfoGiven(s, seat, String(told), String(value)))}
        >
          Record
        </Button>
      </div>
      {recorded && (
        <StepDone>
          Recorded — told {recorded.told}
          {recorded.truth !== undefined && recorded.truth !== recorded.told
            ? ` (true: ${recorded.truth})`
            : ""}
          .
        </StepDone>
      )}
    </div>
  );
}

/** Fixed answers ("YES" / "NO") the Storyteller picks from to record what was said. */
export function ToldButtons({
  options,
  truth,
  told,
  onRecord,
}: {
  options: readonly string[];
  truth: string;
  told?: string;
  onRecord: (answer: string) => void;
}) {
  const handOver = useHandOver();
  if (handOver) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-wrap justify-center gap-2">
        {options.map((o) => (
          <Button
            key={o}
            variant={o === truth ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onRecord(o)}
          >
            Told {o}
            {o !== truth ? " (a lie)" : ""}
          </Button>
        ))}
      </div>
      {told && <StepDone>Recorded — told {told}.</StepDone>}
    </div>
  );
}
