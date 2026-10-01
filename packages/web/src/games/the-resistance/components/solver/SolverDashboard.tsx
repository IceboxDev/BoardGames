import type { ResistanceRecord } from "@boardgames/core/games/the-resistance/record";
import { failsNeeded, teamSize } from "@boardgames/core/games/the-resistance/rules";
import { describeEvent } from "@boardgames/core/games/the-resistance/solver/explain";
import type { SolverEvent } from "@boardgames/core/games/the-resistance/solver/posterior";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Eyebrow, Select, StatTile, Surface } from "../../../../components/ui";
import { LineChart } from "../../../../components/ui/charts";
import { type PerspectiveOption, pct, seatNamer, useAssumptions } from "../../logic/solver";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { Deductions } from "./Deductions";
import { ExplainModal, type ExplainTarget } from "./explain/ExplainModal";
import { ExplainRow } from "./explain/ExplainRow";
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
  /** Manual entry: shown above the analysis while the timeline is at "now". */
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
  const [explain, setExplain] = useState<ExplainTarget | null>(null);
  const name = useMemo(() => seatNamer(record.names), [record.names]);
  const option = perspectives.find((p) => p.id === perspectiveId) ?? perspectives[0];
  const perspective = useMemo(() => option?.perspective ?? { kind: "public" as const }, [option]);

  const m = useSolverModel(record, assumptions, perspective, cursor, name);
  const eventCount = m.analysis.events.length;
  const seek = useCallback(
    (count: number) => setCursor(count >= eventCount ? null : Math.max(0, count)),
    [eventCount],
  );

  // ← / → step through the game one event at a time (not while typing, and
  // not behind an open explanation).
  useEffect(() => {
    if (explain) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      const now = cursor ?? eventCount;
      seek(e.key === "ArrowLeft" ? now - 1 : now + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [explain, cursor, eventCount, seek]);
  const n = record.playerCount;
  const current = m.analysis.events[m.at - 1];
  const nextMission = m.onTable?.mission ?? m.position.openMissions[0] ?? 0;
  const roles = perspective.kind === "omniscient" || m.position.winner ? record.roles : null;
  const winNow = m.winCurve.filter((p) => p.count <= m.at).at(-1);

  return (
    <div className="flex flex-col gap-4">
      {header}
      <p className="text-2xs text-fg-muted">
        Tap any odds, fact, team or misplay to see how it's worked out.
      </p>
      {explain && (
        <ExplainModal
          target={explain}
          model={m}
          name={name}
          perspectiveLabel={option?.label ?? "Table"}
          onClose={() => setExplain(null)}
          onJump={seek}
        />
      )}
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
              onSeek={seek}
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
            <ExplainRow
              onClick={() => setExplain({ kind: "stat", stat: "worlds" })}
              label="Explain possible spy sets"
              className="mx-0 w-full p-0"
            >
              <StatTile
                variant="tile"
                size="lg"
                label="Possible spy sets"
                value={m.snapshot?.alive ?? 0}
                sub={`of ${m.analysis.worlds.length}`}
              />
            </ExplainRow>
            <ExplainRow
              onClick={() => setExplain({ kind: "stat", stat: "proven" })}
              label="Explain proven possible"
              className="mx-0 w-full p-0"
            >
              <StatTile
                variant="tile"
                size="lg"
                label="Proven possible"
                value={m.snapshot?.aliveCore ?? 0}
                sub="by the cards alone"
              />
            </ExplainRow>
            <ExplainRow
              onClick={() => setExplain({ kind: "stat", stat: "win" })}
              label="Explain the win chance"
              className="mx-0 w-full p-0"
            >
              <StatTile
                variant="tile"
                size="lg"
                label="Resistance wins"
                tone={winNow && winNow.y >= 50 ? "sky" : "rose"}
                value={winNow ? `${Math.round(winNow.y)}%` : "—"}
                sub={
                  winNow?.truth != null
                    ? `${Math.round(winNow.truth)}% with the real roles`
                    : "if the table plays on"
                }
              />
            </ExplainRow>
          </div>

          {entry &&
            (cursor === null ? (
              entry
            ) : (
              <Surface
                variant="raised"
                padding="lg"
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-xs text-fg-secondary">
                  Looking back at event {cursor} of {eventCount} — entry continues from the latest
                  event.
                </span>
                <Button size="sm" variant="secondary" onClick={() => setCursor(null)}>
                  Back to now
                </Button>
              </Surface>
            ))}

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
                onExplain={(seat) => setExplain({ kind: "seat", seat })}
              />
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Deductions">
              <Deductions
                items={m.facts}
                onExplain={(fact) => setExplain({ kind: "fact", fact })}
              />
            </Panel>
            <Panel title={m.onTable ? "Team on the table" : "Best teams"}>
              <p className="text-2xs text-fg-muted">
                By the table's view — a team has to win a vote, and nobody can prove their own role.
              </p>
              {m.tableOdds ? (
                <>
                  <TeamLine
                    team={m.tableOdds.team.map(name).join(", ")}
                    pSuccess={m.tableOdds.pSuccess}
                    pClean={m.tableOdds.pClean}
                    onExplain={() =>
                      m.tableOdds &&
                      setExplain({
                        kind: "team",
                        team: m.tableOdds.team,
                        mission: m.tableOdds.mission,
                      })
                    }
                  />
                  {m.myOdds && (
                    <p className="text-2xs text-fg-muted">
                      {option?.label} privately: {pct(m.myOdds.pSuccess)} succeeds ·{" "}
                      {pct(m.myOdds.pClean)} clean
                    </p>
                  )}
                </>
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
                        onExplain={() =>
                          setExplain({ kind: "team", team: t.team, mission: t.mission })
                        }
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
          {m.informationLoss && m.informationLoss.to <= m.at && (
            <Surface
              variant="raised"
              padding="lg"
              className="flex flex-col gap-2 border-rose-500/40"
            >
              <Eyebrow size="md" tone="rose">
                Lost on information
              </Eyebrow>
              <p className="text-xs text-fg-secondary">
                {lossText(m.analysis.events, m.informationLoss, n, name)}
              </p>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => seek(m.informationLoss?.from ?? 0)}
              >
                Show where
              </Button>
            </Surface>
          )}
          <Panel title="Misplays">
            <Misplays
              decisions={m.graded.filter((d) => d.eventIndex < m.at)}
              name={name}
              current={current?.index}
              rolesKnown={!!record.roles}
              onExplain={(decision) => setExplain({ kind: "decision", decision })}
            />
          </Panel>
          <Panel title="Resistance win chance">
            <ExplainRow
              onClick={() => setExplain({ kind: "stat", stat: "win" })}
              label="Explain the win chance"
              className="text-2xs text-fg-muted"
            >
              How is this estimated?
            </ExplainRow>
            <LineChart
              data={m.winCurve.filter((p) => p.count <= m.at).map((p) => ({ x: p.x, y: p.y }))}
              rollingAvgData={
                record.roles
                  ? m.winCurve
                      .filter((p) => p.count <= m.at && p.truth !== null)
                      .map((p) => ({ x: p.x, y: p.truth ?? 0 }))
                  : undefined
              }
              yDomain={[0, 100]}
              formatY={(v) => `${Math.round(v)}%`}
              tone="sky"
              height={160}
            />
            <p className="text-2xs text-fg-muted">
              Solid: by the table's view before each proposal
              {record.roles ? " · dashed: with the real roles" : ""}.
            </p>
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

function lossText(
  events: readonly SolverEvent[],
  loss: { from: number; to: number; before: number; value: number },
  n: number,
  name: (seat: number) => string,
): string {
  const between = events.slice(loss.from, loss.to);
  const mission = between.find((e) => e.kind === "mission");
  const where = mission
    ? describeEvent(mission, n, name)
    : between[0]
      ? describeEvent(between[0], n, name)
      : "this stretch";
  return `Lost at ${where}. With the real roles, the table's best play won ${Math.round(loss.before)}% before it and ${Math.round(loss.value)}% after: from there, the teams the table can argue for carry a spy. The proposal and votes that sent this team are where the game was lost — see the misplays for that round.`;
}

function TeamLine({
  team,
  pSuccess,
  pClean,
  mission,
  onExplain,
}: {
  team: string;
  pSuccess: number;
  pClean: number;
  mission?: number;
  onExplain: () => void;
}) {
  return (
    <ExplainRow
      onClick={onExplain}
      label={`Explain the odds of ${team}`}
      className="flex items-center justify-between gap-3 text-xs"
    >
      <span className="min-w-0 truncate text-fg-primary">
        {mission !== undefined && <span className="text-fg-muted">M{mission + 1} · </span>}
        {team}
      </span>
      <span className="shrink-0 tabular-nums text-fg-secondary">
        <span className="text-sky-400">{pct(pSuccess)}</span> succeeds · {pct(pClean)} clean
      </span>
    </ExplainRow>
  );
}
