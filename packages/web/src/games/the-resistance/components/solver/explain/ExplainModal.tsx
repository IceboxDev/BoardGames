import { spyCount } from "@boardgames/core/games/the-resistance/rules";
import { RULE_IDS, RULE_INFO } from "@boardgames/core/games/the-resistance/solver/assumptions";
import type { Deduction, SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import {
  describeEvent,
  factProof,
  seatStory,
  teamMath,
} from "@boardgames/core/games/the-resistance/solver/explain";
import type { GradedDecision } from "@boardgames/core/games/the-resistance/solver/grade";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Eyebrow,
  Modal,
  ModalBody,
  ModalFooter,
} from "../../../../../components/ui";
import { LineChart } from "../../../../../components/ui/charts";
import { pct } from "../../../logic/solver";
import { GRADE_STYLE } from "../grade-style";
import type { SolverModel } from "../useSolverModel";
import { TeamMathView } from "./TeamMathView";

export type ExplainTarget =
  | { kind: "decision"; decision: GradedDecision }
  | { kind: "seat"; seat: number }
  | { kind: "fact"; fact: Deduction }
  | { kind: "team"; team: number[]; mission: number }
  | { kind: "stat"; stat: "worlds" | "proven" | "win" };

interface ExplainModalProps {
  target: ExplainTarget;
  model: SolverModel;
  name: SeatNamer;
  /** The selected perspective's label ("Table", "Me (Ada)", …). */
  perspectiveLabel: string;
  onClose: () => void;
  /** Scrub the dashboard to just before an event. */
  onJump?: (eventIndex: number) => void;
}

const TABLE_NOTE =
  "Teams are judged by what the whole table knows. A player's private certainty — their own role — can't be shown to anyone, so it can't win a vote.";

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs text-fg-secondary">
      {children}
    </ol>
  );
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function ExplainModal({
  target,
  model,
  name,
  perspectiveLabel,
  onClose,
  onJump,
}: ExplainModalProps) {
  const n = model.analysis.playerCount;
  const content = (() => {
    switch (target.kind) {
      case "decision":
        return <DecisionBody decision={target.decision} model={model} name={name} />;
      case "seat":
        return <SeatBody seat={target.seat} model={model} name={name} view={perspectiveLabel} />;
      case "fact":
        return <FactBody fact={target.fact} model={model} name={name} view={perspectiveLabel} />;
      case "team": {
        const snap = model.publicSnapshot;
        if (!snap) return null;
        return (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-fg-secondary">{TABLE_NOTE}</p>
            <TeamMathView
              math={teamMath(
                model.publicAnalysis,
                snap,
                target.team,
                target.mission,
                model.situation,
                model.env,
              )}
              name={name}
            />
          </div>
        );
      }
      case "stat":
        return <StatBody stat={target.stat} model={model} n={n} />;
    }
  })();

  const title =
    target.kind === "decision"
      ? `${name(target.decision.seat)} · ${target.decision.title}`
      : target.kind === "seat"
        ? `Is ${name(target.seat)} a spy?`
        : target.kind === "fact"
          ? target.fact.text
          : target.kind === "team"
            ? "Team odds"
            : target.stat === "win"
              ? "Resistance win chance"
              : target.stat === "worlds"
                ? "Possible spy sets"
                : "Proven possible";

  const jumpTo = target.kind === "decision" ? target.decision.eventIndex : null;
  return (
    <Modal onClose={onClose} size="lg" eyebrow="How the Solver worked it out" title={title}>
      <ModalBody gap="md">{content}</ModalBody>
      <ModalFooter>
        {jumpTo !== null && onJump && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onJump(jumpTo);
              onClose();
            }}
          >
            Show this moment
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DecisionBody({
  decision,
  model,
  name,
}: {
  decision: GradedDecision;
  model: SolverModel;
  name: SeatNamer;
}) {
  const event = model.publicAnalysis.events[decision.eventIndex];
  const snap = model.publicAnalysis.snapshots[decision.eventIndex];
  const math = (ref: GradedDecision["team"]) =>
    ref && event && snap && snap.alive > 0
      ? teamMath(model.publicAnalysis, snap, ref.team, ref.mission, event.situation, model.env)
      : null;
  const chosen = math(decision.team);
  const sameAsBest =
    decision.best && decision.team && decision.best.team.join() === decision.team.team.join();
  const best = sameAsBest ? null : math(decision.best);
  const style = GRADE_STYLE[decision.grade];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={style.tone}>
          {style.label}
        </Badge>
        <span className="text-xs text-fg-muted">
          Round {decision.round + 1} · {decision.kind}
          {event ? ` · ${describeEvent(event, model.analysis.playerCount, name)}` : ""}
        </span>
      </div>
      {decision.choice && <OptionsTable decision={decision} name={name} />}
      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">The argument</Eyebrow>
        <Steps>
          {decision.reasoning.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </Steps>
      </section>
      {chosen && (
        <section className="flex flex-col gap-2">
          <Eyebrow size="sm">
            {decision.kind === "proposal" ? "The team proposed" : "The team voted on"}
          </Eyebrow>
          <TeamMathView
            math={chosen}
            name={name}
            caption="By the table's view, before this decision."
          />
        </section>
      )}
      {best && (
        <section className="flex flex-col gap-2">
          <Eyebrow size="sm">The table's best alternative</Eyebrow>
          <TeamMathView math={best} name={name} />
        </section>
      )}
    </div>
  );
}

/** Every optimal option (and the best others), scored on both criteria. */
function OptionsTable({ decision, name }: { decision: GradedDecision; name: SeatNamer }) {
  const choice = decision.choice;
  if (!choice) return null;
  const spy = choice.metric === "spy";
  const game = choice.metric === "game";
  const optimalCount = choice.options.filter((o) => o.optimal).length;
  return (
    <section className="flex flex-col gap-2">
      <Eyebrow size="sm">
        {optimalCount === 1 ? "The optimal play" : `${optimalCount} equally optimal plays`} · of{" "}
        {choice.total} {spy ? "teams that surely fail" : "possible teams"}
      </Eyebrow>
      <p className="text-2xs text-fg-muted">
        {spy
          ? "Ranked by the table's uncertainty about the spies after the Fail (more is better); ties broken by fewer spies aboard."
          : game
            ? "Each team played forward to the end of the game (the table running its favourite team every mission after). Ranked by how often the Resistance then wins over the seatings the leader considered possible; ties broken by the same over the table's view — how arguable it is."
            : "Ranked by the chance to succeed by the table's view; ties broken by the leader's own knowledge."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-2xs tabular-nums">
          <thead className="text-fg-muted">
            <tr>
              <th className="py-1 pr-2 font-normal">Team</th>
              <th className="py-1 pr-2 font-normal">
                {spy ? "Table's doubt after" : game ? "Wins · own view" : "Table's view"}
              </th>
              <th className="py-1 pr-2 font-normal">
                {spy ? "Spies aboard" : game ? "Wins · table's view" : "Own view"}
              </th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody className="text-fg-secondary">
            {choice.options.map((o) => {
              const isChosen = o === choice.chosen;
              return (
                <tr
                  key={`${o.mission}-${o.team.join()}`}
                  className={
                    isChosen
                      ? "border-t border-line-soft text-fg-strong"
                      : "border-t border-line-soft"
                  }
                >
                  <td className="py-1 pr-2">
                    {o.team.map(name).join(", ")}
                    {isChosen && <span className="text-fg-muted"> ← chosen</span>}
                  </td>
                  <td className="py-1 pr-2">
                    {spy ? `${o.primary.toFixed(2)} bits` : pct(o.primary)}
                  </td>
                  <td className="py-1 pr-2">{spy ? -o.secondary : pct(o.secondary)}</td>
                  <td className="py-1">
                    {o.optimal && (
                      <Badge size="xs" tone="emerald">
                        Optimal
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeatBody({
  seat,
  model,
  name,
  view,
}: {
  seat: number;
  model: SolverModel;
  name: SeatNamer;
  view: string;
}) {
  const story = seatStory(model.analysis, seat, model.at);
  const now = story.series.at(-1);
  const n = model.analysis.playerCount;
  const k = spyCount(n);
  const proven = now?.pSpyCore === 1 ? "spy" : now?.pSpyCore === 0 ? "resistance" : null;
  return (
    <div className="flex flex-col gap-4">
      <Steps>
        <li>
          Every way to choose {k} spies from {n} players is a <em>spy set</em> — {choose(n, k)} at
          the start. Seen by <span className="text-fg-primary">{view}</span>, {story.worldsAlive}{" "}
          {story.worldsAlive === 1 ? "is" : "are"} still possible and {story.worldsWith} of them
          include {name(seat)}.
        </li>
        <li>
          Each set carries a weight: how likely it makes everything that happened (every Fail count,
          proposal and vote), under the assumptions. P({name(seat)} is a spy) is the weight of the
          sets containing {name(seat)} divided by the weight of all of them:{" "}
          <span className="font-semibold text-fg-primary">{pct(now?.pSpy ?? 0)}</span>.
        </li>
        <li>
          {proven === "spy"
            ? `Proven: every set the cards still allow contains ${name(seat)}.`
            : proven === "resistance"
              ? `Proven clean: no set the cards still allow contains ${name(seat)}.`
              : `Not proven either way: by the cards alone, ${pct(now?.pSpyCore ?? 0)} of the sets still allowed contain ${name(seat)} (counted evenly, before the assumptions weigh them).`}
        </li>
      </Steps>
      {story.series.length > 1 && (
        <LineChart
          data={story.series.map((p) => ({ x: p.at, y: p.pSpy * 100 }))}
          yDomain={[0, 100]}
          formatY={(v) => `${Math.round(v)}%`}
          tone="rose"
          height={140}
        />
      )}
      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">What moved it most</Eyebrow>
        {story.moves.length === 0 ? (
          <p className="text-xs text-fg-muted">Nothing has moved it yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs text-fg-secondary">
            {story.moves.map((m) => (
              <li key={m.event.index} className="flex items-start justify-between gap-3">
                <span>
                  {describeEvent(m.event, n, name)}
                  <span className="block text-2xs text-fg-muted">
                    {m.ruledOutBy.length > 0
                      ? `Ruled out spy sets: ${m.ruledOutBy
                          .map((by) =>
                            by === "cards" ? "the Fail count" : `“${RULE_INFO[by].label}”`,
                          )
                          .join(", ")}`
                      : "Nothing ruled out — a lean from the assumptions re-weighed the sets"}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {pct(m.before)} →{" "}
                  <span className={m.after > m.before ? "text-rose-300" : "text-sky-300"}>
                    {pct(m.after)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FactBody({
  fact,
  model,
  name,
  view,
}: {
  fact: Deduction;
  model: SolverModel;
  name: SeatNamer;
  view: string;
}) {
  const n = model.analysis.playerCount;
  if (fact.kind === "contradiction") {
    return (
      <p className="text-xs text-fg-secondary">
        {fact.certainty === "proven"
          ? "No set of spies can produce this entry under the game's own rule (the Resistance only ever plays Success) — most likely a slip when entering it. The Solver skips it."
          : "Every set of spies still allowed by the cards breaks this assumption at that point, so someone at the table didn't play the way it assumes. The Solver re-reads the whole game with that rule softened to a strong lean instead of a certainty."}
      </p>
    );
  }
  const proof = factProof(model.analysis, model.at, fact);
  const label = (step: (typeof proof.steps)[number]) => {
    if (step.by === "perspective") return `Known from ${view}'s own role and reveal`;
    const event = model.analysis.events[step.event];
    const what = event ? describeEvent(event, n, name) : `Event ${step.event + 1}`;
    return step.by === "cards"
      ? `${what} — impossible by the cards`
      : `${what} — breaks “${RULE_INFO[step.by].label}”`;
  };
  return (
    <div className="flex flex-col gap-4">
      <Badge size="sm" tone={fact.certainty === "proven" ? "sky" : "neutral"}>
        {fact.certainty === "proven" ? "Proven by the cards" : "Holds under the assumptions"}
      </Badge>
      <Steps>
        <li>
          Of the {proof.total} possible spy sets, {proof.breaking} would make this false. To
          establish it, every one of them has to be ruled out.
        </li>
        {fact.kind === "at-least" && (
          <li>
            The Resistance can only play Success, so every Fail card came from a spy: a mission with
            f Fails had at least f spies aboard. Any set with fewer spies on that team can't have
            produced it.
          </li>
        )}
        {fact.certainty === "assumed" && (
          <li>
            The cards alone don't settle it — some of these sets were ruled out by an assumption
            (the table's behaviour), not by the rules. Switch the assumption off and the fact may no
            longer hold.
          </li>
        )}
        <li>
          {proof.standing === 0
            ? "All of them are gone — here is what removed them:"
            : `${proof.standing} still stand, so this isn't settled yet.`}
        </li>
      </Steps>
      <ul className="flex flex-col gap-1.5 text-xs text-fg-secondary">
        {proof.steps.map((step) => (
          <li
            key={`${step.event}-${step.by}`}
            className="flex items-start justify-between gap-3 border-t border-line-soft pt-1.5"
          >
            <span>{label(step)}</span>
            <span className="shrink-0 tabular-nums text-fg-primary">−{step.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatBody({
  stat,
  model,
  n,
}: {
  stat: "worlds" | "proven" | "win";
  model: SolverModel;
  n: number;
}) {
  const k = spyCount(n);
  if (stat === "win") {
    return (
      <Steps>
        <li>
          From this point the game is played forward: each remaining mission is run with the team
          the table rates best (tied favourites shared evenly), each spy aboard plays Fail with the
          Solver's usual chance (they can't coordinate, so every Fail count is weighed), and the
          table updates its beliefs from the Fail count before the next mission.
        </li>
        <li>
          For any one seating of the spies that is computed exactly — no random playouts. The solid
          line weighs every seating by how likely the table finds it; the dashed line (once roles
          are known) uses the real one.
        </li>
        <li>
          When the dashed line drops to zero the game is lost on information: the teams the table
          can argue for contain a spy. The decisions just before it are where it was lost.
        </li>
      </Steps>
    );
  }
  const eliminated = (["cards", ...RULE_IDS] as const)
    .map((rule) => [rule, model.analysis.eliminatedBy[rule] ?? 0] as const)
    .filter(([, count]) => count > 0);
  return (
    <div className="flex flex-col gap-4">
      <Steps>
        <li>
          Choosing {k} spies from {n} players gives C({n}, {k}) = {choose(n, k)} spy sets. Exactly
          one of them is the truth.
        </li>
        {stat === "proven" ? (
          <li>
            “Proven possible” keeps only the game's own rule: the Resistance can only play Success,
            so a set is out when some mission drew more Fails than it puts spies on that team.{" "}
            {model.snapshot?.aliveCore ?? 0} survive — nothing about how people behave is assumed.
          </li>
        ) : (
          <li>
            Every event multiplies each set's weight by how likely that event is if the set were
            true. A set whose weight reaches zero — because the cards or an “always” assumption rule
            it out — is gone. {model.snapshot?.alive ?? 0} remain.
          </li>
        )}
      </Steps>
      {stat === "worlds" && eliminated.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-xs text-fg-secondary">
          {eliminated.map(([rule, count]) => (
            <li key={rule} className="flex justify-between gap-3 border-t border-line-soft pt-1.5">
              <span>
                {rule === "cards"
                  ? "The cards (more Fails than spies aboard)"
                  : RULE_INFO[rule].label}
              </span>
              <span className="tabular-nums text-fg-primary">−{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
