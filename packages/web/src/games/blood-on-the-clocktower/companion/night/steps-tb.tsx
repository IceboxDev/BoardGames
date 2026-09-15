import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  aliveNeighbours,
  changeCharacter,
  chefNumber,
  dawn,
  demonAttackStatus,
  empathNumber,
  firstNightPairSuggestion,
  fortuneTellerPing,
  infoGivenTonight,
  nameAt,
  playerAt,
  recordDemonKill,
  recordInfoGiven,
  setButlerMaster,
  setMonkProtection,
  setNegativeVote,
  setPoison,
  setTripleVote,
  undertakerInfo,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { demonAttackOutcome } from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import { useState } from "react";
import { Button } from "../../../../components/ui";
import { CharacterIcon, CharacterTag, Panel, SeatPicker } from "../common";
import { useHandOver } from "../privacy-context";
import type { UpdateState } from "../store";
import {
  Callout,
  CharacterChip,
  HandedOver,
  Hint,
  Inset,
  StepDone,
  TokenReveal,
  useSeatPair,
  useSeatPick,
} from "../ui";
import { misregistrationHints, type StepProps } from "./helpers";
import { KillButtons, TokenMisregistration, ToldButtons, TrueNumber } from "./shared";

// ── Info steps ────────────────────────────────────────────────────────

export function MinionInfo({ state }: { state: CompanionState }) {
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

export function DemonInfo({ state }: { state: CompanionState }) {
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
        <Hint tone="purple" className="mt-2">
          Also show THIS PLAYER IS, the Lunatic token, and point at {lunatic.name} — the real Demon
          must know their Lunatic.
        </Hint>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.demonBluffs.map((id) => (
          <CharacterChip key={id} character={id} />
        ))}
      </div>
    </Panel>
  );
}

export function YouAreImp({ state, seat }: { state: CompanionState; seat: number }) {
  return (
    <Panel tone="danger" title="New Demon">
      <div className="flex items-center gap-3">
        <CharacterIcon character="imp" size="lg" />
        <p className="text-sm text-fg-primary">
          Wake <b>{playerAt(state, seat).name}</b>. Show the YOU ARE info and the{" "}
          <CharacterTag character="imp" /> token, then put them back to sleep.
        </p>
      </div>
    </Panel>
  );
}

export function Dawn({ state, update }: { state: CompanionState; update: UpdateState }) {
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
        <p className="mt-2 text-lg font-bold text-fg-strong">
          Died tonight: {died.map((p) => p.name).join(", ")}
        </p>
      )}
      <Button className="mt-3" variant="primary" size="lg" block onClick={() => update(dawn)}>
        Announce dawn — begin the day
      </Button>
    </Panel>
  );
}

// ── Trouble Brewing wake steps ────────────────────────────────────────

export function PoisonerStep({ state, update }: StepProps) {
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

export function MonkStep({ state, update, step, voided }: StepProps) {
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

export function PairInfoStep({
  state,
  update,
  step,
  type,
  voided,
}: StepProps & { type: "townsfolk" | "outsider" | "minion" }) {
  const [current, setCurrent] = useState(() => firstNightPairSuggestion(state, step.seat, type));
  const misregister = misregistrationHints(state, step.seat, type);
  const told = infoGivenTonight(state, step.seat);
  const handOver = useHandOver();
  if (handOver) return <HandedOver what="The suggested info" />;

  if (!current) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          No {type} is in play — show a <b>0</b> (zero).
          {voided && (
            <span className="text-amber-300"> (Ability void — you may show anything.)</span>
          )}
        </p>
        {!voided && misregister && <Hint>{misregister}</Hint>}
        <ToldButtons
          options={["0"]}
          truth="0"
          told={told?.told}
          onRecord={(answer) => update((s) => recordInfoGiven(s, step.seat, answer, "0"))}
        />
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
          <b>{nameAt(state, current.realSeat)}</b> and <b>{nameAt(state, current.decoySeat)}</b>.
        </p>
      </div>
      {!voided && (
        <p className="text-xs text-fg-muted">
          {nameAt(state, current.realSeat)} really is the {CHARACTERS[current.character].name}; the
          other is the decoy. Pick different players at the table if you prefer — this is only a
          suggestion.
        </p>
      )}
      {!voided && misregister && <Hint>{misregister}</Hint>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCurrent(firstNightPairSuggestion(state, step.seat, type))}
        >
          Shuffle suggestion
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            update((s) =>
              recordInfoGiven(
                s,
                step.seat,
                `${CHARACTERS[current.character].name}: ${nameAt(s, current.realSeat)} or ${nameAt(s, current.decoySeat)}`,
              ),
            )
          }
        >
          Record: showed this
        </Button>
      </div>
      {told && <StepDone>Recorded — told {told.told}.</StepDone>}
    </div>
  );
}

export function ChefStep({ state, update, step, voided }: StepProps) {
  const hints: string[] = [];
  const spy = state.players.find((p) => !p.left && p.character === "spy");
  const recluse = state.players.find((p) => !p.left && p.character === "recluse");
  if (spy) hints.push(`${spy.name} (Spy) may register as GOOD — you may show fewer pairs.`);
  if (recluse) {
    hints.push(`${recluse.name} (Recluse) may register as EVIL — you may show more pairs.`);
  }
  return (
    <TrueNumber
      state={state}
      update={update}
      seat={step.seat}
      label="Pairs of neighbouring evil players"
      value={chefNumber(state)}
      voided={voided}
      hints={hints}
    />
  );
}

export function EmpathStep({ state, update, step, voided }: StepProps) {
  const hints: string[] = [];
  for (const seat of aliveNeighbours(state, step.seat)) {
    const n = playerAt(state, seat);
    if (n.character === "spy") {
      hints.push(`Neighbour ${n.name} is the Spy — may register as GOOD (show less).`);
    }
    if (n.character === "recluse") {
      hints.push(`Neighbour ${n.name} is the Recluse — may register as EVIL (show more).`);
    }
  }
  return (
    <TrueNumber
      state={state}
      update={update}
      seat={step.seat}
      label="Evil among their two alive neighbours"
      value={empathNumber(state, step.seat)}
      voided={voided}
      hints={hints}
    />
  );
}

export function FortuneTellerStep({ state, update, step, voided }: StepProps) {
  const pair = useSeatPair();
  const ping = pair.ready && fortuneTellerPing(state, pair.seats[0], pair.seats[1]);
  const recluseIn = pair.seats.some((s) => playerAt(state, s).character === "recluse");
  const told = infoGivenTonight(state, step.seat);
  const handOver = useHandOver();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap the two players they point at. Dead players may be chosen.
      </p>
      <SeatPicker state={state} selected={pair.seats} onToggle={pair.toggle} deadSelectable />
      {pair.ready && handOver && <HandedOver what="The reading" />}
      {pair.ready && !handOver && (
        <div className="flex flex-col items-center gap-1 py-1">
          <p className={`text-4xl font-bold ${ping ? "text-rose-300" : "text-emerald-300"}`}>
            {ping ? "YES" : "NO"}
          </p>
          <p className="text-xs text-fg-muted">
            {ping ? "Nod — a Demon (or the red herring) is among them." : "Shake your head."}
          </p>
          {recluseIn && !ping && (
            <Hint>
              The Recluse is among them — you MAY let them register as the Demon and say yes.
            </Hint>
          )}
          {voided && <Hint>Ability void — answer whatever serves the story.</Hint>}
          <ToldButtons
            options={["YES", "NO"]}
            truth={ping ? "YES" : "NO"}
            told={told?.told}
            onRecord={(answer) =>
              update((s) =>
                recordInfoGiven(
                  s,
                  step.seat,
                  `${answer} for ${pair.seats.map((x) => nameAt(s, x)).join(" & ")}`,
                  ping ? "YES" : "NO",
                ),
              )
            }
          />
        </div>
      )}
      {step.isDrunk && !pair.ready && (
        <p className="text-xs text-fg-muted">
          The true reading appears once two players are picked.
        </p>
      )}
    </div>
  );
}

export function ButlerStep({ state, update, step, voided }: StepProps) {
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

export function SpyStep({ voided }: StepProps) {
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
}

/**
 * The Imp's attack. Done-state and the picks live in core (`demonAttackStatus`),
 * so a tab switch or a refresh mid-step can never offer a second kill.
 */
export function ImpStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const starPass = useSeatPick();
  const status = demonAttackStatus(state);

  if (status.done) {
    return <StepDone>Kill recorded — continue with Next.</StepDone>;
  }

  if (voided) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-primary">
          The Imp is poisoned — let them point at a player, but <b>nobody dies</b> tonight.
        </p>
        <SeatPicker state={state} selected={pick.selected} deadSelectable onToggle={pick.toggle} />
        <Button
          variant="secondary"
          block
          disabled={pick.seat === undefined}
          onClick={() =>
            update((s) =>
              pick.seat !== undefined
                ? recordDemonKill(s, pick.seat, "safe", "the Imp was poisoned")
                : s,
            )
          }
        >
          Record: no death
        </Button>
      </div>
    );
  }

  const target = pick.seat;
  const outcome = target !== undefined ? demonAttackOutcome(state, target) : undefined;
  const selfProtected = outcome?.self && outcome.protections.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Tap who the Imp points at — a dead player is a legal choice (no death; helps a Soldier/Monk
        bluff).
      </p>
      <SeatPicker
        state={state}
        selected={pick.selected}
        deadSelectable
        onToggle={(seat) => {
          pick.toggle(seat);
          starPass.clear();
        }}
      />
      {target !== undefined && outcome && !outcome.self && (
        <KillButtons state={state} update={update} targetSeat={target} />
      )}
      {target !== undefined && outcome?.self && selfProtected && (
        <Inset className="flex flex-col gap-2 border-sky-400/30">
          <Hint tone="sky">
            The Imp is protected by the Monk — the self-kill fails: the Imp stays alive and NO new
            Imp is created.
          </Hint>
          <Button
            variant="secondary"
            block
            onClick={() =>
              update((s) => recordDemonKill(s, step.seat, "safe", "protected by the Monk"))
            }
          >
            Nobody dies
          </Button>
        </Inset>
      )}
      {target !== undefined && outcome?.self && !selfProtected && (
        <Callout tone="rose">
          The Imp is killing themself — a Minion becomes the Imp. Pick who inherits (the Scarlet
          Woman first, if in play):
          <SeatPicker
            state={state}
            selected={starPass.selected}
            onToggle={starPass.toggle}
            disabledSeats={state.players
              .filter((p) => !outcome.starPassCandidates.includes(p.seat))
              .map((p) => p.seat)}
            showCharacters
          />
          <Button
            variant="danger"
            block
            disabled={starPass.seat === undefined}
            onClick={() =>
              update((s) => {
                if (starPass.seat === undefined) return s;
                return changeCharacter(recordDemonKill(s, step.seat, "dies"), starPass.seat, "imp");
              })
            }
          >
            Imp dies — pass to {starPass.seat !== undefined ? nameAt(state, starPass.seat) : "…"}
          </Button>
          <p className="font-normal text-fg-muted">
            Wake the new Imp NOW: show YOU ARE and the Imp token, then put them to sleep.
          </p>
        </Callout>
      )}
    </div>
  );
}

/** Thief (−1 vote) and Bureaucrat (×3 votes) share the same pick-a-player shape. */
export function VoteMarkStep({
  state,
  update,
  step,
  voided,
  kind,
}: StepProps & { kind: "thief" | "bureaucrat" }) {
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

export function RavenkeeperStep({ state, update, step, voided }: StepProps) {
  const pick = useSeatPick();
  const player = pick.seat !== undefined ? playerAt(state, pick.seat) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">They died tonight — wake them; tap who they point at.</p>
      <SeatPicker state={state} selected={pick.selected} onToggle={pick.toggle} deadSelectable />
      {player && (
        <TokenReveal
          lead="Show the token:"
          character={player.character}
          record={{
            told: infoGivenTonight(state, step.seat)?.told,
            onRecord: (shown) =>
              update((s) =>
                recordInfoGiven(
                  s,
                  step.seat,
                  `${nameAt(s, player.seat)} is the ${CHARACTERS[shown].name}`,
                  CHARACTERS[player.character].name,
                ),
              ),
          }}
        >
          <TokenMisregistration character={player.character} />
          {voided && <Hint>Ability void — show any token you like.</Hint>}
        </TokenReveal>
      )}
    </div>
  );
}

export function UndertakerStep({ state, update, step, voided }: StepProps) {
  const executed = undertakerInfo(state);
  if (!executed || !state.lastExecution) {
    return (
      <p className="text-sm text-fg-muted">No execution yesterday — this step should not occur.</p>
    );
  }
  return (
    <TokenReveal
      lead={`${nameAt(state, state.lastExecution.seat)} was executed — show the token:`}
      character={executed}
      record={{
        told: infoGivenTonight(state, step.seat)?.told,
        onRecord: (shown) =>
          update((s) =>
            recordInfoGiven(s, step.seat, CHARACTERS[shown].name, CHARACTERS[executed].name),
          ),
      }}
    >
      <TokenMisregistration character={executed} />
      {voided && <Hint>Ability void — show any token you like.</Hint>}
    </TokenReveal>
  );
}
