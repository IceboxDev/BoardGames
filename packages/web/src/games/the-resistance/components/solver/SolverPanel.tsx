import { failsNeeded } from "@boardgames/core/games/the-resistance/rules";
import type { Perspective } from "@boardgames/core/games/the-resistance/solver/posterior";
import type { ResistancePlayerView } from "@boardgames/core/games/the-resistance/types";
import { useMemo } from "react";
import { Eyebrow } from "../../../../components/ui";
import { pct, seatNamer, useAssumptions } from "../../logic/solver";
import { Deductions } from "./Deductions";
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

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">{iAmSpy ? "What the table thinks" : "Spy odds (your view)"}</Eyebrow>
        {(iAmSpy ? table.snapshot : mine.snapshot) && (
          <SpyBars
            snapshot={iAmSpy ? table.snapshot : mine.snapshot}
            name={name}
            highlight={mine.onTable?.team ?? []}
            compact
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
          <p className="text-xs text-fg-secondary">
            <span className="text-sky-400">{pct(mine.tableOdds.pSuccess)}</span> to succeed ·{" "}
            {pct(mine.tableOdds.pClean)} clean
            {failsNeeded(view.playerCount, mine.tableOdds.mission) > 1 && " · needs 2 fails"}
          </p>
        </section>
      )}

      {myLeadership && best && !iAmSpy && (
        <section className="flex flex-col gap-1">
          <Eyebrow size="sm">Best team for you</Eyebrow>
          <p className="text-xs text-fg-primary">{best.team.map(name).join(", ")}</p>
          <p className="text-2xs text-fg-muted">{pct(best.pSuccess)} to succeed</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Eyebrow size="sm">{iAmSpy ? "What the table can prove" : "Deductions"}</Eyebrow>
        <Deductions items={iAmSpy ? table.facts : mine.facts} limit={6} />
      </section>
    </div>
  );
}
