import { computeElo } from "@boardgames/core/tournament/elo";
import {
  headToHead,
  type TournamentResults,
  type TournamentTable,
} from "@boardgames/core/tournament/results";
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { MicroLabel } from "../ui/Label";
import { PageHeader } from "../ui/PageHeader";
import { SegmentedControl } from "../ui/SegmentedControl";

/** Strategies that actually played at this table, in the results file's order. */
function tableStrategies(results: TournamentResults, table: TournamentTable) {
  const played = new Set(table.matchups.flatMap((m) => [m.a, m.b]));
  return results.strategies.filter((s) => played.has(s.id));
}

/**
 * Read-only matrix of a locally run AI tournament: each cell is the row
 * strategy's win rate against the column strategy (draws count half), with the
 * average score gap where the game keeps score. The ratings column is a
 * Bradley–Terry fit over the whole table, on an Elo-like scale.
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
  const table = results.tables.find((t) => t.playerCount === playerCount) ?? results.tables[0];
  const strategies = useMemo(() => tableStrategies(results, table), [results, table]);
  const ratings = useMemo(
    () =>
      computeElo(
        table.matchups.map((m) => ({ strategyA: m.a, strategyB: m.b, ...m })),
        strategies.map((s) => s.id),
      ),
    [table, strategies],
  );
  const gamesPerMatchup = Math.max(0, ...table.matchups.map((m) => m.games));
  const generated = new Date(results.generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const columns = { gridTemplateColumns: `3.5rem 10rem repeat(${strategies.length}, 1fr)` };

  return (
    // `relative z-raised` lifts the page above the fixed game background image.
    <div className="relative z-raised mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <PageHeader
        align="center"
        size="lg"
        title="AI Tournament"
        subtitle={`${gamesPerMatchup} games per matchup · sides swap seats on the same deal · run ${generated}`}
      />

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

      <div className="flex shrink-0 justify-center">
        <Button variant="secondary" size="sm" shape="pill" onClick={onBack}>
          Back to menu
        </Button>
      </div>
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
