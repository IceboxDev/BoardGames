import {
  type Lang,
  placeName,
  STAGES,
  type Stage,
} from "@boardgames/core/trainers/geography/catalog";
import type { Place } from "@boardgames/core/trainers/geography/content-types";
import { daysBetween } from "@boardgames/core/trainers/srs";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Eyebrow, Input, Kbd } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { promptKind } from "../scenes";
import type { Answered } from "../useGeoSession";

// The side panel of a study sitting: the Locate prompt (stages 1 and 3), the
// Name prompt (stages 2 and 4) and the correction after an answer. Each
// prompt says which of the four stages the place is on.

const other = (lang: Lang): Lang => (lang === "de" ? "en" : "de");

const STAGE_LABEL: Record<Stage, string> = {
  1: "Borders on · find it",
  2: "Borders on · name it",
  3: "No borders · find it",
  4: "No borders · name it",
};

/** Four pips: the stages this place has climbed. */
function StagePips({ stage, review }: { stage: Stage; review: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" aria-hidden="true">
        {STAGES.map((s) => (
          <span
            key={s}
            className={cn(
              "h-1.5 w-5 rounded-full",
              review || s < stage
                ? "bg-accent-400"
                : s === stage
                  ? "bg-accent-300/70"
                  : "bg-fill-strong",
            )}
          />
        ))}
      </div>
      <span className="text-2xs text-fg-muted">
        {review
          ? `Review · ${STAGE_LABEL[stage].toLowerCase()}`
          : `Stage ${stage} of 4 · ${STAGE_LABEL[stage].toLowerCase()}`}
      </span>
    </div>
  );
}

function Title({ place, lang }: { place: Place; lang: Lang }) {
  const main = placeName(place, lang);
  const alt = placeName(place, other(lang));
  return (
    <div className="flex flex-col">
      <h2 className="text-2xl font-bold text-fg-strong">{main}</h2>
      {alt !== main && <span className="text-sm text-fg-muted">{alt}</span>}
    </div>
  );
}

function HintRow({
  hints,
  labels,
  onHint,
}: {
  hints: number;
  labels: readonly string[];
  onHint: () => void;
}) {
  if (labels.length === 0) return null;
  const nextLabel = labels[hints];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextLabel ? (
        <Button
          variant="secondary"
          size="xs"
          onClick={onHint}
          title="A hint makes the card come back sooner"
        >
          Hint: {nextLabel}
        </Button>
      ) : (
        <span className="text-2xs text-fg-muted">No more hints</span>
      )}
      {hints > 0 && (
        <Badge tone="amber" size="xs">
          hint used
        </Badge>
      )}
      <Kbd>H</Kbd>
    </div>
  );
}

export function LocatePanel({
  place,
  lang,
  stage,
  review,
  hints,
  pinned,
  onHint,
  onConfirm,
  onSkip,
}: {
  place: Place;
  lang: Lang;
  stage: Stage;
  review: boolean;
  hints: number;
  pinned: boolean;
  onHint: () => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const hintLabels =
    stage === 1
      ? place.kind === "continent"
        ? []
        : ["zoom to the region"]
      : place.kind === "continent"
        ? ["show borders"]
        : ["show borders", place.kind === "city" ? "zoom to the country" : "zoom to the region"];
  return (
    <div className="flex flex-col gap-4">
      <StagePips stage={stage} review={review} />
      <Eyebrow tone="accent">Where is it? · {promptKind(place, lang)}</Eyebrow>
      <Title place={place} lang={lang} />
      <p className="text-xs text-fg-muted">
        {pinned
          ? "Happy with the pin? Confirm — or tap somewhere else to move it."
          : "Turn the globe and tap the spot."}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={onConfirm} disabled={!pinned}>
          Confirm
        </Button>
        <Kbd>Enter</Kbd>
        <Button variant="link" size="xs" className="ml-auto" onClick={onSkip}>
          I don't know
        </Button>
      </div>
      <HintRow hints={hints} labels={hintLabels} onHint={onHint} />
    </div>
  );
}

export function NamePanel({
  place,
  lang,
  stage,
  review,
  hints,
  context,
  onHint,
  onSubmit,
  onSkip,
}: {
  place: Place;
  lang: Lang;
  stage: Stage;
  review: boolean;
  hints: number;
  /** The second hint's context line. */
  context: string;
  onHint: () => void;
  onSubmit: (typed: string) => void;
  onSkip: () => void;
}) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const first = placeName(place, lang).slice(0, 1);
  const noun =
    place.kind === "continent" ? "continent" : place.kind === "country" ? "country" : "city";
  const question =
    stage === 4 && place.kind !== "city"
      ? `Which ${noun} is the dot in?`
      : `Which ${noun} is this?`;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim()) onSubmit(typed);
      }}
    >
      <StagePips stage={stage} review={review} />
      <Eyebrow tone="accent">{question}</Eyebrow>
      <Input
        ref={input}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={hints >= 1 ? `${first}…` : lang === "de" ? "Name eingeben" : "Type the name"}
        aria-label="Your answer"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {hints >= 2 && context && <p className="text-xs text-fg-secondary">{context}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!typed.trim()}>
          Answer
        </Button>
        <Kbd>Enter</Kbd>
        <Button type="button" variant="link" size="xs" className="ml-auto" onClick={onSkip}>
          I don't know
        </Button>
      </div>
      <HintRow hints={hints} labels={["first letter", "some context"]} onHint={onHint} />
    </form>
  );
}

function km(n: number): string {
  return n >= 100 ? `${Math.round(n / 10) * 10} km` : `${Math.round(n)} km`;
}

export function RevealPanel({
  place,
  confused,
  answered,
  lang,
  today,
  anchor,
  onNext,
}: {
  place: Place;
  confused: Place | null;
  answered: Answered;
  lang: Lang;
  today: string;
  /** One line about the place: what it borders, its capital… */
  anchor: string;
  onNext: () => void;
}) {
  const right = answered.grade !== "again";
  const name = placeName(place, lang);
  const stage = answered.item.stage;
  const locate = stage === 1 || stage === 3;
  const days = daysBetween(today, answered.next.dueDate);
  let headline: string;
  let detail: string | null = null;
  if (answered.verdict === "skipped") {
    headline = `It's ${name}`;
    detail = "Here it is.";
  } else if (locate) {
    if (answered.verdict === "correct") {
      headline = answered.hint ? "Found it — with a hint" : `Yes — ${name}`;
    } else if (answered.verdict === "close") {
      headline = "Close enough";
      detail = `${km(answered.distanceKm ?? 0)} off — it counts, and comes back a little sooner.`;
    } else if (answered.verdict === "near") {
      headline = "Close";
      detail =
        answered.grade === "again"
          ? `${km(answered.distanceKm ?? 0)} off — not quite enough to clear the stage.`
          : `${km(answered.distanceKm ?? 0)} off — counts, but it comes back sooner.`;
    } else if (place.kind === "continent" || answered.distanceKm === undefined) {
      headline = `${name} is here`;
      detail = confused
        ? `You tapped ${placeName(confused, lang)}, shown in red.`
        : "You tapped the sea.";
    } else {
      headline = `That was ${km(answered.distanceKm)} off`;
      detail = confused ? `You tapped ${placeName(confused, lang)}.` : null;
    }
  } else if (answered.verdict === "correct") {
    headline = answered.typo ? `Yes — it's spelled ${name}` : `Yes — ${name}`;
    if (answered.hint) detail = "With a hint, so it comes back sooner.";
  } else {
    headline = `It's ${name}`;
    detail = confused
      ? `You wrote ${answered.typed?.trim()} — that's ${placeName(confused, lang)}, shown in red.`
      : answered.typed
        ? `You wrote “${answered.typed.trim()}”.`
        : null;
  }
  const review = answered.item.tier === "review";
  const next = answered.item.decoy
    ? right
      ? "Right again — places can come up more than once."
      : "It came up a second time to keep you on your toes."
    : !right
      ? answered.retryQueued
        ? "Back in three cards."
        : "Enough for today — it comes back tomorrow."
      : review
        ? days <= 0
          ? "Again later today."
          : `Next check in ${days} day${days === 1 ? "" : "s"}.`
        : stage < 4
          ? `Stage ${stage} cleared — stage ${stage + 1} comes up later in this session.`
          : answered.opened > 0
            ? `All four stages cleared — ${answered.opened} new place${answered.opened === 1 ? "" : "s"} opened.`
            : "All four stages cleared.";
  const auto = answered.grade === "good" || answered.grade === "easy";
  return (
    <div className="flex flex-col gap-4" role="status">
      <Eyebrow tone={right ? "emerald" : "rose"}>{right ? "Correct" : "Not quite"}</Eyebrow>
      <h2 className="text-2xl font-bold text-fg-strong">{headline}</h2>
      {detail && <p className="text-sm text-fg-secondary">{detail}</p>}
      <p className="text-sm leading-relaxed text-fg-secondary">{anchor}</p>
      <p
        className={cn(
          "text-2xs",
          answered.opened > 0 ? "font-semibold text-accent-300" : "text-fg-muted",
        )}
      >
        {next}
      </p>
      <div className="flex items-center gap-2">
        <Button variant={auto ? "secondary" : "primary"} onClick={onNext}>
          Next
        </Button>
        <Kbd>Enter</Kbd>
      </div>
    </div>
  );
}
