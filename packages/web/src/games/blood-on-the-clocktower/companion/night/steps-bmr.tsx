import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTERS,
  charactersOfType,
  sheetOrderOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  chambermaidNumber,
  demonAttackStatus,
  infoGivenTonight,
  isEvilPlayer,
  nameAt,
  playerAt,
  poChargeActive,
  recordAdvocateChoice,
  recordAssassinKill,
  recordCourtierChoice,
  recordDemonKill,
  recordExorcistChoice,
  recordGamblerGuess,
  recordGodfatherKill,
  recordGossipKill,
  recordGrandmotherDeath,
  recordInfoGiven,
  recordInnkeeperChoice,
  recordPoCharge,
  recordProfessorChoice,
  recordPukkaPoison,
  recordSailorChoice,
  recordTinkerDeath,
  regurgitate,
  resolveMoonchildCurse,
  resolvePukkaVictim,
  setApprenticeAbility,
  setGrandchild,
  setLunaticChoices,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  exorcistBlocksDemon,
  gamblerOutcome,
  moonchildCurseOutcome,
  professorOutcome,
} from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import { useId, useState } from "react";
import { Button, Select } from "../../../../components/ui";
import { CharacterIcon, Panel, SeatPicker } from "../common";
import { useHandOver } from "../privacy-context";
import type { UpdateState } from "../store";
import {
  Callout,
  CharacterChip,
  HandedOver,
  Hint,
  StepDone,
  TokenReveal,
  useSeatPair,
  useSeatPick,
} from "../ui";
import type { StepProps } from "./helpers";
import { DeathHints, GoonWarning, KillButtons, TrueNumber } from "./shared";

export function SailorStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const handOver = useHandOver();
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
      <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
      {pick.seat !== undefined && handOver && <HandedOver what="Who ends up drunk" />}
      {pick.seat !== undefined && !handOver && (
        <>
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {(["target", "sailor"] as const).map((who) => (
              <Button
                key={who}
                variant="secondary"
                block
                onClick={() => {
                  const target = pick.seat;
                  if (target === undefined) return;
                  update((s) => recordSailorChoice(s, step.seat, target, who));
                }}
              >
                {who === "target" && pick.seat !== undefined
                  ? `${nameAt(state, pick.seat)} is drunk`
                  : "The Sailor is drunk"}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function InnkeeperStep({ state, update, step, voided }: StepProps) {
  const pair = useSeatPair();
  const handOver = useHandOver();
  if (voided) {
    return (
      <p className="text-sm text-fg-primary">
        Let them point at two players as usual — but record <b>no protection and no drunkenness</b>:
        their ability is void tonight.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the two players they point at — both are safe from death tonight, and ONE of them (your
        choice) is drunk until dusk.
      </p>
      <SeatPicker state={state} selected={pair.seats} onToggle={pair.toggle} />
      {pair.ready && handOver && <HandedOver what="Who ends up drunk" />}
      {pair.ready && !handOver && (
        <>
          {pair.seats.map((seat) => (
            <GoonWarning
              key={seat}
              state={state}
              update={update}
              chooserSeat={step.seat}
              targetSeat={seat}
            />
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            {pair.seats.map((seat) => (
              <Button
                key={seat}
                variant="secondary"
                block
                onClick={() =>
                  update((s) =>
                    recordInnkeeperChoice(s, step.seat, [pair.seats[0], pair.seats[1]], seat),
                  )
                }
              >
                Safe both — {nameAt(state, seat)} is drunk
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CourtierStep({ update, step }: StepProps) {
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
        <Hint tone="purple">
          Choosing the Goon backfires: the Courtier goes drunk and the Goon turns good — record it
          with the Goon buttons after this.
        </Hint>
      )}
    </div>
  );
}

export function GamblerStep({ state, update, step }: StepProps) {
  const pick = useSeatPick();
  const handOver = useHandOver();
  const [guess, setGuess] = useState<CharacterId | "">("");
  const fieldId = useId();
  const options = sheetOrderOf("bad-moon-rising");
  const outcome =
    pick.seat !== undefined && guess !== ""
      ? gamblerOutcome(state, step.seat, pick.seat, guess)
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They point at ANY player (dead or themself included) and a character on the sheet. Wrong
        guess: they die. Never reveal whether they were right.
      </p>
      <SeatPicker state={state} selected={pick.selected} deadSelectable onToggle={pick.toggle} />
      {pick.seat !== undefined && (
        <>
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
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
          {outcome && guess !== "" && (
            <>
              <Hint
                tone={outcome === "correct" ? "emerald" : outcome === "dies" ? "rose" : "amber"}
              >
                {outcome === "correct"
                  ? "Correct — nothing happens."
                  : outcome === "void"
                    ? "Wrong — but their ability is void: they survive."
                    : "WRONG — the Gambler dies."}
              </Hint>
              <Button
                variant={outcome === "dies" && !handOver ? "danger" : "secondary"}
                block
                onClick={() => {
                  const target = pick.seat;
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

export function ExorcistStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const lastChoice = playerAt(state, step.seat).lastChoice;
  const blocks = pick.seat !== undefined && exorcistBlocksDemon(state, step.seat, pick.seat);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at — a different player than last night (dead players allowed; smart
        against a Zombuul).
        {voided && " Their ability is void: even the Demon stays unblocked."}
      </p>
      <SeatPicker
        state={state}
        selected={pick.selected}
        disabledSeats={lastChoice !== undefined ? [lastChoice] : []}
        deadSelectable
        onToggle={pick.toggle}
      />
      {pick.seat !== undefined && (
        <>
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
          {blocks && (
            <Hint tone="rose">
              {nameAt(state, pick.seat)} IS the Demon — after recording, wake the Demon, show them
              the Exorcist token and point at the Exorcist. The Demon does not act tonight.
            </Hint>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordExorcistChoice(s, step.seat, target));
            }}
          >
            Record: exorcise {nameAt(state, pick.seat)}
          </Button>
        </>
      )}
    </div>
  );
}

export function AdvocateStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
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
        selected={pick.selected}
        disabledSeats={lastChoice !== undefined ? [lastChoice] : []}
        onToggle={pick.toggle}
      />
      {pick.seat !== undefined && (
        <>
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
          <Button
            variant="primary"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordAdvocateChoice(s, step.seat, target));
            }}
          >
            Record: {nameAt(state, pick.seat)} survives execution tomorrow
          </Button>
        </>
      )}
    </div>
  );
}

export function AssassinStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They shake their head no (they'll wake again tomorrow), or point at a player: that player
        dies — <b>no protection prevents it</b>.
        {voided && " Their ability is void tonight: a strike does nothing, but is still spent."}
      </p>
      <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
      {pick.seat !== undefined && (
        <>
          {playerAt(state, pick.seat).character === "goon" && (
            <Hint tone="purple">
              The Goon dies to the Assassin — but still flips to EVIL first. Record the flip with
              the Goon's player sheet afterwards if you honour it.
            </Hint>
          )}
          <Button
            variant="danger"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordAssassinKill(s, step.seat, target));
            }}
          >
            Assassinate {nameAt(state, pick.seat)}
          </Button>
        </>
      )}
    </div>
  );
}

export function GodfatherStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
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
            <CharacterChip key={p.seat} character={p.character} />
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
      <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
      {pick.seat !== undefined && !voided && (
        <>
          <DeathHints state={state} seat={pick.seat} cause="godfather" />
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
          <Button
            variant="danger"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordGodfatherKill(s, step.seat, target));
            }}
          >
            {nameAt(state, pick.seat)} dies
          </Button>
        </>
      )}
    </div>
  );
}

export function ProfessorStep({ state, update, step }: StepProps) {
  const pick = useSeatPick();
  const handOver = useHandOver();
  const alive = state.players.filter((p) => p.alive).map((p) => p.seat);
  const outcome =
    pick.seat !== undefined ? professorOutcome(state, step.seat, pick.seat) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They shake their head no (they'll wake again tomorrow), or point at a DEAD player: if that
        player is a Townsfolk, they are resurrected. Either way a pick spends the ability.
      </p>
      <SeatPicker
        state={state}
        selected={pick.selected}
        disabledSeats={alive}
        deadSelectable
        onToggle={pick.toggle}
      />
      {pick.seat !== undefined && outcome && (
        <>
          <Hint tone={outcome === "resurrects" ? "emerald" : "amber"}>
            {outcome === "void"
              ? "Ability void — nothing happens (and it is spent)."
              : outcome === "resurrects"
                ? `${nameAt(state, pick.seat)} is a Townsfolk — they LIVE. If they have a first-night ability, wake them now to use it again.`
                : `${nameAt(state, pick.seat)} is not a Townsfolk — nothing happens.`}
          </Hint>
          <Button
            variant={outcome === "resurrects" && !handOver ? "primary" : "secondary"}
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordProfessorChoice(s, step.seat, target));
            }}
          >
            Record the attempt
          </Button>
        </>
      )}
    </div>
  );
}

export function GrandmotherStep({ state, update, step, voided }: StepProps) {
  const gm = playerAt(state, step.seat);
  const pick = useSeatPick();
  if (gm.grandchild !== undefined) {
    const child = playerAt(state, gm.grandchild);
    return (
      <TokenReveal
        lead={
          <>
            Show the token, then point at <b>{child.name}</b>:
          </>
        }
        character={child.character}
        record={{
          told: infoGivenTonight(state, step.seat)?.told,
          onRecord: (shown) =>
            update((s) =>
              recordInfoGiven(
                s,
                step.seat,
                `${child.name} is the ${CHARACTERS[shown].name}`,
                CHARACTERS[child.character].name,
              ),
            ),
        }}
      >
        {voided && <Hint>Ability void — you may show any player and token instead.</Hint>}
      </TokenReveal>
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
        selected={pick.selected}
        disabledSeats={state.players
          .filter((p) => !candidates.some((c) => c.seat === p.seat))
          .map((p) => p.seat)}
        showCharacters
        onToggle={pick.toggle}
      />
      <Button
        variant="primary"
        block
        disabled={pick.seat === undefined}
        onClick={() => {
          const child = pick.seat;
          if (child === undefined) return;
          update((s) => setGrandchild(s, step.seat, child));
        }}
      >
        {pick.seat !== undefined
          ? `${nameAt(state, pick.seat)} is the grandchild`
          : "Pick the grandchild"}
      </Button>
    </div>
  );
}

export function ChambermaidStep({ state, update, step, voided }: StepProps) {
  const pair = useSeatPair();
  const dead = state.players.filter((p) => !p.alive).map((p) => p.seat);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        They point at two ALIVE players (not themself). Show fingers: how many woke tonight due to
        their own ability (drunk/poisoned wakers still count; info shown to Minions/Demon doesn't).
      </p>
      <SeatPicker
        state={state}
        selected={pair.seats}
        disabledSeats={[step.seat, ...dead]}
        onToggle={pair.toggle}
      />
      {pair.ready && (
        <>
          {pair.seats.map((seat) => (
            <GoonWarning
              key={seat}
              state={state}
              update={update}
              chooserSeat={step.seat}
              targetSeat={seat}
            />
          ))}
          <TrueNumber
            state={state}
            update={update}
            seat={step.seat}
            label={`Woke tonight among ${pair.seats.map((x) => nameAt(state, x)).join(" & ")}`}
            value={chambermaidNumber(state, pair.seats)}
            voided={voided}
          />
        </>
      )}
    </div>
  );
}

/** The Lunatic acting out their fake Demon attacks (other nights). */
export function LunaticActStep({ state, update, step }: StepProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const believed = CHARACTERS[step.character];
  const handOver = useHandOver();
  const toggle = (seat: number) =>
    setPicked((prev) =>
      prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat].slice(-3),
    );
  return (
    <div className="flex flex-col gap-2">
      {!handOver && (
        <p className="text-sm text-fg-primary">
          They believe they are the <b>{believed.name}</b> — let them make that Demon's choices.
          <b> Nothing actually happens.</b> Record the picks so you can show them to the real Demon.
        </p>
      )}
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
        <StepDone>
          Recorded ({state.lunaticChoices.map((s) => nameAt(state, s)).join(", ")}) — the Demon's
          step will show them.
        </StepDone>
      )}
    </div>
  );
}

/** First-night fake info for the Lunatic. */
export function LunaticInfoStep({ state, seat }: { state: CompanionState; seat: number }) {
  const p = playerAt(state, seat);
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
export function ApprenticeStep({
  state,
  update,
  seat,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
  resolved: boolean;
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
        {resolved && p.apprenticeAbility ? (
          <StepDone>
            Recorded — {p.name} has the {CHARACTERS[p.apprenticeAbility].name}'s ability.
          </StepDone>
        ) : (
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
        )}
      </div>
    </Panel>
  );
}

// ── Storyteller kill reminders ────────────────────────────────────────

/** The Gossip spoke true — the Storyteller kills a player of their choice. */
export function GossipKillStep({
  state,
  update,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  resolved: boolean;
}) {
  const pick = useSeatPick();
  return (
    <Panel tone="danger" title="Gossip — the statement was true">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Gossip's public statement today was TRUE — choose any player to die. Prefer someone
          who can actually die, so the Gossip's information means something.
        </p>
        {resolved ? (
          <StepDone>Death recorded — continue with Next.</StepDone>
        ) : (
          <>
            <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
            {pick.seat !== undefined && (
              <>
                <DeathHints state={state} seat={pick.seat} cause="gossip" />
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    const target = pick.seat;
                    if (target === undefined) return;
                    update((s) => recordGossipKill(s, target));
                  }}
                >
                  {nameAt(state, pick.seat)} dies
                </Button>
              </>
            )}
            <p className="text-xs text-fg-muted">No good target? Skip with Next.</p>
          </>
        )}
      </div>
    </Panel>
  );
}

/** The Tinker might die at any time — the Storyteller's whim. */
export function TinkerStep({
  state,
  update,
  seat,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
  resolved: boolean;
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
        {resolved ? (
          <StepDone>{p.name} died in an unfortunate accident — continue with Next.</StepDone>
        ) : (
          <>
            <DeathHints state={state} seat={seat} cause="tinker" />
            <Button
              variant="danger"
              block
              onClick={() => update((s) => recordTinkerDeath(s, seat))}
            >
              {p.name} dies in an unfortunate accident
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

/** The Moonchild's curse resolves tonight. */
export function MoonchildKillStep({
  state,
  update,
  target,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  target: number;
  resolved: boolean;
}) {
  const p = playerAt(state, target);
  const curse = moonchildCurseOutcome(state);
  const good = curse ? curse.good : !isEvilPlayer(p);
  return (
    <Panel tone="danger" title="Moonchild's curse">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Moonchild cursed <b>{p.name}</b> — they are{" "}
          <b className={good ? "text-sky-300" : "text-rose-300"}>{good ? "GOOD" : "EVIL"}</b>, so{" "}
          {good ? "they die tonight" : "nothing happens"}.
          {curse?.castVoid &&
            " The Moonchild was drunk or poisoned when they chose — the curse does nothing."}
        </p>
        {resolved || !curse ? (
          <StepDone>Curse resolved — continue with Next.</StepDone>
        ) : (
          <>
            {curse.dies && <DeathHints state={state} seat={target} cause="moonchild" />}
            <div className="flex flex-col gap-2 sm:flex-row">
              {curse.dies && (
                <Button
                  variant="danger"
                  block
                  onClick={() => update((s) => resolveMoonchildCurse(s, true))}
                >
                  {p.name} dies
                </Button>
              )}
              <Button
                variant="secondary"
                block
                onClick={() => update((s) => resolveMoonchildCurse(s, false))}
              >
                Nothing happens
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/** The Demon killed the grandchild — the Grandmother dies of grief. */
export function GrandmotherDiesStep({
  state,
  update,
  grandmotherSeat,
  grandchildSeat,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  grandmotherSeat: number;
  grandchildSeat: number;
  resolved: boolean;
}) {
  return (
    <Panel tone="danger" title="Grandmother">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Demon killed <b>{nameAt(state, grandchildSeat)}</b> — the grandchild of{" "}
          <b>{nameAt(state, grandmotherSeat)}</b>. The sober Grandmother dies too.
        </p>
        {resolved ? (
          <StepDone>{nameAt(state, grandmotherSeat)} died of grief — continue with Next.</StepDone>
        ) : (
          <>
            <DeathHints state={state} seat={grandmotherSeat} cause="grandmother" />
            <Button
              variant="danger"
              block
              onClick={() => update((s) => recordGrandmotherDeath(s, grandmotherSeat))}
            >
              {nameAt(state, grandmotherSeat)} dies too
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Last night's Pukka victim dies (or was protected), venom purged either way. */
export function PukkaVictimStep({
  state,
  update,
  target,
  resolved,
}: {
  state: CompanionState;
  update: UpdateState;
  target: number;
  resolved: boolean;
}) {
  const p = playerAt(state, target);
  return (
    <Panel tone="danger" title="Pukka's venom (the Pukka is exorcised tonight)">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          <b>{p.name}</b> has carried the Pukka's venom since last night — they die now, then become
          healthy.
        </p>
        {resolved ? (
          <StepDone>Venom resolved — continue with Next.</StepDone>
        ) : (
          <>
            <DeathHints state={state} seat={target} cause="demon" />
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
          </>
        )}
      </div>
    </Panel>
  );
}

// ── The four Bad Moon Rising demons ───────────────────────────────────

function LunaticNote({ state }: { state: CompanionState }) {
  if (!state.lunaticChoices || state.lunaticChoices.length === 0) return null;
  return (
    <Callout tone="purple">
      First: point at the Lunatic, show the Lunatic token, and point at the players the Lunatic
      chose — {state.lunaticChoices.map((s) => nameAt(state, s)).join(", ")}.
    </Callout>
  );
}

/** The four BMR demons share the attack chrome but differ in kill pattern. */
export function BmrDemonStep(props: StepProps) {
  const body =
    props.step.character === "pukka" ? (
      <PukkaStep {...props} />
    ) : props.step.character === "shabaloth" ? (
      <ShabalothStep {...props} />
    ) : props.step.character === "po" ? (
      <PoStep {...props} />
    ) : (
      <SingleAttackStep {...props} />
    );
  return (
    <div className="flex flex-col gap-2">
      <LunaticNote state={props.state} />
      {body}
    </div>
  );
}

/** One pick per night: the Zombuul (and any single-attack Demon). */
function SingleAttackStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const status = demonAttackStatus(state);
  if (status.done) {
    return <StepDone>Kill recorded — continue with Next.</StepDone>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who they point at — dead players are a legal (deathless) choice.
        {voided && " The Demon is drunk/poisoned: nobody dies either way."}
      </p>
      <SeatPicker state={state} selected={pick.selected} deadSelectable onToggle={pick.toggle} />
      {pick.seat !== undefined && (
        <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={pick.seat} />
      )}
      {pick.seat !== undefined &&
        (voided ? (
          <Button
            variant="secondary"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordDemonKill(s, target, "safe", "the Demon's ability is void"));
            }}
          >
            Record: no death
          </Button>
        ) : (
          <KillButtons state={state} update={update} targetSeat={pick.seat} />
        ))}
    </div>
  );
}

function PukkaStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const status = demonAttackStatus(state);
  const previous = state.pukkaVictim;
  if (status.done) {
    return <StepDone>Pick recorded — continue with Next.</StepDone>;
  }
  return (
    <div className="flex flex-col gap-2">
      {previous !== undefined && (
        <Callout tone="rose">
          {nameAt(state, previous)} has carried the venom since last night —{" "}
          {voided
            ? "with the Pukka's ability void tonight they neither die nor recover."
            : "they die when tonight's pick is recorded, then become healthy."}
          {!voided && <DeathHints state={state} seat={previous} cause="demon" />}
        </Callout>
      )}
      <p className="text-xs text-fg-muted">
        Tap who they point at — that player is <b>poisoned</b> now.
        {voided && " The Pukka is drunk/poisoned itself: its pick poisons NO ONE."}
      </p>
      <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} />
      {pick.seat !== undefined && (
        <>
          <GoonWarning
            state={state}
            update={update}
            chooserSeat={step.seat}
            targetSeat={pick.seat}
          />
          <Button
            variant={voided ? "secondary" : "danger"}
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) =>
                voided
                  ? recordDemonKill(s, target, "safe", "the Pukka's ability is void")
                  : recordPukkaPoison(s, target),
              );
            }}
          >
            {voided
              ? "Record: nothing happens"
              : previous !== undefined
                ? `${nameAt(state, previous)} dies · ${nameAt(state, pick.seat)} is poisoned`
                : `${nameAt(state, pick.seat)} is poisoned`}
          </Button>
        </>
      )}
    </div>
  );
}

function ShabalothStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const status = demonAttackStatus(state);
  const regurgitable = (state.shabalothVictims ?? []).filter(
    (s) => !playerAt(state, s).alive && !playerAt(state, s).left,
  );
  return (
    <div className="flex flex-col gap-3">
      {regurgitable.length > 0 && status.choices.length === 0 && (
        <Callout tone="amber">
          You MAY first regurgitate one of last night's chosen players (rarely — once or twice a
          game): they return to life and may re-use even a spent ability.
          <div className="flex flex-col gap-2 sm:flex-row">
            {regurgitable.map((s) => (
              <Button
                key={s}
                variant="secondary"
                block
                onClick={() => update((st) => regurgitate(st, s))}
              >
                Regurgitate {nameAt(state, s)}
              </Button>
            ))}
          </div>
        </Callout>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-muted">
          They point at TWO players, one at a time ({status.choices.length}/{status.wanted}{" "}
          resolved). Dead players are legal picks.
          {voided && " The Shabaloth is drunk/poisoned: nobody dies."}
        </p>
        {status.done ? (
          <StepDone>Both picks resolved — continue with Next.</StepDone>
        ) : (
          <MultiAttackPicker
            state={state}
            update={update}
            step={step}
            voided={voided}
            pick={pick}
            resolved={status.choices}
          />
        )}
      </div>
    </div>
  );
}

function PoStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const status = demonAttackStatus(state);
  const charged = poChargeActive(state);
  return (
    <div className="flex flex-col gap-2">
      {charged ? (
        <Callout tone="rose">
          The Po chose no one last night — tonight it MUST point at THREE players (
          {status.choices.length}/3 resolved).
        </Callout>
      ) : (
        <p className="text-xs text-fg-muted">
          They shake their head no (three attacks next time!), or point at one player.
          {voided && " The Po is drunk/poisoned: nobody dies (but a charge still counts)."}
        </p>
      )}
      {!charged && status.choices.length === 0 && !status.done && (
        <Button variant="secondary" block onClick={() => update(recordPoCharge)}>
          The Po chooses NO ONE — charge up
        </Button>
      )}
      {status.done ? (
        <StepDone>
          {status.choices.length === 0
            ? "The Po charged up"
            : charged
              ? "All three attacks resolved"
              : "Attack resolved"}{" "}
          — continue with Next.
        </StepDone>
      ) : (
        <MultiAttackPicker
          state={state}
          update={update}
          step={step}
          voided={voided}
          pick={pick}
          resolved={status.choices}
        />
      )}
    </div>
  );
}

/** Seat grid + resolver for a demon with more than one pick tonight. */
function MultiAttackPicker({
  state,
  update,
  step,
  voided,
  pick,
  resolved,
}: StepProps & { pick: ReturnType<typeof useSeatPick>; resolved: number[] }) {
  return (
    <>
      <SeatPicker
        state={state}
        selected={pick.selected}
        deadSelectable
        disabledSeats={resolved}
        onToggle={pick.toggle}
      />
      {pick.seat !== undefined && (
        <GoonWarning state={state} update={update} chooserSeat={step.seat} targetSeat={pick.seat} />
      )}
      {pick.seat !== undefined &&
        (voided ? (
          <Button
            variant="secondary"
            block
            onClick={() => {
              const target = pick.seat;
              if (target === undefined) return;
              update((s) => recordDemonKill(s, target, "safe", "the Demon's ability is void"));
              pick.clear();
            }}
          >
            Record pick {resolved.length + 1}: no death
          </Button>
        ) : (
          <KillButtons
            state={state}
            update={update}
            targetSeat={pick.seat}
            onResolved={pick.clear}
          />
        ))}
    </>
  );
}
