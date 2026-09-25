import type { GeoOverview } from "@boardgames/core/protocol";
import { type GeoCatalog, type Lang, placeName } from "@boardgames/core/trainers/geography/catalog";
import { placeDone } from "@boardgames/core/trainers/geography/ladder";
import { openGroups } from "@boardgames/core/trainers/geography/session";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { useMemo, useState } from "react";
import { Badge, Button, PageHeader, PageMain, StatTile, Surface } from "../../../components/ui";
import { geoPaths } from "../data";
import { completeSubregions } from "../mastery";
import { StudyPicker } from "../StudyPicker";
import type { Answered } from "../useGeoSession";

// The end of a sitting: how it went, which places cleared all four stages,
// what that opened, the regions completed, and the places to look at again.

type Props = {
  catalog: GeoCatalog;
  overview: GeoOverview;
  results: readonly Answered[];
  states: ReadonlyMap<string, SrsState>;
  lang: Lang;
  mode: "daily" | "drill";
  onHub: () => void;
  /** Go straight on with the next group. */
  onMore: (to: string) => void;
};

export function SessionSummary({
  catalog,
  overview,
  results,
  states,
  lang,
  mode,
  onHub,
  onMore,
}: Props) {
  // First answers only: a card re-asked after a miss doesn't count twice.
  const first = useMemo(() => {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (r.item.retry || seen.has(r.item.cardId)) return false;
      seen.add(r.item.cardId);
      return true;
    });
  }, [results]);
  const right = first.filter((r) => r.grade !== "again").length;
  const misses = first.filter((r) => r.grade === "again");

  const before = useMemo(
    () => new Map(overview.states.map((s) => [s.questionId, s as SrsState])),
    [overview.states],
  );
  const cleared = useMemo(() => {
    const ids = new Set(results.map((r) => r.item.placeId));
    return [...ids].filter((id) => !placeDone(before, id) && placeDone(states, id));
  }, [results, before, states]);
  const opened = results.reduce((n, r) => n + r.opened, 0);
  const completed = useMemo(() => {
    const was = completeSubregions(catalog, before);
    return [...completeSubregions(catalog, states)].filter((id) => !was.has(id));
  }, [catalog, before, states]);

  const groups = useMemo(
    () => openGroups(catalog, states, overview.settings),
    [catalog, states, overview.settings],
  );
  const [picking, setPicking] = useState(false);

  return (
    <PageMain width="3xl" className="flex flex-col gap-6 py-8">
      <PageHeader
        size="lg"
        eyebrow={mode === "drill" ? "Drill done" : "Session done"}
        title={
          first.length === 0 ? "Nothing to study right now" : `${right} of ${first.length} right`
        }
        subtitle={
          opened > 0
            ? `${opened} new place${opened === 1 ? "" : "s"} opened — they come one group at a time: a continent's countries, then a region's cities.`
            : undefined
        }
      />

      {completed.map((id) => {
        const sub = catalog.subregionById.get(id);
        return sub ? (
          <Surface key={id} variant="raised" padding="md" className="flex items-center gap-3">
            <Badge tone="emerald">Region complete</Badge>
            <span className="text-sm text-fg-primary">
              Every country of {lang === "de" ? sub.nameDe : sub.nameEn} cleared — its cities are
              open.
            </span>
          </Surface>
        ) : null;
      })}

      {first.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            variant="raised"
            size="2xl"
            label="Cleared"
            value={cleared.length}
            sub="all four stages"
          />
          <StatTile
            variant="raised"
            size="2xl"
            label="First try"
            value={`${Math.round((right / first.length) * 100)}%`}
          />
          <StatTile variant="raised" size="2xl" label="To revisit" value={misses.length} />
        </div>
      )}

      {cleared.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg-strong">Cleared today</h2>
          <ul className="flex flex-wrap gap-2">
            {cleared.map((id) => {
              const p = catalog.byId.get(id);
              return p ? (
                <li key={id}>
                  <Badge tone="emerald">{placeName(p, lang)}</Badge>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      {misses.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg-strong">Missed today</h2>
          <ul className="flex flex-wrap gap-2">
            {misses.map((r) => {
              const p = catalog.byId.get(r.item.placeId);
              const c = r.confusedWith ? catalog.byId.get(r.confusedWith) : undefined;
              return p ? (
                <li key={r.item.cardId}>
                  <Badge tone="neutral">
                    {placeName(p, lang)}
                    {c ? ` ≠ ${placeName(c, lang)}` : ""}
                  </Badge>
                </li>
              ) : null;
            })}
          </ul>
          <p className="text-xs text-fg-muted">
            They come back — mix-ups are asked next to each other so the difference sticks.
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {groups.length > 0 && mode !== "drill" && (
          <Button variant="primary" onClick={() => setPicking(true)}>
            Keep going
          </Button>
        )}
        <Button variant={groups.length > 0 ? "secondary" : "primary"} onClick={onHub}>
          Back to your world
        </Button>
      </div>
      {picking && (
        <StudyPicker
          catalog={catalog}
          groups={groups}
          continuing={0}
          lang={lang}
          onPick={(g) => onMore(geoPaths.studyGroup(g))}
          onClose={() => setPicking(false)}
        />
      )}
    </PageMain>
  );
}
