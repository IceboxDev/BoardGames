import type { GeoOverview } from "@boardgames/core/protocol";
import { anchorLine, nameHint } from "@boardgames/core/trainers/geography/anchor";
import {
  bordered,
  continentsAt,
  countryOf,
  type GeoCatalog,
  modeOf,
  type Stage,
} from "@boardgames/core/trainers/geography/catalog";
import type { ContinentId, Place } from "@boardgames/core/trainers/geography/content-types";
import {
  cityToleranceKm,
  judgeLocate,
  judgeName,
} from "@boardgames/core/trainers/geography/grading";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, ErrorAlert, LoadingState } from "../../../components/ui";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import { qk } from "../../../lib/query-keys";
import { overviewQuery } from "../api";
import { geoPaths, useCatalog, useToday, useWorld } from "../data";
import { Globe, type GlobeFocus, type GlobeScene } from "../globe/Globe";
import {
  distanceKm,
  distanceToFeatureKm,
  featureAt,
  insideFeature,
  type LonLat,
} from "../globe/geo";
import type { World } from "../globe/world";
import { stageFourPoint } from "../points";
import {
  contextOutline,
  placeFills,
  placeFocus,
  placeMarkers,
  placeOutlines,
  regionFocus,
  targetPoint,
} from "../scenes";
import { type Answered, type GeoSpec, useGeoSession } from "../useGeoSession";
import { LocatePanel, NamePanel, RevealPanel } from "./Panels";
import { SessionSummary } from "./SessionSummary";

// A study sitting: every card is one stage of a place (borders on / off ×
// find it / name it), answered with an immediate, spatial correction.

const AUTO_ADVANCE_MS = 1500;
const CONTINENTS: readonly ContinentId[] = ["eu", "as", "af", "na", "sa", "oc", "an"];

export function StudyPage() {
  useDocumentTitle("World Geography · Study");
  const [params] = useSearchParams();
  // A new mode (a drill) is a new sitting.
  return <StudySitting key={params.toString()} params={params} />;
}

function specFrom(params: URLSearchParams): GeoSpec {
  const drill = params.get("drill");
  if (drill && (CONTINENTS as readonly string[]).includes(drill)) {
    return { kind: "drill", continent: drill as ContinentId };
  }
  const group = params.get("group");
  if (group === "none") return { kind: "daily", group: null };
  return group ? { kind: "daily", group } : { kind: "daily" };
}

function StudySitting({ params }: { params: URLSearchParams }) {
  const spec = useMemo(() => specFrom(params), [params]);
  const today = useToday();
  // Always a fresh overview: the session is built once from it.
  const overview = useQuery({
    queryKey: qk.geographyOverview(today),
    queryFn: overviewQuery(today),
    refetchOnMount: "always",
    staleTime: 0,
  });
  const world = useWorld();
  const [ready, setReady] = useState<GeoOverview | null>(null);
  useEffect(() => {
    if (!ready && overview.data && !overview.isFetching) setReady(overview.data);
  }, [ready, overview.data, overview.isFetching]);

  if (overview.isError) {
    return (
      <div className="p-6">
        <ErrorAlert message="The trainer could not load your progress." />
      </div>
    );
  }
  if (!ready || !world.data) return <LoadingState label="Spinning up the globe…" />;
  return <Session overview={ready} world={world.data} spec={spec} today={today} />;
}

function Session({
  overview,
  world,
  spec,
  today,
}: {
  overview: GeoOverview;
  world: World;
  spec: GeoSpec;
  today: string;
}) {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const { user } = useCurrentUser();
  const lang = overview.settings.language;
  const s = useGeoSession({ catalog, overview, spec, today, seedKey: user?.id ?? "me" });
  const [pin, setPin] = useState<LonLat | null>(null);
  const stage = s.current?.stage;
  const target = s.place;

  // A fresh card starts without a pin; a stage-4 card gets its own point.
  const cardKey = `${s.cursor}:${s.current?.cardId ?? ""}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per card
  useEffect(() => setPin(null), [cardKey, s.status]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one point per card
  const point = useMemo(
    () => (target && stage === 4 ? stageFourPoint(world, catalog, target) : null),
    [cardKey],
  );

  // A clean correct answer moves on by itself — except at stage 1, the
  // first meeting, where the place's line is worth a read.
  const last = s.last;
  useEffect(() => {
    if (s.status !== "reveal" || !last) return;
    if (last.grade !== "good" && last.grade !== "easy") return;
    if (last.item.stage === 1 && last.item.tier !== "review") return;
    const t = window.setTimeout(s.next, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [s.status, last, s.next]);

  const confused = last?.confusedWith ? (catalog.byId.get(last.confusedWith) ?? null) : null;

  const scene = useMemo(
    () =>
      buildScene({
        catalog,
        status: s.status,
        target,
        stage,
        hints: s.hints,
        pin,
        point,
        last,
        confused,
        lang,
      }),
    [catalog, s.status, target, stage, s.hints, pin, point, last, confused, lang],
  );
  const focus = useMemo(
    () =>
      buildFocus({
        catalog,
        status: s.status,
        target,
        stage,
        hints: s.hints,
        cursor: s.cursor,
        point,
        last,
      }),
    [catalog, s.status, target, stage, s.hints, s.cursor, point, last],
  );

  const confirmLocate = () => {
    if (!pin || !target) return;
    s.answer({ ...locateFacts(catalog, world, target, pin), hint: s.hints > 0, pin });
  };
  const submitName = (typed: string) => {
    if (!target) return;
    const r = judgeName(catalog, target, typed);
    s.answer({
      verdict: r.verdict,
      typo: r.typo,
      typed,
      hint: s.hints > 0,
      confusedWith: r.confusedWith,
    });
  };

  // Enter confirms a pin / moves on; H asks for a hint (never while typing).
  const keys = useRef({ confirmLocate, next: s.next, hint: s.hint });
  keys.current = { confirmLocate, next: s.next, hint: s.hint };
  const status = s.status;
  const mode = stage ? modeOf(stage) : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Enter" && !typing) {
        e.preventDefault();
        if (status === "reveal") keys.current.next();
        else if (status === "ask" && mode === "locate") keys.current.confirmLocate();
      } else if ((e.key === "h" || e.key === "H") && !typing && status === "ask") {
        keys.current.hint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, mode]);

  if (s.status === "done") {
    return (
      <SessionSummary
        catalog={catalog}
        overview={overview}
        results={s.results}
        states={s.states}
        lang={lang}
        mode={spec.kind}
        onHub={() => navigate(geoPaths.hub)}
        onMore={(to) => navigate(to)}
      />
    );
  }

  const review = s.current?.tier === "review";
  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <div className="relative h-[58vh] min-h-72 shrink-0 lg:h-auto lg:flex-1">
        <Globe
          world={world}
          scene={scene}
          focus={focus}
          initial={{ at: [15, 30], zoom: 1 }}
          onPick={s.status === "ask" && mode === "locate" ? setPin : undefined}
          aria-label="Globe — drag to turn, scroll or pinch to zoom"
        />
      </div>
      <aside className="order-first flex flex-col gap-4 border-line-soft p-4 lg:order-none lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
            {spec.kind === "drill" ? "Drill · " : ""}
            {Math.min(s.cursor + 1, s.items.length)} / {s.items.length}
          </span>
          <Button variant="link" size="xs" onClick={() => navigate(geoPaths.hub)}>
            End session
          </Button>
        </div>
        {s.status === "ask" && target && stage && mode === "locate" && (
          <LocatePanel
            place={target}
            lang={lang}
            stage={stage}
            review={review}
            hints={s.hints}
            pinned={pin !== null}
            onHint={s.hint}
            onConfirm={confirmLocate}
            onSkip={() => s.answer({ verdict: "skipped", hint: s.hints > 0 })}
          />
        )}
        {s.status === "ask" && target && stage && mode === "name" && (
          <NamePanel
            key={s.cursor}
            place={target}
            lang={lang}
            stage={stage}
            review={review}
            hints={s.hints}
            context={nameHint(catalog, target, lang)}
            onHint={s.hint}
            onSubmit={submitName}
            onSkip={() => s.answer({ verdict: "skipped", hint: s.hints > 0 })}
          />
        )}
        {s.status === "reveal" && target && last && (
          <RevealPanel
            place={target}
            confused={confused}
            answered={last}
            lang={lang}
            today={today}
            anchor={anchorLine(catalog, target, lang)}
            onNext={s.next}
          />
        )}
        {s.pendingCount > 0 && (
          <p className="text-2xs text-fg-muted">
            {s.pendingCount} answer{s.pendingCount === 1 ? "" : "s"} waiting to sync
          </p>
        )}
      </aside>
    </div>
  );
}

// ── Grading a click ─────────────────────────────────────────────────────

function locateFacts(catalog: GeoCatalog, world: World, target: Place, at: LonLat) {
  const feature = featureAt(world, at);
  const country = feature ? catalog.countryByFeature.get(feature) : undefined;
  const continents = feature ? continentsAt(catalog, feature, at[0]) : [];
  let distance = 0;
  let inside = false;
  if (target.kind === "country") {
    inside = insideFeature(world, target.feature, at);
    distance = target.tiny
      ? distanceKm(at, target.focus)
      : distanceToFeatureKm(world, target.feature, at);
  } else if (target.kind === "city") {
    distance = distanceKm(at, target.at);
  }
  // For a city: another city the click landed right on (a real mix-up).
  let cityId: string | null = null;
  if (target.kind === "city") {
    let best = Number.POSITIVE_INFINITY;
    for (const c of catalog.cities) {
      if (c.id === target.id) continue;
      const d = distanceKm(at, c.at);
      const home = countryOf(catalog, c);
      if (d <= cityToleranceKm(home?.areaKm2 ?? 0) && d < best) {
        best = d;
        cityId = c.id;
      }
    }
  }
  const r = judgeLocate(catalog, target, {
    countryId: country?.id ?? null,
    continents,
    insideTarget: inside,
    distanceKm: distance,
    cityId,
  });
  return {
    verdict: r.verdict,
    confusedWith: r.confusedWith,
    distanceKm: target.kind === "continent" ? undefined : distance,
  };
}

// ── What the globe shows ────────────────────────────────────────────────

function buildScene(o: {
  catalog: GeoCatalog;
  status: string;
  target: Place | undefined;
  stage: Stage | undefined;
  hints: number;
  pin: LonLat | null;
  point: LonLat | null;
  last: Answered | null;
  confused: Place | null;
  lang: "en" | "de";
}): GlobeScene {
  const { catalog, lang, target: p, stage } = o;
  if (!p || !stage) return {};
  const label = (x: Place) => (lang === "de" ? x.nameDe : x.nameEn);
  if (o.status === "ask") {
    const pinMarker = o.pin ? [{ at: o.pin, tone: "warn" as const, size: 6, ring: true }] : [];
    switch (stage) {
      case 1:
        return { borders: true, markers: pinMarker };
      case 2:
        return {
          borders: true,
          fills: placeFills(catalog, p, "accent", 0.8),
          markers: placeMarkers(p, "accent", { pulse: true }),
          outlines: contextOutline(catalog, p),
        };
      case 3: {
        const cityCountry = p.kind === "city" ? countryOf(catalog, p) : null;
        return {
          grid: true,
          borders: o.hints >= 1,
          outlines:
            o.hints >= 1 && cityCountry
              ? [{ feature: cityCountry.feature, tone: "warn", width: 1.4 }]
              : [],
          markers: pinMarker,
        };
      }
      case 4:
        return {
          grid: true,
          markers: o.point ? [{ at: o.point, tone: "accent", size: 6, pulse: true }] : [],
        };
    }
  }
  if (o.status === "reveal" && o.last) {
    const right = o.last.grade !== "again";
    // Borderless stages show only the place itself (and a mix-up) — never
    // every border, which would give the next question away.
    const scene: GlobeScene = {
      borders: bordered(stage),
      grid: !bordered(stage),
      fills: [
        ...placeFills(catalog, p, "ok", 0.75),
        ...(o.confused ? placeFills(catalog, o.confused, "bad", 0.55) : []),
      ],
      outlines: [
        ...placeOutlines(catalog, p, "ok"),
        ...(o.confused ? placeOutlines(catalog, o.confused, "bad") : []),
        ...(contextOutline(catalog, p) ?? []),
      ],
      markers: [
        ...placeMarkers(p, "ok", { label: label(p), pulse: true }),
        ...(o.confused ? placeMarkers(o.confused, "bad", { label: label(o.confused) }) : []),
        ...(o.last.pin
          ? [
              {
                at: o.last.pin,
                tone: right ? ("ok" as const) : ("bad" as const),
                size: 6,
                ring: true,
              },
            ]
          : []),
        ...(stage === 4 && o.point && p.kind !== "city"
          ? [{ at: o.point, tone: "strong" as const, size: 4 }]
          : []),
      ],
    };
    if (o.last.pin && !right && p.kind !== "continent") {
      scene.arcs = [{ from: o.last.pin, to: targetPoint(p), tone: "bad" }];
    }
    return scene;
  }
  return {};
}

function buildFocus(o: {
  catalog: GeoCatalog;
  status: string;
  target: Place | undefined;
  stage: Stage | undefined;
  hints: number;
  cursor: number;
  point: LonLat | null;
  last: Answered | null;
}): GlobeFocus | null {
  const { catalog, target, stage } = o;
  if (!target || !stage) return null;
  if (o.status === "ask") {
    if (stage === 2) return placeFocus(catalog, target, `ask-${o.cursor}`);
    if (stage === 4 && o.point) {
      // Close enough to see the surroundings, not so close it's all one country.
      const f = placeFocus(catalog, target, `ask-${o.cursor}`);
      const zoom = target.kind === "continent" ? 2.2 : Math.max(1.2, f.zoom * 0.5);
      return { at: o.point, zoom, key: `ask-${o.cursor}` };
    }
    // Stages 1 and 3 never move the camera to the answer; the region hint does.
    const regionHint = stage === 1 ? 1 : 2;
    if (o.hints >= regionHint) return regionFocus(catalog, target, `hint-${o.cursor}`);
    return null;
  }
  if (o.status === "reveal") {
    const f = placeFocus(catalog, target, `reveal-${o.cursor}`);
    const pin = o.last?.pin;
    if (pin && o.last?.grade === "again") {
      const to = targetPoint(target);
      if (target.kind === "continent") {
        return { at: [(pin[0] + to[0]) / 2, (pin[1] + to[1]) / 2], zoom: 1, key: f.key };
      }
      // Frame the miss: halfway between the pin and the answer, far enough to see both.
      const km = distanceKm(pin, to);
      const zoom = Math.max(1, Math.min(f.zoom, 6371 / Math.max(300, km * 1.4)));
      return Math.abs(pin[0] - to[0]) < 180
        ? { at: [(pin[0] + to[0]) / 2, (pin[1] + to[1]) / 2], zoom, key: f.key }
        : f;
    }
    return f;
  }
  return null;
}
