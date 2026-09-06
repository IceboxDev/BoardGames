import {
  EXIT_GAMES,
  type ExitDifficulty,
  type ExitGame,
  type ExitSeries,
  exitGameTitle,
} from "@boardgames/core/games/exit-games";
import { useMemo, useState } from "react";
import { Badge, Button } from "./ui";
import { CheckRow } from "./ui/CheckRow";
import type { Tone } from "./ui/tones";

type Props = {
  /** Currently-checked box slugs (may contain non-EXIT slugs; they're ignored). */
  selected: string[];
  /** Called with a box slug when its checkbox is toggled. */
  onToggle: (slug: string) => void;
};

const SERIES_ORDER: { series: ExitSeries; label: string }[] = [
  { series: "main", label: "Main series" },
  { series: "puzzle", label: "Game + Puzzle" },
  { series: "family", label: "Family" },
  { series: "kids", label: "Kids" },
  { series: "advent", label: "Advent calendars" },
  { series: "promo", label: "Promos" },
];

export const EXIT_DIFFICULTY_LABEL: Record<ExitDifficulty, string> = {
  beginner: "Beginner",
  advanced: "Advanced",
  expert: "Expert",
  kids: "Kids",
  family: "Family",
};

export const EXIT_DIFFICULTY_TONE: Record<ExitDifficulty, Tone> = {
  beginner: "emerald",
  advanced: "amber",
  expert: "rose",
  kids: "sky",
  family: "purple",
};

/**
 * The EXIT: The Game box checklist — the ownable boxes that deliberately are
 * NOT catalog entries (see `@boardgames/core/games/exit-games`). Rendered
 * below the catalog `InventoryGrid` in the admin inventory editor; owning any
 * box makes the votable "exit" catalog entry count as owned on game nights.
 * Collapsed by default so 50+ rows don't bury the regular grid.
 */
export default function ExitBoxList({ selected, onToggle }: Props) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const owned = EXIT_GAMES.filter((g) => selectedSet.has(g.slug)).length;
  const [open, setOpen] = useState(owned > 0);

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h3 className="text-2xs font-bold uppercase tracking-pill text-fg-secondary">
          EXIT: The Game — boxes
        </h3>
        <span className="text-3xs tracking-label text-fg-muted">
          {owned} / {EXIT_GAMES.length} owned
        </span>
        <Button variant="link" size="sm" className="ml-auto" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {open && (
        <div className="space-y-4">
          {SERIES_ORDER.map(({ series, label }) => {
            const boxes = EXIT_GAMES.filter((g) => g.series === series);
            if (boxes.length === 0) return null;
            return (
              <div key={series}>
                <h4 className="mb-1.5 px-1 text-3xs font-semibold uppercase tracking-label text-fg-muted">
                  {label}
                </h4>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {boxes.map((g) => (
                    <ExitBoxCell
                      key={g.slug}
                      game={g}
                      checked={selectedSet.has(g.slug)}
                      onToggle={() => onToggle(g.slug)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExitBoxCell({
  game,
  checked,
  onToggle,
}: {
  game: ExitGame;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <CheckRow
      padding="sm"
      checked={checked}
      onChange={onToggle}
      title={exitGameTitle(game)}
      description={
        <>
          {game.year}
          {game.titleEn !== null && ` · ${game.titleDe}`}
        </>
      }
      trailing={
        game.difficulty && (
          <Badge tone={EXIT_DIFFICULTY_TONE[game.difficulty]} shape="pill">
            {EXIT_DIFFICULTY_LABEL[game.difficulty]}
          </Badge>
        )
      }
    />
  );
}
