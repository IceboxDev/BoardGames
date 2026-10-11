import { computeElo } from "@boardgames/core/tournament/elo";
import {
  type BenchmarkResults,
  type BenchmarkTable,
  type HeadToHeadResults,
  headToHead,
  isBenchmark,
  type TournamentResults,
  type TournamentTable,
} from "@boardgames/core/tournament/results";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { MicroLabel } from "../ui/Label";
import { PageHeader } from "../ui/PageHeader";
import { ProgressBar } from "../ui/ProgressBar";
import { SegmentedControl } from "../ui/SegmentedControl";

/** Strategies that actually played at this table, in the results file's order. */
function tableStrategies(results: HeadToHeadResults, table: TournamentTable) {
  const played = new Set(table.matchups.flatMap((m) => [m.a, m.b]));
  return results.strategies.filter((s) => played.has(s.id));
}

/**
 * Read-only results of a locally run AI tournament. A head-to-head file is a
 * matrix: each cell is the row strategy's win rate against the column strategy
 * (draws count half), with the average score gap where the game keeps score,
 * and a ratings column fitted Bradley–Terry over the whole table on an
 * Elo-like scale. A co-op benchmark is one row per strategy: how often a table
 * of it won.
 */
export function TournamentResultsView({
  results,
  onBack,
}: {
  results: TournamentResults;
  onBack: () => void;
}) {
  const sizes = results.tables.map((t) => t.playerCount);
  const [playerCount, setPlayerCount] = useState(sizes[0] ?? 2);
  const generated = new Date(results.generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  let subtitle: string;
  let body: ReactNode;
  if (isBenchmark(results)) {
    const table = results.tables.find((t) => t.playerCount === playerCount) ?? results.tables[0];
    const games = Math.max(0, ...table.runs.map((r) => r.games));
    subtitle = `${games} games per AI · every seat played by the same AI on the same deals · run ${generated}`;
    body = <BenchmarkRows results={results} table={table} />;
  } else {
    const table = results.tables.find((t) => t.playerCount === playerCount) ?? results.tables[0];
    const games = Math.max(0, ...table.matchups.map((m) => m.games));
    subtitle = `${games} games per matchup · sides swap seats on the same deal · run ${generated}`;
    body = <MatchupGrid results={results} table={table} />;
  }

  return (
    // `relative z-raised` lifts the page above the fixed game background image.
    <div className="relative z-raised mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <PageHeader align="center" size="lg" title="AI Tournament" subtitle={subtitle} />

      {sizes.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <MicroLabel>Players</MicroLabel>
          <SegmentedControl
            options={sizes.map((n) => ({ value: n, label: `${n}` }))}
            value={playerCount}
            onChange={setPlayerCount}
            size="xs"
            aria-label="Players per game"
          />
        </div>
      )}

      {body}

      <div className="flex shrink-0 justify-center">
        <Button variant="secondary" size="sm" shape="pill" onClick={onBack}>
          Back to menu
        </Button>
      </div>
    </div>
  );
}

function MatchupGrid({ results, table }: { results: HeadToHeadResults; table: TournamentTable }) {
  const strategies = useMemo(() => tableStrategies(results, table), [results, table]);
  const ratings = useMemo(
    () =>
      computeElo(
        table.matchups.map((m) => ({ strategyA: m.a, strategyB: m.b, ...m })),
        strategies.map((s) => s.id),
      ),
    [table, strategies],
  );
  // Matchup columns never shrink below a readable cell: on a phone the table
  // scrolls sideways (the wrapper is overflow-x-auto) instead of crushing
  // every percentage into its neighbour.
  const columns = {
    gridTemplateColumns: `3.5rem 8rem repeat(${strategies.length}, minmax(5.5rem, 1fr))`,
  };

  return (
    <div className="flex w-full flex-1 flex-col overflow-x-auto text-sm">
      <div className="grid h-10 shrink-0 items-center border-b border-line" style={columns}>
        <MicroLabel className="text-center">Rating</MicroLabel>
        <MicroLabel className="px-2">Row vs column</MicroLabel>
        {strategies.map((col) => (
          <MicroLabel key={col.id} className="px-1 text-center">
            <span className="line-clamp-2">{col.label}</span>
          </MicroLabel>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${strategies.length}, minmax(3.5rem, 1fr))` }}
      >
        {strategies.map((row) => (
          <div key={row.id} className="grid min-h-0 items-stretch" style={columns}>
            <div className="flex items-center justify-center border-b border-line text-xs font-semibold tabular-nums text-fg-strong">
              {Math.round(ratings.get(row.id) ?? 1500)}
            </div>
            <div className="flex min-w-0 items-center border-b border-line px-2">
              <span
                className="line-clamp-2 text-sm font-semibold leading-snug text-fg-strong"
                title={row.label}
              >
                {row.label}
              </span>
            </div>
            {strategies.map((col) => (
              <MatchupCell key={col.id} table={table} row={row.id} col={col.id} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One row per strategy that played this table size, in the file's order: the
 * table's win rate as a meter, the record, and the mean score where kept.
 */
function BenchmarkRows({ results, table }: { results: BenchmarkResults; table: BenchmarkTable }) {
  const label = (id: string) => results.strategies.find((s) => s.id === id)?.label ?? id;
  const scored = table.runs.some((r) => r.avgScore !== null);
  const columns = {
    gridTemplateColumns: `minmax(8rem, 1fr) minmax(8rem, 2fr) 5.5rem${scored ? " 5.5rem" : ""}`,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col overflow-x-auto text-sm">
      <div className="grid h-10 shrink-0 items-center gap-3 border-b border-line" style={columns}>
        <MicroLabel className="px-2">AI at every seat</MicroLabel>
        <MicroLabel>Win rate</MicroLabel>
        <MicroLabel className="text-center">Won</MicroLabel>
        {scored && <MicroLabel className="text-center">Avg score</MicroLabel>}
      </div>
      {table.runs.map((run) => {
        const rate = run.wins / run.games;
        return (
          <div
            key={run.strategy}
            className="grid min-h-14 items-center gap-3 border-b border-line"
            style={columns}
          >
            <span
              className="line-clamp-2 px-2 text-sm font-semibold leading-snug text-fg-strong"
              title={label(run.strategy)}
            >
              {label(run.strategy)}
            </span>
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`w-14 shrink-0 text-sm font-bold tabular-nums ${rate >= 0.5 ? "text-emerald-400" : "text-rose-400"}`}
              >
                {(rate * 100).toFixed(1)}%
              </span>
              <ProgressBar
                value={rate}
                tone={rate >= 0.5 ? "emerald" : "rose"}
                label={`${label(run.strategy)} win rate`}
                animate={false}
              />
            </div>
            <span className="text-center text-xs tabular-nums text-fg-secondary">
              {run.wins} / {run.games}
            </span>
            {scored && (
              <span className="text-center text-xs tabular-nums text-fg-muted">
                {run.avgScore ?? "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchupCell({ table, row, col }: { table: TournamentTable; row: string; col: string }) {
  if (row === col) {
    return (
      <div className="flex items-center justify-center border-b border-line text-fg-disabled">
        —
      </div>
    );
  }
  const h2h = headToHead(table, row, col);
  if (!h2h) {
    return (
      <div className="flex items-center justify-center border-b border-line text-3xs text-fg-disabled">
        not played
      </div>
    );
  }
  const pct = h2h.winRate * 100;
  return (
    <div className="flex flex-col items-center justify-center border-b border-line leading-snug">
      <span
        className={`text-sm font-bold tabular-nums ${pct >= 50 ? "text-emerald-400" : "text-rose-400"}`}
      >
        {pct.toFixed(1)}%
      </span>
      {h2h.scoreDiff !== null && (
        <span className="text-3xs tabular-nums text-fg-muted">
          avg {h2h.scoreDiff > 0 ? "+" : ""}
          {h2h.scoreDiff}
        </span>
      )}
      <span className="text-3xs text-fg-disabled">{h2h.games} games</span>
    </div>
  );
}
