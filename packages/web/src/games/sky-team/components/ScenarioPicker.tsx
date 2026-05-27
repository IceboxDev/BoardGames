import { ROUTE_ORDER, ROUTE_THEMES, SCENARIO_CARDS, type ScenarioCard } from "../scenarios";

interface Props {
  /** Slug of the currently-selected scenario card. */
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

/**
 * Airport gallery. Renders the four difficulty groups as side-by-side
 * columns so the entire scenario palette is visible at once. Each column
 * fills its allotted height — cards stretch to share the column's vertical
 * space evenly, so the screen never has a tiny gallery floating in empty
 * space. Cards without a `backendId` are preview-only.
 */
export default function ScenarioPicker({ selectedSlug, onSelect }: Props) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-3 md:grid-cols-4">
      {ROUTE_ORDER.map((color) => {
        const theme = ROUTE_THEMES[color];
        const cards = SCENARIO_CARDS.filter((s) => s.airportColor === color);
        return (
          <section
            key={color}
            className="flex min-h-0 flex-col gap-2 rounded-2xl border border-gray-800/80 bg-gray-900/40 p-3"
          >
            <header className="flex flex-col gap-1 border-b border-gray-800 pb-2">
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${theme.pill}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${theme.dot}`}
                  aria-hidden="true"
                />
                {theme.label}
              </span>
              <span className="line-clamp-2 text-[10px] leading-tight text-slate-500">
                {theme.blurb}
              </span>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {cards.map((card) => (
                <ScenarioCardTile
                  key={card.slug}
                  card={card}
                  selected={selectedSlug === card.slug}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScenarioCardTile({
  card,
  selected,
  onSelect,
}: {
  card: ScenarioCard;
  selected: boolean;
  onSelect: (slug: string) => void;
}) {
  const airportTheme = ROUTE_THEMES[card.airportColor];
  const available = card.backendId != null;

  // `flex-1` lets the card share the column's height equally with its
  // siblings, so a 3-card column (Heroic) and a 7-card column (Exceptional)
  // both stretch all the way down — no orphan whitespace at the bottom.
  // `min-h-0` is required so flex-1 actually shrinks below content size.
  const baseCls =
    "group relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-lg border bg-gray-800/60 px-3 py-2.5 text-left transition-all duration-150";

  const stateCls = !available
    ? "border-gray-800 opacity-50 cursor-not-allowed"
    : selected
      ? `border-white/30 bg-gray-800 shadow-md ${airportTheme.ring}`
      : "border-gray-700/70 hover:bg-gray-800 hover:border-gray-600 cursor-pointer";

  const className = `${baseCls} ${stateCls}`;

  const inner = (
    <>
      {/* Left accent stripe — uses the airport colour. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: airportTheme.hex }}
      />

      <div className="flex items-center gap-3">
        <span className="font-mono text-base font-black tracking-wider text-white sm:text-lg">
          {card.airportCode}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-1 text-xs font-semibold leading-tight text-gray-100">
            {card.airportName}
          </span>
          <span className="line-clamp-1 text-[10px] leading-tight text-gray-500">
            {card.city}, {card.country}
          </span>
        </div>
        {available ? (
          selected ? (
            <span
              className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white ring-1 ring-inset ring-white/20"
              aria-hidden="true"
            >
              ✓
            </span>
          ) : null
        ) : (
          <span
            className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-inset ring-slate-500/40"
            aria-hidden="true"
          >
            Soon
          </span>
        )}
      </div>
    </>
  );

  if (!available) {
    return (
      <fieldset className={className} disabled aria-label={`${card.airportCode} — coming soon`}>
        {inner}
      </fieldset>
    );
  }

  return (
    // biome-ignore lint/correctness/noRestrictedElements: scenario card carries its own bespoke chrome (accent stripe, hover ring) — <Button> would override them
    <button
      type="button"
      onClick={() => onSelect(card.slug)}
      className={className}
      aria-pressed={selected}
      aria-label={`${card.airportCode} ${card.airportName}, ${card.city}`}
    >
      {inner}
    </button>
  );
}
