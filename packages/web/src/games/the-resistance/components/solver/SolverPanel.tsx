import { failsNeeded } from "@boardgames/core/games/the-resistance/rules";
import type { Perspective } from "@boardgames/core/games/the-resistance/solver/posterior";
import type { ResistancePlayerView } from "@boardgames/core/games/the-resistance/types";
import { useMemo, useState } from "react";
import { Eyebrow } from "../../../../components/ui";
import { pct, seatNamer, useAssumptions } from "../../logic/solver";
import { Deductions } from "./Deductions";
import { ExplainModal, type ExplainTarget } from "./explain/ExplainModal";
import { ExplainRow } from "./explain/ExplainRow";
import { SpyBars } from "./SpyBars";
import { useSolverModel } from "./useSolverModel";

const PUBLIC: Perspective = { kind: "public" };

/**
 * The live Solver in the game's left rail: this seat's own view only — its
 * role, the spies it knows, and what the whole table saw. A spy also sees
 * how suspicious the table finds it.
 */
export function SolverPanel({
  view,
  names,
}: {
  view: ResistancePlayerView;
  names: readonly string[];
}) {
  const [assumptions] = useAssumptions();
  const name = useMemo(() => seatNamer(names), [names]);
  const perspective = useMemo((): Perspective => {
    if (!view.role) return { kind: "public" };
    return { kind: "seat", seat: view.seat, role: view.role, knownSpies: view.knownSpies };
  }, [view.role, view.seat, view.knownSpies]);
  const mine = useSolverModel(view.record, assumptions, perspective, null, name, false);
  const table = useSolverModel(view.record, assumptions, PUBLIC, null, name, false);
  const iAmSpy = view.role === "spy";
  const myLeadership = view.phase === "proposing" && view.leader === view.seat;
  const best = mine.suggestions[0];
  const [explain, setExplain] = useState<ExplainTarget | null>(null);
  // A spy's own view is trivial (they know the answer) — explain the table's.
  const shown = iAmSpy ? table : mine;

  return (
    <div className="flex flex-col gap-4">
      {explain && (
        <ExplainModal
          target={explain}
          model={shown}
          name={name}
          perspectiveLabel={iAmSpy ? "Table" : "You"}
          onClose={() => setExplain(null)}
        />
      )}
      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">{iAmSpy ? "What the table thinks" : "Spy odds (your view)"}</Eyebrow>
        {(iAmSpy ? table.snapshot : mine.snapshot) && (
          <SpyBars
            snapshot={iAmSpy ? table.snapshot : mine.snapshot}
            name={name}
            highlight={mine.onTable?.team ?? []}
            compact
            onExplain={(seat) => setExplain({ kind: "seat", seat })}
          />
        )}
        <p className="text-2xs text-fg-muted">
          {(iAmSpy ? table.snapshot : mine.snapshot)?.alive ?? 0} possible spy sets
          {iAmSpy && ` · you look ${pct(table.snapshot?.pSpy[view.seat] ?? 0)} likely`}
        </p>
      </section>

      {mine.tableOdds && !iAmSpy && (
        <section className="flex flex-col gap-1">
          <Eyebrow size="sm">This team</Eyebrow>
          <ExplainRow
            onClick={() =>
              mine.tableOdds &&
              setExplain({
                kind: "team",
                team: mine.tableOdds.team,
                mission: mine.tableOdds.mission,
              })
            }
            label="Explain this team's odds"
            className="text-xs text-fg-secondary"
          >
            Table: <span className="text-sky-400">{pct(mine.tableOdds.pSuccess)}</span> to succeed ·{" "}
            {pct(mine.tableOdds.pClean)} clean
            {failsNeeded(view.playerCount, mine.tableOdds.mission) > 1 && " · needs 2 fails"}
            {mine.myOdds && (
              <span className="block text-2xs text-fg-muted">
                You privately: {pct(mine.myOdds.pSuccess)} to succeed
              </span>
            )}
          </ExplainRow>
        </section>
      )}

      {myLeadership && best && !iAmSpy && (
        <section className="flex flex-col gap-1">
          <Eyebrow size="sm">Best team you can argue for</Eyebrow>
          <ExplainRow
            onClick={() => setExplain({ kind: "team", team: best.team, mission: best.mission })}
            label="Explain the best team"
          >
            <span className="block text-xs text-fg-primary">{best.team.map(name).join(", ")}</span>
            <span className="block text-2xs text-fg-muted">
              {pct(best.pSuccess)} to succeed by the table's view — what you know about yourself
              can't be proven to them
            </span>
          </ExplainRow>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">{iAmSpy ? "What the table can prove" : "Deductions"}</Eyebrow>
        <Deductions
          items={shown.facts}
          limit={6}
          onExplain={(fact) => setExplain({ kind: "fact", fact })}
        />
      </section>
    </div>
  );
}
