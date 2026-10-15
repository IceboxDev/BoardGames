import type { CompanionAction } from "@boardgames/core/games/blood-on-the-clocktower/actions";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { winPrompts } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  executionOutcome,
  slayerShot,
  virginNomination,
} from "@boardgames/core/games/blood-on-the-clocktower/decisions";
import type { Request } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { useState } from "react";
import { Button, Eyebrow, Select } from "../../../../components/ui";
import { useStoryteller } from "../context";
import { chairOf } from "../helpers";

/** One quick ruling on a player's claim: the Grimoire edit, and what the town hears. */
interface Ruling {
  readonly label: string;
  readonly action?: CompanionAction;
  readonly note: string;
  readonly grave?: boolean;
}

function rulingsFor(view: ReturnType<typeof useStoryteller>["view"], req: Request): Ruling[] {
  const state = view.companion;
  if (!state) return [];
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;
  const from = chairOf(state, req.from);
  const target = req.targets[0];
  const targetChair = target !== undefined ? chairOf(state, target) : undefined;
  if (from === undefined) return [];
  switch (req.kind) {
    case "slayer": {
      if (targetChair === undefined || target === undefined) return [];
      const verdict = slayerShot(state, from, targetChair);
      const shoot = (dies: boolean): Ruling => ({
        label: dies ? `${name(target)} dies` : "Nothing happens",
        action: { type: "recordSlayerShot", shooter: from, target: targetChair, dies },
        note: dies ? `${name(target)} is struck down.` : "Nothing happens.",
        grave: dies,
      });
      return verdict.kind === "dies"
        ? [shoot(true)]
        : verdict.kind === "recluse-may-register"
          ? [shoot(true), shoot(false)]
          : [shoot(false)];
    }
    case "gunslinger":
      return targetChair === undefined || target === undefined
        ? []
        : [
            {
              label: `Shoot ${name(target)}`,
              action: { type: "recordGunslingerShot", target: targetChair },
              note: `The Gunslinger shoots ${name(target)}.`,
              grave: true,
            },
          ];
    case "beggar-give":
      return [
        {
          label: "Give the token",
          action: { type: "giveBeggarToken", donorSeat: from },
          note: `${name(req.from)} gives the Beggar a vote token.`,
        },
      ];
    case "judge": {
      const nominee = view.day.vote?.nominee;
      const nomineeChair = nominee !== undefined ? chairOf(state, nominee) : undefined;
      if (nomineeChair === undefined || nominee === undefined) return [];
      return [true, false].map((passes) => ({
        label: passes ? "The vote passes" : "The vote fails",
        action: { type: "recordJudgeRuling", judgeSeat: from, nomineeSeat: nomineeChair, passes },
        note: `The Judge rules: the vote on ${name(nominee)} ${passes ? "passes" : "fails"}.`,
      }));
    }
    case "moonchild":
      return targetChair === undefined || target === undefined
        ? []
        : [
            {
              label: `${name(target)} is chosen`,
              action: { type: "recordMoonchildChoice", targetSeat: targetChair },
              note: `The Moonchild chooses ${name(target)}.`,
            },
          ];
    case "matron-swap": {
      const [a, b] = req.targets;
      const ca = a !== undefined ? chairOf(state, a) : undefined;
      const cb = b !== undefined ? chairOf(state, b) : undefined;
      return ca === undefined || cb === undefined || a === undefined || b === undefined
        ? []
        : [
            {
              label: `Swap ${name(a)} and ${name(b)}`,
              action: { type: "swapSeats", a: ca, b: cb },
              note: `${name(a)} and ${name(b)} swap seats.`,
            },
          ];
    }
    default:
      return [];
  }
}

function RequestCard({ req }: { req: Request }) {
  const { view, st } = useStoryteller();
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;
  const rulings = rulingsFor(view, req);
  const settle = (r: Ruling) => {
    if (r.action) st({ kind: "grimoire", action: r.action, label: r.label });
    st({ kind: "resolve-request", id: req.id, status: "resolved", note: r.note });
  };
  return (
    <li className="flex flex-col gap-1.5 rounded-card-md border border-line bg-fill-soft p-2">
      <p className="text-sm text-fg-primary">
        <span className="font-semibold text-fg-strong">{name(req.from)}</span> · {req.kind}
        {req.targets.length > 0 && ` → ${req.targets.map(name).join(", ")}`}
        {req.text && <span className="block text-fg-secondary">“{req.text}”</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rulings.map((r) => (
          <Button
            key={r.label}
            size="xs"
            variant="tinted"
            tone={r.grave ? "rose" : "sky"}
            onClick={() => settle(r)}
          >
            {r.label}
          </Button>
        ))}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => st({ kind: "resolve-request", id: req.id, status: "dismissed" })}
        >
          Dismiss
        </Button>
      </div>
    </li>
  );
}

function VoteCard() {
  const { view, st } = useStoryteller();
  const vote = view.day.vote;
  const state = view.companion;
  if (!vote || !state) return null;
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;
  const hands = vote.hands.filter(Boolean).length;
  const nominator = chairOf(state, vote.nominator);
  const nominee = chairOf(state, vote.nominee);
  const virgin =
    vote.kind === "execution" &&
    vote.status === "open" &&
    nominator !== undefined &&
    nominee !== undefined
      ? virginNomination(state, nominator, nominee)
      : undefined;
  return (
    <div className="flex flex-col gap-2 rounded-card-md border border-line bg-fill-soft p-3">
      <p className="text-sm text-fg-primary">
        <span className="font-semibold text-fg-strong">{name(vote.nominator)}</span>{" "}
        {vote.kind === "exile" ? "calls for the exile of" : "nominates"}{" "}
        <span className="font-semibold text-fg-strong">{name(vote.nominee)}</span>
      </p>
      {virgin && (
        <div className="flex flex-col gap-1.5 rounded-ui-md bg-amber-400/10 p-2">
          <p className="text-sm text-amber-200">
            The Virgin is nominated —{" "}
            {virgin.kind === "executes"
              ? `${name(vote.nominator)} is a Townsfolk: they are executed.`
              : virgin.kind === "spy-may-register"
                ? "the nominator is the Spy, who may register as a Townsfolk."
                : "nothing happens (the ability is spent)."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {virgin.kind !== "nothing" && nominator !== undefined && nominee !== undefined && (
              <Button
                size="xs"
                variant="tinted"
                tone="rose"
                onClick={() => {
                  st({
                    kind: "grimoire",
                    action: {
                      type: "recordVirginTrigger",
                      nominator,
                      virginSeat: nominee,
                      triggers: true,
                    },
                    label: "The Virgin's ability",
                  });
                  st({
                    kind: "announce",
                    text: `${name(vote.nominator)} is executed by the Virgin's power.`,
                  });
                  st({ kind: "cancel-vote" });
                }}
              >
                Execute {name(vote.nominator)}
              </Button>
            )}
            {nominator !== undefined && nominee !== undefined && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  st({
                    kind: "grimoire",
                    action: {
                      type: "recordVirginTrigger",
                      nominator,
                      virginSeat: nominee,
                      triggers: false,
                    },
                    label: "The Virgin's ability is spent",
                  })
                }
              >
                Nothing happens — go to the vote
              </Button>
            )}
          </div>
        </div>
      )}
      <p className="text-sm text-fg-secondary">
        {vote.status === "open" && "Accusation and defence — start the clock when ready."}
        {vote.status === "running" &&
          `The clock is running: ${vote.locked}/${vote.order.length} counted.`}
        {vote.status === "paused" && "The clock is paused."}
        {vote.status === "done" &&
          !vote.result &&
          `${hands} hand${hands === 1 ? "" : "s"} raised. Confirm the count.`}
        {vote.result &&
          `${vote.result.votes} votes (${vote.result.required} needed): ${vote.result.outcome}.`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {vote.status === "open" && (
          <Button size="xs" variant="solid" tone="amber" onClick={() => st({ kind: "start-vote" })}>
            Start the clock
          </Button>
        )}
        {vote.status === "running" && (
          <Button size="xs" variant="secondary" onClick={() => st({ kind: "pause-vote" })}>
            Pause
          </Button>
        )}
        {vote.status === "paused" && (
          <Button size="xs" variant="secondary" onClick={() => st({ kind: "resume-vote" })}>
            Resume
          </Button>
        )}
        {vote.status === "done" && !vote.result && (
          <Button
            size="xs"
            variant="solid"
            tone="amber"
            onClick={() => st({ kind: "confirm-vote" })}
          >
            Count {hands} vote{hands === 1 ? "" : "s"}
          </Button>
        )}
        {!vote.result && (
          <Button size="xs" variant="ghost" onClick={() => st({ kind: "cancel-vote" })}>
            Set aside
          </Button>
        )}
      </div>
    </div>
  );
}

function BlockCard() {
  const { view, st } = useStoryteller();
  const state = view.companion;
  const target = state?.day.aboutToDie;
  if (!state || !target) return null;
  const p = state.players[target.seat];
  if (!p) return null;
  const outcome = executionOutcome(state, target.seat);
  const notes: string[] = [];
  if (outcome.saintLoss) notes.push("This is the Saint: evil wins if they die by execution.");
  if (outcome.protections.length > 0) notes.push("They won't die (a protection holds).");
  if (outcome.zombuulFakeDeath) notes.push("The Zombuul only appears to die.");
  if (outcome.pacifistSeat !== undefined) notes.push("The Pacifist may spare them (Grimoire).");
  if (outcome.scapegoatSeat !== undefined) notes.push("The Scapegoat may die instead (Grimoire).");
  if (outcome.mastermindDay) notes.push("The Mastermind's day: this execution decides the game.");
  return (
    <div className="flex flex-col gap-1.5 rounded-card-md border border-rose-400/30 bg-rose-500/10 p-3">
      <p className="text-sm text-rose-100">
        On the block: <span className="font-semibold">{p.name}</span> ({target.votes} votes) —
        secretly the {CHARACTERS[p.character].name}.
      </p>
      {notes.map((n) => (
        <p key={n} className="text-xs text-rose-200">
          {n}
        </p>
      ))}
      <Button size="sm" variant="solid" tone="rose" onClick={() => st({ kind: "execute" })}>
        Execute {p.name}
      </Button>
    </div>
  );
}

/**
 * Nominate on a player's behalf: for the Bishop's town (only the Storyteller
 * nominates) or a player who is away. The town's rules still apply.
 */
function NominateFor() {
  const { view, st } = useStoryteller();
  const [nominator, setNominator] = useState("");
  const [nominee, setNominee] = useState("");
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;
  const seats = view.town.filter((t) => !t.left).map((t) => t.seat);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">Nominate on someone's behalf</span>
      <div className="flex gap-1.5">
        <Select
          size="sm"
          value={nominator}
          onChange={(e) => setNominator(e.target.value)}
          aria-label="Nominator"
        >
          <option value="">Who nominates…</option>
          {seats.map((s) => (
            <option key={s} value={s}>
              {name(s)}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          value={nominee}
          onChange={(e) => setNominee(e.target.value)}
          aria-label="Nominee"
        >
          <option value="">…whom</option>
          {seats.map((s) => (
            <option key={s} value={s}>
              {name(s)}
            </option>
          ))}
        </Select>
      </div>
      <Button
        size="xs"
        variant="secondary"
        disabled={!nominator || !nominee || nominator === nominee}
        onClick={() => {
          st({
            kind: "act-for",
            roomSeat: Number(nominator),
            action: { kind: "nominate", nominee: Number(nominee) },
          });
          setNominator("");
          setNominee("");
        }}
      >
        Nominate
      </Button>
    </div>
  );
}

/** The day: who's on the block, the vote, claims to rule on, and the win checks. */
export function DayScript() {
  const { view, st } = useStoryteller();
  const state = view.companion;
  if (!state) return null;
  const open = view.requests.filter((r) => r.status === "open");
  const prompts = winPrompts(state);
  return (
    <div className="flex flex-col gap-4">
      {prompts.map((w) => (
        <div
          key={w.kind}
          className="flex flex-col gap-1.5 rounded-card-md border border-amber-400/40 bg-amber-400/10 p-3"
        >
          <p className="text-sm text-amber-100">
            {w.kind === "good-wins" && `Good may have won: ${w.reason}.`}
            {w.kind === "evil-wins" && `Evil may have won: ${w.reason}.`}
            {w.kind === "scarlet-woman" &&
              `The Scarlet Woman (${state.players[w.seat]?.name}) becomes the Demon.`}
            {w.kind === "mastermind" &&
              "The Mastermind lives: one more day — the next execution decides."}
          </p>
          <div className="flex gap-1.5">
            {w.kind === "good-wins" && (
              <Button
                size="xs"
                variant="solid"
                tone="sky"
                onClick={() => st({ kind: "end-game", winner: "good", reason: w.reason })}
              >
                Good wins
              </Button>
            )}
            {w.kind === "evil-wins" && (
              <Button
                size="xs"
                variant="solid"
                tone="rose"
                onClick={() => st({ kind: "end-game", winner: "evil", reason: w.reason })}
              >
                Evil wins
              </Button>
            )}
            {w.kind === "scarlet-woman" && (
              <Button
                size="xs"
                variant="tinted"
                tone="rose"
                onClick={() =>
                  st({
                    kind: "grimoire",
                    action: { type: "changeCharacter", seat: w.seat, character: "imp" },
                    label: "The Scarlet Woman becomes the Imp",
                  })
                }
              >
                She becomes the Imp
              </Button>
            )}
            {w.kind === "mastermind" && (
              <Button
                size="xs"
                variant="tinted"
                tone="amber"
                onClick={() =>
                  st({
                    kind: "grimoire",
                    action: { type: "beginMastermindDay" },
                    label: "The Mastermind's day",
                  })
                }
              >
                Start the extra day
              </Button>
            )}
          </div>
        </div>
      ))}
      <BlockCard />
      <section className="flex flex-col gap-2">
        <Eyebrow>Nomination</Eyebrow>
        {view.day.vote ? (
          <VoteCard />
        ) : (
          <p className="text-sm text-fg-muted">
            {view.day.nominationsOpen ? "Waiting for a nomination." : "Nominations are closed."}
          </p>
        )}
        {(!view.day.vote || view.day.vote.status === "done") && <NominateFor />}
      </section>
      <section className="flex flex-col gap-2">
        <Eyebrow>Claims</Eyebrow>
        {open.length === 0 ? (
          <p className="text-sm text-fg-muted">No claims to rule on.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((r) => (
              <RequestCard key={r.id} req={r} />
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <Eyebrow>Table</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              st({
                kind: "chat-settings",
                publicOpen: !view.chatSettings.publicOpen,
                whispersOpen: view.chatSettings.whispersOpen,
              })
            }
          >
            {view.chatSettings.publicOpen ? "Close the square" : "Open the square"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              st({
                kind: "chat-settings",
                publicOpen: view.chatSettings.publicOpen,
                whispersOpen: !view.chatSettings.whispersOpen,
              })
            }
          >
            {view.chatSettings.whispersOpen ? "Close whispers" : "Open whispers"}
          </Button>
        </div>
      </section>
    </div>
  );
}
