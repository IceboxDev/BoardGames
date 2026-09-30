import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type CSSProperties, useId, useMemo, useState } from "react";
import { games } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import { cn } from "../../lib/cn";
import { isTeamGame } from "../../lib/teams";
import { CheckIcon, SearchIcon } from "../icons";
import { Badge, Button, MicroLabel, SearchInput, Surface } from "../ui";

// Which game the teams are for. Tonight's lineup sits in a thumb-sized strip
// (the vote winner first); any other game is one tap away in an inline
// search — inline, not a sheet, because the mixer already lives inside the
// night's modal and a dialog on a dialog loses the phone's back gesture.

type Props = {
  /** Tonight's lineup, best first (the night's `topSlugs`). */
  lineup: readonly string[];
  value: string | null;
  onChange: (slug: string) => void;
};

const BY_SLUG = new Map(games.map((g) => [g.slug, g]));

/** Every game, team games first, then A–Z. */
const ALL = [...games].sort((a, b) => {
  const ta = isTeamGame(a.slug, a.bgg.mechanics) ? 0 : 1;
  const tb = isTeamGame(b.slug, b.bgg.mechanics) ? 0 : 1;
  return ta - tb || a.title.localeCompare(b.title);
});

const accent = (g: GameDefinition) => ({ "--accent": g.accentHex }) as CSSProperties;

export function TeamGamePicker({ lineup, value, onChange }: Props) {
  const reduceMotion = useReducedMotion();
  const labelId = useId();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const strip = useMemo(() => {
    const list = lineup.map((s) => BY_SLUG.get(s)).filter((g): g is GameDefinition => !!g);
    // A game picked from the search joins the strip, so the choice stays visible.
    const picked = value ? BY_SLUG.get(value) : undefined;
    if (picked && !list.includes(picked)) list.push(picked);
    return list;
  }, [lineup, value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? ALL : ALL.filter((g) => g.title.toLowerCase().includes(q));
  }, [query]);

  const pick = (slug: string) => {
    onChange(slug);
    setSearching(false);
    setQuery("");
  };

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <MicroLabel id={labelId}>Balanced for</MicroLabel>
        {lineup.length > 0 && (
          <span className="text-3xs text-fg-muted">tonight's lineup · or any game</span>
        )}
      </div>

      <ul className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {strip.map((g, i) => {
          const on = g.slug === value;
          return (
            <li key={g.slug} className="w-28 shrink-0 snap-start sm:w-32">
              <Button
                variant="plain"
                bleed
                align="start"
                onClick={() => onChange(g.slug)}
                aria-pressed={on}
                title={g.title}
                style={accent(g)}
                className={cn(
                  "group flex-col items-stretch gap-1.5 rounded-card-md p-1 text-left transition",
                  on
                    ? "bg-fill ring-2 ring-[var(--accent)]"
                    : "ring-1 ring-line hover:bg-fill-soft",
                )}
              >
                <span className="relative block overflow-hidden rounded-card-md">
                  <img
                    src={g.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "aspect-video w-full object-cover transition",
                      !on && "opacity-80 saturate-75 group-hover:opacity-100",
                    )}
                  />
                  {on && (
                    <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  )}
                  {i === 0 && lineup[0] === g.slug && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-surface-950/80 px-1.5 py-px text-3xs font-semibold text-fg-strong">
                      Top pick
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 px-0.5 text-2xs leading-tight",
                    on ? "font-semibold text-fg-strong" : "text-fg-secondary",
                  )}
                >
                  {g.title}
                </span>
              </Button>
            </li>
          );
        })}
        <li className="w-28 shrink-0 snap-start sm:w-32">
          <Button
            variant="plain"
            bleed
            onClick={() => setSearching((s) => !s)}
            aria-expanded={searching}
            className={cn(
              "flex-col gap-1.5 rounded-card-md border border-dashed p-1 text-center transition",
              searching ? "border-accent-400 bg-fill" : "border-line-strong hover:bg-fill-soft",
            )}
          >
            <span className="flex aspect-video w-full items-center justify-center rounded-card-md bg-fill-soft">
              <SearchIcon className="h-5 w-5 text-fg-muted" />
            </span>
            <span className="px-0.5 text-2xs text-fg-secondary">Other game</span>
          </Button>
        </li>
      </ul>

      <AnimatePresence initial={false}>
        {searching && (
          <motion.div
            key="search"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Surface variant="panel" padding="sm" className="flex flex-col gap-2">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all games"
                aria-label="Search games"
                autoFocus
              />
              <ul className="scrollbar-thin flex max-h-64 flex-col overflow-y-auto">
                {results.map((g) => (
                  <li key={g.slug}>
                    <Button
                      variant="plain"
                      bleed
                      align="start"
                      onClick={() => pick(g.slug)}
                      className="flex items-center gap-2.5 rounded-ui-md px-1.5 py-1.5 text-left hover:bg-fill-soft"
                    >
                      <img
                        src={g.thumbnail}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-video w-12 shrink-0 rounded-card-md object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
                        {g.title}
                      </span>
                      {isTeamGame(g.slug, g.bgg.mechanics) && (
                        <Badge tone="sky" size="xs" shape="pill">
                          Teams
                        </Badge>
                      )}
                      {g.slug === value && <CheckIcon className="h-4 w-4 text-accent-300" />}
                    </Button>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="px-2 py-3 text-center text-xs text-fg-muted">
                    No game by that name
                  </li>
                )}
              </ul>
            </Surface>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
