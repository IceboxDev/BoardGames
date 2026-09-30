import type { ResistanceRecord } from "@boardgames/core/games/the-resistance/record";
import { failsNeeded, teamSize } from "@boardgames/core/games/the-resistance/rules";
import { type ReactNode, useMemo, useState } from "react";
import { Eyebrow, Select, StatTile, Surface } from "../../../../components/ui";
import { LineChart } from "../../../../components/ui/charts";
import { type PerspectiveOption, pct, seatNamer, useAssumptions } from "../../logic/solver";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { Deductions } from "./Deductions";
import { Misplays } from "./Misplays";
import { PairMatrix } from "./PairMatrix";
import { SpyBars } from "./SpyBars";
import { Timeline } from "./Timeline";
import { useSolverModel } from "./useSolverModel";

interface SolverDashboardProps {
  record: ResistanceRecord;
  /** Perspectives to offer; the first is the default. */
  perspectives: readonly PerspectiveOption[];
  /** Title row (name, back button, actions). */
  header?: ReactNode;
  /** Manual entry: shown above the analysis, and pins the timeline to "now". */
  entry?: ReactNode;
}

function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Surface variant="raised" padding="lg" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow size="md">{title}</Eyebrow>
        {aside}
      </div>
      {children}
    </Surface>
  );
}

/**
 * The Solver: exact inference over every possible set of spies, scrubbable
 * event by event, from any perspective the record allows.
 */
export function SolverDashboard({ record, perspectives, header, entry }: SolverDashboardProps) {
  const [assumptions, setAssumptions] = useAssumptions();
  const [perspectiveId, setPerspectiveId] = useState(perspectives[0]?.id ?? "public");
  const [cursor, setCursor] = useState<number | null>(null);
  const name = useMemo(() => seatNamer(record.names), [record.names]);
  const option = perspectives.find((p) => p.id === perspectiveId) ?? perspectives[0];
  const perspective = useMemo(() => option?.perspective ?? { kind: "public" as const }, [option]);

  const m = useSolverModel(record, assumptions, perspective, entry ? null : cursor, name);
  const n = record.playerCount;
  const current = m.analysis.events[m.at - 1];
  const nextMission = m.onTable?.mission ?? m.position.openMissions[0] ?? 0;
  const roles = perspective.kind === "omniscient" || m.position.winner ? record.roles : null;
  const winNow = m.winCurve.filter((p) => p.count <= m.at).at(-1);

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,21rem)]">
        {/* Left rail — perspective + timeline (last on a phone: the analysis leads) */}
        <div className="order-3 flex flex-col gap-4 lg:order-1">
          <Panel title="Seen by">
            <Select
              size="sm"
              aria-label="Perspective"
              value={option?.id ?? "public"}
              onChange={(e) => setPerspectiveId(e.target.value)}
            >
              {perspectives.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <p className="text-2xs text-fg-muted">
              {perspective.kind === "public"
                ? "Only what the whole table saw."
                : perspective.kind === "omniscient"
                  ? "The real roles — every world but the true one is gone."
                  : `What ${name(perspective.seat)} knew: their own role${perspective.knownSpies.length > 1 ? " and their fellow spies" : ""}.`}
            </p>
          </Panel>
          <Panel title="Timeline">
            <Timeline
              events={m.analysis.events}
              playerCount={n}
              name={name}
              at={m.at}
              onSeek={(count) => setCursor(count >= m.analysis.events.length ? null : count)}
            />
          </Panel>
        </div>

        {/* Centre — the state of the deduction */}
        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              variant="tile"
              size="lg"
              label="Missions"
              value={
                <span>
                  <span className="text-sky-400">{m.position.successes}</span>
                  <span className="text-fg-muted"> – </span>
                  <span className="text-rose-400">{m.position.fails}</span>
                </span>
              }
              sub={`${m.position.rejections}/5 rejected`}
            />
            <StatTile
              variant="tile"
              size="lg"
              label="Possible spy sets"
              value={m.snapshot?.alive ?? 0}
              sub={`of ${m.analysis.worlds.length}`}
            />
            <StatTile
              variant="tile"
              size="lg"
              label="Proven possible"
              value={m.snapshot?.aliveCore ?? 0}
              sub="by the cards alone"
            />
            <StatTile
              variant="tile"
              size="lg"
              label="Resistance wins"
              tone={winNow && winNow.y >= 50 ? "sky" : "rose"}
              value={winNow ? `${Math.round(winNow.y)}%` : "—"}
              sub="model estimate"
            />
          </div>

          {entry}

          <Panel
            title="Who are the spies?"
            aside={
              current && (
                <span className="text-2xs text-fg-muted">after round {current.round + 1}</span>
              )
            }
          >
            {m.snapshot && (
              <SpyBars
                snapshot={m.snapshot}
                name={name}
                highlight={m.onTable?.team ?? []}
                roles={roles}
              />
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Deductions">
              <Deductions items={m.facts} />
            </Panel>
            <Panel title={m.onTable ? "Team on the table" : "Best teams"}>
              {m.tableOdds ? (
                <TeamLine
                  team={m.tableOdds.team.map(name).join(", ")}
                  pSuccess={m.tableOdds.pSuccess}
                  pClean={m.tableOdds.pClean}
                />
              ) : m.suggestions.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  <li className="text-2xs text-fg-muted">
                    {name(m.position.leader)} leads mission {nextMission + 1} ·{" "}
                    {teamSize(n, nextMission)} players
                    {failsNeeded(n, nextMission) > 1 ? " · needs 2 fails" : ""}
                  </li>
                  {m.suggestions.map((t) => (
                    <li key={`${t.mission}-${t.team.join()}`}>
                      <TeamLine
                        team={t.team.map(name).join(", ")}
                        pSuccess={t.pSuccess}
                        pClean={t.pClean}
                        mission={record.variants.targeting ? t.mission : undefined}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-muted">
                  {m.position.winner ? "The game is over." : "Nothing to suggest yet."}
                </p>
              )}
            </Panel>
          </div>

          <Panel title="Spy pairs">
            <PairMatrix pairs={m.pairs} name={name} />
          </Panel>
        </div>

        {/* Right rail — judgement */}
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-3">
          <Panel title="Misplays">
            <Misplays
              decisions={m.graded.filter((d) => d.eventIndex < m.at)}
              name={name}
              current={current?.index}
              onSelect={entry ? undefined : (index) => setCursor(index + 1)}
            />
          </Panel>
          <Panel title="Resistance win chance">
            <LineChart
              data={m.winCurve.filter((p) => p.count <= m.at).map((p) => ({ x: p.x, y: p.y }))}
              yDomain={[0, 100]}
              formatY={(v) => `${Math.round(v)}%`}
              tone="sky"
              height={160}
            />
          </Panel>
          <Panel title="Assumptions">
            <AssumptionsPanel
              assumptions={assumptions}
              onChange={setAssumptions}
              blindSpies={record.variants.blindSpies}
              eliminated={m.analysis.eliminatedBy}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TeamLine({
  team,
  pSuccess,
  pClean,
  mission,
}: {
  team: string;
  pSuccess: number;
  pClean: number;
  mission?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="min-w-0 truncate text-fg-primary">
        {mission !== undefined && <span className="text-fg-muted">M{mission + 1} · </span>}
        {team}
      </span>
      <span className="shrink-0 tabular-nums text-fg-secondary">
        <span className="text-sky-400">{pct(pSuccess)}</span> succeeds · {pct(pClean)} clean
      </span>
    </div>
  );
}
