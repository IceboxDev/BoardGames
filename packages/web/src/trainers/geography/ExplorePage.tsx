import { anchorLine } from "@boardgames/core/trainers/geography/anchor";
import { placeName } from "@boardgames/core/trainers/geography/catalog";
import type { Place } from "@boardgames/core/trainers/geography/content-types";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Eyebrow, LoadingState } from "../../components/ui";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { geoPaths, useCatalog, useGeoOverview, useToday, useWorld } from "./data";
import { Globe, type GlobeScene } from "./globe/Globe";
import { distanceKm, featureAt, type LonLat } from "./globe/geo";
import { masteryFills, placeLevel, stagesOf } from "./mastery";
import { contextOutline, kindLabel, placeFills, placeFocus, placeMarkers } from "./scenes";

// The reference globe (the trainer's wiki): borders drawn, every capital a
// dot, your mastery tinted in; tap anything to see what it is. Browsing is
// free — nothing here touches the schedule.

const CITY_PICK_KM = 35;

export function ExplorePage() {
  useDocumentTitle("World Geography · Explore");
  const navigate = useNavigate();
  const catalog = useCatalog();
  const world = useWorld();
  const today = useToday();
  const overview = useGeoOverview(today);
  const lang = overview.data?.settings.language ?? "en";
  const [picked, setPicked] = useState<{ place: Place } | { territory: string } | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  const states = useMemo(
    () => new Map((overview.data?.states ?? []).map((s) => [s.questionId, s as SrsState])),
    [overview.data],
  );
  const capitals = useMemo(() => catalog.cities.filter((c) => c.capital), [catalog]);

  const pick = (at: LonLat) => {
    if (!world.data) return;
    // A city under the finger wins over its country.
    let best: { place: Place; d: number } | null = null;
    for (const c of catalog.cities) {
      const d = distanceKm(at, c.at);
      if (d < CITY_PICK_KM && (!best || d < best.d)) best = { place: c, d };
    }
    if (best) return setPicked({ place: best.place });
    const feature = featureAt(world.data, at);
    const country = feature ? catalog.countryByFeature.get(feature) : undefined;
    if (country) return setPicked({ place: country });
    if (feature) return setPicked({ territory: feature });
    setPicked(null);
  };

  const place = picked && "place" in picked ? picked.place : null;
  const scene: GlobeScene = useMemo(
    () => ({
      borders: true,
      fills: [
        ...masteryFills(catalog, states).map((f) => ({
          ...f,
          alpha: (f.alpha ?? 1) * 0.6,
        })),
        ...(place ? placeFills(catalog, place, "warn", 0.7) : []),
        ...(picked && "territory" in picked
          ? [{ feature: picked.territory, tone: "muted" as const, alpha: 0.6 }]
          : []),
      ],
      markers: [
        ...capitals.map((c) => ({ at: c.at, tone: "strong" as const, size: 1.8 })),
        ...(place ? placeMarkers(place, "warn", { label: placeName(place, lang) }) : []),
      ],
      outlines: place ? contextOutline(catalog, place) : [],
    }),
    [catalog, states, place, picked, capitals, lang],
  );

  if (!world.data) return <LoadingState label="Loading the globe…" />;
  const territory =
    picked && "territory" in picked ? catalog.territoryByFeature.get(picked.territory) : null;

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <div className="relative h-[62vh] min-h-72 shrink-0 lg:h-auto lg:flex-1">
        <Globe
          world={world.data}
          scene={scene}
          initial={{ at: [15, 30], zoom: 1 }}
          focus={place && focusKey > 0 ? placeFocus(catalog, place, focusKey) : null}
          onPick={pick}
          aria-label="Explore the globe — tap any land to see what it is"
        />
      </div>
      <aside className="order-first flex flex-col gap-4 border-line-soft p-4 lg:order-none lg:w-96 lg:shrink-0 lg:border-l">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow tone="accent">Explore</Eyebrow>
          <Button variant="link" size="xs" onClick={() => navigate(geoPaths.hub)}>
            Back
          </Button>
        </div>
        {place ? (
          <div className="flex flex-col gap-3">
            <span className="text-2xs text-fg-muted">{kindLabel(catalog, place, lang)}</span>
            <h2 className="text-2xl font-bold text-fg-strong">{placeName(place, lang)}</h2>
            {placeName(place, lang === "de" ? "en" : "de") !== placeName(place, lang) && (
              <span className="-mt-2 text-sm text-fg-muted">
                {placeName(place, lang === "de" ? "en" : "de")}
              </span>
            )}
            <p className="text-sm leading-relaxed text-fg-secondary">
              {anchorLine(catalog, place, lang)}
            </p>
            <div className="flex flex-wrap gap-1">
              {(() => {
                const level = placeLevel(states, place.id);
                const stages = stagesOf(states, place.id);
                return (
                  <Badge
                    size="xs"
                    tone={level === 3 ? "emerald" : level === 2 ? "accent" : "neutral"}
                  >
                    {level === 0
                      ? "not started"
                      : level === 1
                        ? `stage ${stages} of 4 cleared`
                        : level === 2
                          ? "all four stages cleared"
                          : "mastered"}
                  </Badge>
                );
              })()}
            </div>
            <div>
              <Button variant="secondary" size="xs" onClick={() => setFocusKey((k) => k + 1)}>
                Fly there
              </Button>
            </div>
          </div>
        ) : territory ? (
          <div className="flex flex-col gap-2">
            <span className="text-2xs text-fg-muted">Territory — not in the quiz</span>
            <h2 className="text-2xl font-bold text-fg-strong">
              {lang === "de" ? territory.nameDe : territory.nameEn}
            </h2>
          </div>
        ) : (
          <p className="text-sm text-fg-secondary">
            Tap any land to see what it is. Drag to turn the globe, scroll or pinch to zoom. The
            dots are capitals; the tint is how well you know a country.
          </p>
        )}
      </aside>
    </div>
  );
}
