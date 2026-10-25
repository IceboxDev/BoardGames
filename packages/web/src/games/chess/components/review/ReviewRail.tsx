import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { HistoryEntry } from "@boardgames/core/games/chess/schemas";
import { type ReactNode, useState } from "react";
import { Button, Eyebrow, ProgressBar } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { EvalGraph, type GraphTick } from "../../analysis/EvalBar";
import { formatScore, type Score } from "../../analysis/grade";
import { GRADE_MARK } from "../../analysis/grade-marks";
import type { MoveStory } from "../../analysis/review-model";
import { type MoveGrade, MoveList } from "../MoveList";

type Flaw = "inaccuracy" | "mistake" | "blunder";
const FLAWS: readonly Flaw[] = ["inaccuracy", "mistake", "blunder"];

export type HeadlineTone = "win" | "lose" | "draw" | "neutral";
const HEADLINE_TONE: Record<HeadlineTone, string> = {
  win: "text-emerald-400",
  lose: "text-rose-400",
  draw: "text-fg-secondary",
  neutral: "text-fg-strong",
};

export interface PracticeItem {
  readonly label: string;
  readonly state: "found" | "shown" | "current" | "waiting";
}

function Section({
  title,
  aside,
  children,
  dim,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <section className={cn("flex flex-col gap-2", dim && "pointer-events-none opacity-40")}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow as="h4" size="sm" tone="neutral">
          {title}
        </Eyebrow>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The review's rail, top to bottom: the result, the move card (wide screens),
 * the evaluation graph, each side's accuracy and flaws, the key moments, your
 * repertoire, the graded score sheet. Practice dims all but its own progress.
 */
export function ReviewRail({
  headline,
  subtitle,
  card,
  ply,
  onGo,
  scores,
  ticks,
  describe,
  names,
  accuracy,
  stories,
  moments,
  practice,
  repertoire,
  history,
  grades,
  startFen,
  sideLine,
  progress,
  error,
}: {
  headline: { readonly text: string; readonly tone: HeadlineTone };
  subtitle: string;
  /** The move card, when the rail holds it (wide screens). */
  card: ReactNode;
  ply: number;
  onGo: (ply: number) => void;
  scores: readonly (Score | undefined)[];
  ticks: readonly GraphTick[];
  /** "22. Qxb7??" for a position, for the graph's hover readout. */
  describe: (ply: number) => string;
  names: Readonly<Record<Color, string>>;
  accuracy: Readonly<Record<Color, number | null>>;
  stories: readonly (MoveStory | null)[];
  moments: readonly MoveStory[];
  practice: readonly PracticeItem[] | null;
  repertoire?: ReactNode;
  history: readonly HistoryEntry[];
  grades: readonly MoveGrade[];
  startFen: string;
  /** The what-if line on screen, as text. */
  sideLine: string | null;
  /** 0–1 while the engine works through the game; `null` once done. */
  progress: number | null;
  error: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = history.length;
  const practising = practice !== null;

  /** The next move of `side` with `grade` after the one on screen, wrapping round. */
  const jump = (side: Color, grade: Flaw) => {
    const hits = stories.filter((s): s is MoveStory => !!s && s.by === side && s.grade === grade);
    const next = hits.find((s) => s.index + 1 > ply) ?? hits[0];
    if (next) onGo(next.index + 1);
  };
  const count = (side: Color, grade: Flaw) =>
    stories.filter((s) => s?.by === side && s.grade === grade).length;

  const startFields = startFen.split(" ");

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <p className={cn("text-xl font-bold", HEADLINE_TONE[headline.tone])}>{headline.text}</p>
        <p className="text-xs text-fg-muted">{subtitle}</p>
      </header>

      {card && <div className="sticky top-0 z-raised -mx-1 bg-surface-900 px-1 pb-1">{card}</div>}

      {practice && (
        <Section title="Practice">
          <ol className="flex flex-col gap-1 text-sm">
            {practice.map((item, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: the queue is fixed for the session.
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-ui-md px-2 py-1",
                  item.state === "current" && "bg-fill-strong text-fg-strong",
                )}
              >
                <span
                  className={cn(
                    "w-4 text-center font-bold",
                    item.state === "found" && "text-emerald-400",
                    item.state === "shown" && "text-amber-300",
                    item.state === "waiting" && "text-fg-disabled",
                  )}
                  aria-hidden
                >
                  {item.state === "found"
                    ? "✓"
                    : item.state === "shown"
                      ? "•"
                      : item.state === "current"
                        ? "›"
                        : "·"}
                </span>
                <span className="truncate">{item.label}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section
        title="Evaluation"
        dim={practising}
        aside={
          <span className="truncate font-mono text-2xs text-fg-muted">
            {hover !== null ? describe(hover) : ""}
          </span>
        }
      >
        {progress !== null && (
          <ProgressBar value={progress * 100} label="Analysing the game" size="sm" />
        )}
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <EvalGraph scores={scores} current={ply} onSelect={onGo} ticks={ticks} onHover={setHover} />
      </Section>

      <Section title="Accuracy" dim={practising}>
        <div className="grid grid-cols-2 gap-2">
          {(["w", "b"] as const).map((side) => (
            <div
              key={side}
              className="flex min-w-0 flex-col gap-1 rounded-card-md bg-fill px-2.5 py-2"
            >
              <span className="truncate text-xs text-fg-secondary">{names[side]}</span>
              <span className="text-lg font-bold tabular-nums text-fg-strong">
                {accuracy[side] === null ? "–" : `${accuracy[side]}%`}
              </span>
              <div className="flex gap-1">
                {FLAWS.map((grade) => {
                  const n = count(side, grade);
                  const mark = GRADE_MARK[grade];
                  return (
                    <Button
                      key={grade}
                      size="xs"
                      variant="plain"
                      disabled={n === 0}
                      onClick={() => jump(side, grade)}
                      title={n > 0 ? `Next ${mark.label}` : `No ${mark.label}s`}
                      className="rounded-ui-md px-1 py-0.5 text-xs tabular-nums hover:bg-fill-strong disabled:opacity-40"
                    >
                      <span className={cn("font-bold", mark.className)}>{mark.mark}</span>
                      <span className="ml-0.5 text-fg-secondary">{n}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {moments.length > 0 && (
        <Section title="Key moments" dim={practising}>
          <ol className="flex flex-col">
            {moments.map((m) => {
              const mark = m.grade ? GRADE_MARK[m.grade] : null;
              const label = describe(m.index + 1);
              return (
                <li key={m.index}>
                  <Button
                    variant="plain"
                    size="xs"
                    align="start"
                    block
                    onClick={() => onGo(m.index + 1)}
                    aria-current={ply === m.index + 1 ? "step" : undefined}
                    className={cn(
                      "grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 rounded-ui-md px-2 py-1 text-left text-xs hover:bg-fill",
                      ply === m.index + 1 && "bg-fill-strong",
                    )}
                  >
                    <span className={cn("truncate font-bold", mark?.className ?? "text-fg-strong")}>
                      {label}
                    </span>
                    <span className="truncate text-fg-secondary">{m.words}</span>
                    <span className="font-mono tabular-nums text-fg-muted">
                      {formatScore(m.before)}→{formatScore(m.after)}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {repertoire && (
        <div className={cn(practising && "pointer-events-none opacity-40")}>{repertoire}</div>
      )}

      <Section title="Moves" dim={practising}>
        <MoveList
          history={history}
          viewing={ply === total ? null : ply}
          onSelect={(p) => onGo(p ?? total)}
          startNumber={Number(startFields[5] ?? "1") || 1}
          startsWithBlack={startFields[1] === "b"}
          grades={grades}
          backToLive={false}
        />
        {sideLine && (
          <p className="truncate rounded-ui-md bg-fill px-2 py-1 text-xs text-fg-secondary italic">
            What if: {sideLine}
          </p>
        )}
      </Section>

      <p className="text-2xs text-fg-muted">Stockfish 19 · depth 14 · in your browser</p>
    </div>
  );
}
