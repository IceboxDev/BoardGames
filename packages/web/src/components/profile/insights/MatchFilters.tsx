import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { Chip } from "../../ui/Chip.tsx";
import { SegmentedControl } from "../../ui/SegmentedControl.tsx";
import {
  gamesByPlays,
  type ResultFilter,
  type SummaryFilters,
  summaryYears,
} from "./summary-stats.ts";

// Filter bar driving the month chart + timeline: result segment, year chips
// (only when the history spans more than one year), and the top games as
// thumbnail chips in a horizontally scrollable row.

const RESULT_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "other", label: "Other" },
];

const TOP_GAME_CHIPS = 8;

export function MatchFilters({
  items,
  filters,
  onChange,
}: {
  items: readonly ProfileMatchSummaryItem[];
  filters: SummaryFilters;
  onChange: (filters: SummaryFilters) => void;
}) {
  const years = summaryYears(items);
  const topGames = gamesByPlays(items).slice(0, TOP_GAME_CHIPS);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<ResultFilter>
          aria-label="Filter by result"
          options={RESULT_OPTIONS}
          value={filters.result}
          onChange={(result) => onChange({ ...filters, result })}
          size="sm"
          shape="pill"
        />
        {years.length > 1 &&
          years.map((year) => (
            <Chip
              key={year}
              pressed={filters.year === year}
              onClick={() => onChange({ ...filters, year: filters.year === year ? null : year })}
            >
              {year}
            </Chip>
          ))}
      </div>
      {topGames.length > 1 && (
        // -m/p pair: give the scroll container breathing room so chip rings and
        // hover states don't get clipped at its edges; scrollbar hidden — the
        // row still scrolls by touch/wheel and every game is reachable via the
        // chips themselves.
        <div className="-m-1 flex items-center gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            pressed={filters.gameSlug === null}
            onClick={() => onChange({ ...filters, gameSlug: null })}
            className="shrink-0 whitespace-nowrap"
          >
            All games
          </Chip>
          {topGames.map((g) => {
            const thumb = resolveGame(g.slug)?.thumbnail;
            return (
              <Chip
                key={g.slug}
                pressed={filters.gameSlug === g.slug}
                onClick={() =>
                  onChange({ ...filters, gameSlug: filters.gameSlug === g.slug ? null : g.slug })
                }
                className="shrink-0"
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {thumb && <img src={thumb} alt="" className="h-4 w-7 rounded-sm object-cover" />}
                  {g.title}
                </span>
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}
