import { formatSpan, timelineSpanYears } from "@boardgames/core/games/quiztopia/timeline";
import { type BlockOverride, blockPath } from "@boardgames/core/games/quiztopia/timeline-blocks";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookIcon, PinIcon } from "../../../../components/icons";
import {
  Button,
  Chip,
  Drawer,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Surface,
} from "../../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../../hooks/useMediaQuery";
import { cn } from "../../../../lib/cn";
import { DISTRICTS } from "../../bands";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { isPlainKey, isTypingTarget } from "../../keys";
import { layoutTimeline, type TimelineItem } from "../../logic/timeline-layout";
import type { TrainerPaths } from "../../paths";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
import { BlockRail } from "./BlockRail";
import { DOT_OFFSET, pinDomId } from "./dom-ids";
import { TimelineDetail } from "./TimelineDetail";
import { TimelineInspector } from "./TimelineInspector";
import { type OverrideChange, TimelineRiver } from "./TimelineRiver";
import { DOT_FILL, DOT_RING } from "./tones";

// "Your timeline": every question the member has studied pins its moment
// to one chronological river, so wandering between districts builds a
// single picture of history. This is the presentational half — the route
// (`TimelinePage`) feeds it the joined pins, the dev preview a fixture.
//
//   ≥ lg   block outline │ river (cards alternate around the axis); detail docked over the right edge
//   phone  block breadcrumb (sticky) │ river (one column) │ detail in a sheet
//
// The river cuts time into blocks that split where pins crowd; a member
// can split a block further or fold one away, remembered per browser.
//
// `?q=<questionId>` focuses a pin: it scrolls into view, opens the detail,
// and ← / → walk to the previous / next moment in time.

type Status = "all" | "known" | "learning";

type Props = {
  items: readonly TimelineItem[];
  /** Every pin, dated or not. */
  totalPins: number;
  /** Pins whose question has no event in this content version. */
  undated: number;
  paths: TrainerPaths;
  focusId: string | null;
  onFocus: (questionId: string | null) => void;
};

const WIDE = { cardHeight: 68, cardInset: DOT_OFFSET };
const NARROW = { cardHeight: 66, cardInset: DOT_OFFSET };

type Overrides = Readonly<Record<string, BlockOverride>>;
const OVERRIDES_KEY = "quiztopia.timeline.blocks.v1";

function loadOverrides(): Overrides {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (e): e is [string, BlockOverride] => e[1] === "split" || e[1] === "fold",
      ),
    );
  } catch {
    return {};
  }
}

function saveOverrides(o: Overrides) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
  } catch {
    // Private windows and blocked storage: the cut just isn't remembered.
  }
}

export function TimelineView({ items, totalPins, undated, paths, focusId, onFocus }: Props) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const { language: lang, setLanguage } = useQuestionLanguage({ allowBoth: false });
  const de = lang === "de";

  const [districts, setDistricts] = useState<ReadonlySet<number>>(() => new Set());
  const [status, setStatus] = useState<Status>("all");
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const changeOverride = useCallback<OverrideChange>((id, value) => {
    setOverrides((cur) => {
      const next = { ...cur };
      if (value) next[id] = value;
      else delete next[id];
      saveOverrides(next);
      return next;
    });
  }, []);

  const visible = useMemo(
    () =>
      items.filter(
        (it) =>
          (districts.size === 0 || districts.has(it.n)) &&
          (status === "all" || (status === "known") === it.known),
      ),
    [items, districts, status],
  );
  const dims = wide ? WIDE : NARROW;
  const layout = useMemo(
    () => layoutTimeline(visible, { columns: wide ? 2 : 1, ...dims, overrides }),
    [visible, wide, dims, overrides],
  );

  const focusIndex = focusId ? visible.findIndex((it) => it.questionId === focusId) : -1;
  const focused = focusIndex >= 0 ? visible[focusIndex] : null;
  const pinnedButHidden =
    focusId !== null && !focused && items.some((it) => it.questionId === focusId);
  const unknownFocus = focusId !== null && !focused && !pinnedButHidden;

  // Focusing a pin the filters hide (a deep link, a chip) clears the
  // filters — once per focus change, so the member can still filter the
  // open pin away afterwards (the detail then simply closes).
  const hiddenRef = useRef(pinnedButHidden);
  hiddenRef.current = pinnedButHidden;
  useEffect(() => {
    if (!focusId || !hiddenRef.current) return;
    setDistricts(new Set());
    setStatus("all");
  }, [focusId]);

  // A focused pin inside a folded block unfolds it (and every fold above).
  const focusKey = focused?.parsed.startKey ?? null;
  useEffect(() => {
    if (focusKey === null) return;
    setOverrides((cur) => {
      const folds = blockPath(focusKey).filter((b) => cur[b.id] === "fold");
      if (folds.length === 0) return cur;
      const next = { ...cur };
      for (const b of folds) delete next[b.id];
      saveOverrides(next);
      return next;
    });
  }, [focusKey]);

  // Bring the focused pin into view once it is laid out.
  useEffect(() => {
    if (!focusId || focusIndex < 0) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(pinDomId(focusId))
        ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }, 30);
    return () => window.clearTimeout(t);
  }, [focusId, focusIndex, reduced]);

  const prev = focusIndex > 0 ? visible[focusIndex - 1] : null;
  const next = focusIndex >= 0 && focusIndex < visible.length - 1 ? visible[focusIndex + 1] : null;
  const goPrev = useCallback(() => prev && onFocus(prev.questionId), [prev, onFocus]);
  const goNext = useCallback(() => next && onFocus(next.questionId), [next, onFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (visible.length === 0) return;
        e.preventDefault();
        if (focusIndex < 0)
          onFocus(visible[e.key === "ArrowLeft" ? visible.length - 1 : 0].questionId);
        else if (e.key === "ArrowLeft") goPrev();
        else goNext();
      } else if (e.key === "Escape" && focusId) {
        e.preventDefault();
        onFocus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, focusIndex, focusId, onFocus, goPrev, goNext]);

  const toggleDistrict = (n: number) =>
    setDistricts((cur) => {
      const nextSet = new Set(cur);
      if (nextSet.has(n)) nextSet.delete(n);
      else nextSet.add(n);
      return nextSet;
    });

  const span = timelineSpanYears(items.map((it) => it.parsed));
  const knownCount = items.filter((it) => it.known).length;
  const subtitle =
    items.length === 0
      ? de
        ? "Jede geübte Frage steckt ihren Moment hierher"
        : "Every question you study pins its moment here"
      : de
        ? `${items.length} ${items.length === 1 ? "Moment" : "Momente"} über ${formatSpan(span, lang)} · ${knownCount} sitzen`
        : `${items.length} ${items.length === 1 ? "moment" : "moments"} pinned across ${formatSpan(span, lang)} · ${knownCount} known`;

  const header = (
    <PageHeader
      size="lg"
      eyebrow={de ? "Trainer" : "Trainer"}
      title={de ? "Deine Zeitleiste" : "Your timeline"}
      subtitle={subtitle}
      actions={
        <>
          <LanguageToggle value={lang} onChange={setLanguage} allowBoth={false} />
          <Button variant="secondary" size="sm" onClick={() => navigate(paths.wiki)}>
            <BookIcon className="h-3.5 w-3.5" />
            Wiki
          </Button>
        </>
      }
    />
  );

  if (totalPins === 0 || items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          titleAs="h2"
          icon={<PinIcon className="h-6 w-6" />}
          title={
            totalPins === 0
              ? de
                ? "Noch nichts angepinnt"
                : "Nothing pinned yet"
              : de
                ? "Noch keine Daten"
                : "No dates yet"
          }
          description={
            totalPins === 0
              ? de
                ? "Jede Frage trägt einen Moment der Geschichte — ein Datum, eine Lebensspanne, eine Epoche. Sobald du eine Frage im Trainer bewertest, landet ihr Moment hier, und Stadtteil für Stadtteil wächst ein einziges Bild der Zeit."
                : "Every question carries one moment in history — a date, a lifespan, an era. Grade a question in the trainer and its moment lands here; district by district, one picture of time grows."
              : de
                ? `Du hast ${totalPins} Fragen geübt, aber ihre Daten sind in dieser Inhaltsversion noch nicht enthalten. Sie erscheinen mit dem nächsten Update von selbst.`
                : `You have studied ${totalPins} questions, but their dates aren't in this version of the content yet. They will appear on their own with the next update.`
          }
          action={
            <Button variant="primary" onClick={() => navigate(paths.study())}>
              {de ? "Jetzt üben" : "Start studying"}
            </Button>
          }
        />
      </div>
    );
  }

  const detail = focused ? (
    <TimelineDetail
      item={focused}
      lang={lang}
      paths={paths}
      position={{ index: focusIndex, total: visible.length }}
      onPrev={prev ? goPrev : null}
      onNext={next ? goNext : null}
      onClose={() => onFocus(null)}
      embedded
    />
  ) : null;

  const allDistricts = districts.size === 0;

  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="flex flex-col gap-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{de ? "Stadtteile" : "Districts"}</legend>
          <Chip
            pressed={allDistricts}
            size="xs"
            shape="pill"
            onClick={() => setDistricts(new Set())}
          >
            {de ? "Alle Stadtteile" : "All districts"}
          </Chip>
          {DISTRICTS.map((d) => (
            <Chip
              key={d.slug}
              pressed={districts.has(d.n)}
              tone={d.tone}
              size="xs"
              shape="pill"
              icon={<BuildingGlyph name={d.building} lit={districts.has(d.n)} size={11} />}
              onClick={() => toggleDistrict(d.n)}
              title={`${d.label} · ${d.en} / ${d.de}`}
            >
              {de ? d.de : d.en}
            </Chip>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl<Status>
            options={[
              { value: "all", label: de ? "Alle" : "All" },
              { value: "known", label: de ? "Sitzt" : "Known" },
              { value: "learning", label: de ? "Lernt noch" : "Learning" },
            ]}
            value={status}
            onChange={setStatus}
            shape="pill"
            size="xs"
          />
          <Legend lang={lang} />
          {Object.keys(overrides).length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setOverrides({});
                saveOverrides({});
              }}
            >
              {de ? "Automatisch einteilen" : "Reset blocks"}
            </Button>
          )}
          {undated > 0 && (
            <p className="text-2xs text-fg-muted">
              {de
                ? `${undated} geübte ${undated === 1 ? "Frage" : "Fragen"} noch ohne Datum`
                : `${undated} studied ${undated === 1 ? "question" : "questions"} not dated yet`}
            </p>
          )}
        </div>
      </div>

      {unknownFocus && (
        <Surface
          variant="tile"
          padding="md"
          className="border-amber-500/30 text-xs text-fg-secondary"
        >
          {de
            ? "Diese Frage ist noch nicht auf deiner Zeitleiste — sie wird angepinnt, sobald du sie im Trainer bewertet hast."
            : "That question isn't on your timeline yet — it pins itself once you've graded it in the trainer."}
        </Surface>
      )}

      {!wide && (
        <div className="sticky top-0 z-lift -mx-4 border-b border-line-soft bg-surface-950/90 px-4 py-2 backdrop-blur">
          <BlockRail blocks={layout.blocks} lang={lang} orientation="horizontal" />
        </div>
      )}

      <div className={cn("grid gap-6", wide && "grid-cols-[10rem_minmax(0,1fr)]")}>
        {wide && (
          <div>
            <BlockRail
              blocks={layout.blocks}
              lang={lang}
              orientation="vertical"
              className="sticky top-4"
            />
          </div>
        )}
        <div>
          {visible.length === 0 ? (
            <EmptyState
              title={de ? "Keine Momente in dieser Auswahl" : "No moments in this selection"}
              description={
                de
                  ? "Wähle andere Stadtteile oder zeige alle."
                  : "Pick other districts, or show them all."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDistricts(new Set());
                    setStatus("all");
                  }}
                >
                  {de ? "Filter zurücksetzen" : "Clear filters"}
                </Button>
              }
            />
          ) : (
            <TimelineRiver
              layout={layout}
              wide={wide}
              lang={lang}
              cardHeight={dims.cardHeight}
              focusId={focused?.questionId ?? null}
              onSelect={(id) => onFocus(id === focusId ? null : id)}
              onOverride={changeOverride}
            />
          )}
        </div>
      </div>

      {/* The detail opens over the river, never beside it, so a moment
          never reflows the timeline: a docked inspector on wide screens
          (non-modal, the river stays live), a sheet on phones. */}
      {focused &&
        (wide ? (
          <TimelineInspector
            eyebrow={de ? "Deine Zeitleiste" : "Your timeline"}
            title="Moment"
            label="Moment"
            onClose={() => onFocus(null)}
          >
            {detail}
          </TimelineInspector>
        ) : (
          <Drawer
            side="bottom"
            onClose={() => onFocus(null)}
            eyebrow={de ? "Deine Zeitleiste" : "Your timeline"}
            title="Moment"
          >
            {detail}
          </Drawer>
        ))}
    </div>
  );
}

function Legend({ lang }: { lang: "en" | "de" }) {
  const de = lang === "de";
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("h-2.5 w-2.5 rounded-full border-2", DOT_FILL.sky)}
        />
        {de ? "sitzt" : "known"}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("h-2.5 w-2.5 rounded-full border-2", DOT_RING.sky)}
        />
        {de ? "lernt noch" : "still learning"}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-1 rounded-full bg-sky-400/45" />
        {de ? "Leben · Kriege · Herrschaften" : "lifespans · wars · reigns"}
      </li>
    </ul>
  );
}
