import { type GeoCatalog, placeName } from "@boardgames/core/trainers/geography/catalog";
import type { ContinentId } from "@boardgames/core/trainers/geography/content-types";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { Badge, Button, MicroLabel, ProgressBar, Surface } from "../../components/ui";
import { continentProgress, type Tally } from "./mastery";

// The ladder made visible: one card per continent with its two levels —
// countries, then cities — as known / total, a continent still to learn
// first shown as locked, and a drill once something there is known.

type Props = {
  catalog: GeoCatalog;
  states: ReadonlyMap<string, SrsState>;
  onDrill: (code: ContinentId) => void;
};

function Meter({ label, t, locked }: { label: string; t: Tally; locked: boolean }) {
  if (t.total === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="text-fg-secondary">{label}</span>
        <span className="tabular-nums text-fg-muted">
          {locked ? "locked" : `${t.known} / ${t.total} known`}
        </span>
      </div>
      <ProgressBar
        value={t.total ? t.known / t.total : 0}
        extent={t.total ? t.seen / t.total : 0}
        tone="accent"
        size="sm"
        label={`${label}: ${t.known} of ${t.total} known`}
      />
    </div>
  );
}

export function LevelTrack({ catalog, states, onDrill }: Props) {
  const rows = continentProgress(catalog, states);
  return (
    <section aria-label="Continents" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-fg-strong">Continents</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const ct = catalog.continentByCode.get(r.code);
          if (!ct) return null;
          const known = r.countries.seen + r.cities.seen > 0;
          return (
            <Surface key={r.code} variant="raised" padding="md" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg-strong">{placeName(ct, "en")}</span>
                <Badge
                  size="xs"
                  tone={r.continent >= 2 ? "emerald" : r.continent === 1 ? "accent" : "neutral"}
                >
                  {r.continent >= 2
                    ? "cleared"
                    : r.continent === 1
                      ? `stage ${r.stages + 1} of 4`
                      : "new"}
                </Badge>
              </div>
              {r.countries.total === 0 ? (
                <MicroLabel>No countries — just find it on the globe</MicroLabel>
              ) : (
                <>
                  <Meter label="Countries" t={r.countries} locked={!r.unlocked} />
                  <Meter label="Cities" t={r.cities} locked={!r.unlocked} />
                  {!r.unlocked && (
                    <p className="text-2xs text-fg-muted">
                      Opens once {placeName(ct, "en")} has cleared all four stages.
                    </p>
                  )}
                </>
              )}
              {known && (
                <div>
                  <Button variant="secondary" size="xs" onClick={() => onDrill(r.code)}>
                    Drill
                  </Button>
                </div>
              )}
            </Surface>
          );
        })}
      </div>
    </section>
  );
}
