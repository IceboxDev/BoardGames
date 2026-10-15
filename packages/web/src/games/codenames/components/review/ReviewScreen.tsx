import { useEffect, useMemo, useState } from "react";
import type { GameOverAction } from "../../../../components/game-over";
import { ChevronLeftIcon, ChevronRightIcon } from "../../../../components/icons";
import { Button, IconButton } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { Highlight, ReviewModel } from "../../logic/review";
import { type CoverTone, WordGrid } from "../WordGrid";
import { RaceChart } from "./RaceChart";
import { TurnCard } from "./TurnCard";

// The debrief, shared by Codenames and Duet (game over, and saved replays):
// the result in one line on top, the game's highlights, then the board beside
// the turn-by-turn story. Pick a turn (in the list, on the race chart, or with
// ← →) and the board shows that turn: what was already covered, the clue's
// targets outlined, the cards touched numbered in order.

export type ResultTone = "win" | "lose" | "neutral";

const TITLE_INK: Record<ResultTone, string> = {
  win: "text-emerald-300",
  lose: "text-rose-300",
  neutral: "text-fg-strong",
};

const GLOW: Record<ResultTone, string> = {
  win: "via-emerald-400/60",
  lose: "via-rose-400/60",
  neutral: "via-accent-400/50",
};

const TILE_INK: Record<CoverTone | "neutral", string> = {
  red: "text-cn-red",
  blue: "text-cn-blue",
  tan: "text-cn-tan",
  ink: "text-fg-strong",
  green: "text-cn-green",
  neutral: "text-fg-strong",
};

const TILE_EDGE: Record<CoverTone | "neutral", string> = {
  red: "from-cn-red/25",
  blue: "from-cn-blue/25",
  tan: "from-cn-tan/25",
  ink: "from-fg-strong/10",
  green: "from-cn-green/25",
  neutral: "from-accent-500/15",
};

/** "3 to find", or "done" once a side has found every agent. */
function LeftToFind({ left }: { left: number }) {
  return left === 0 ? (
    <span className="font-bold text-emerald-300">all found</span>
  ) : (
    <span className="text-fg-muted">
      <span className="font-bold tabular-nums text-fg-strong">{left}</span> to find
    </span>
  );
}

function HighlightTile({ h }: { h: Highlight }) {
  return (
    <div
      className={cn(
        "flex min-w-44 flex-1 flex-col gap-0.5 rounded-card-lg border border-line-soft bg-gradient-to-br to-transparent px-4 py-3",
        TILE_EDGE[h.tone],
      )}
    >
      <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
        {h.label}
      </span>
      <span className={cn("truncate text-lg font-black uppercase tracking-pill", TILE_INK[h.tone])}>
        {h.value}
      </span>
      <span className="truncate text-3xs text-fg-secondary">{h.detail}</span>
    </div>
  );
}

export function ReviewScreen({
  title,
  tone,
  detail,
  actions = [],
  onBack,
  model,
  aside,
  notice,
}: {
  title: string;
  tone: ResultTone;
  detail: string;
  actions?: readonly GameOverAction[];
  /** A replay's way back (instead of play-again actions). */
  onBack?: () => void;
  model: ReviewModel;
  /** Extra panel above the turn list (Duet's timer). */
  aside?: React.ReactNode;
  /** A line under the result: a room waiting on its host, a refused rematch. */
  notice?: { text: string; tone: "info" | "error" } | null;
}) {
  const [shown, setShown] = useState<number | null>(null);
  const last = model.turns.length - 1;
  const board = useMemo(() => model.boardAt(shown), [model, shown]);
  const turnTones = model.turns.map((t) => t.tone);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        setShown((s) => (s === null ? last : Math.max(0, s - 1)));
      } else if (e.key === "ArrowRight") {
        setShown((s) => (s === null || s >= last ? null : s + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const caption =
    shown === null
      ? "The final board — every card's identity showing"
      : `Turn ${shown + 1} of ${last + 1} — targets outlined, touches numbered`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <header className="relative flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className={cn("shrink-0 text-2xl font-black tracking-tight", TITLE_INK[tone])}>
            {title}
          </h1>
          <p className="min-w-0 truncate text-sm text-fg-muted">{detail}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {onBack && (
            <Button size="sm" variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
          {actions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant === "primary" ? "primary" : "ghost"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent",
            GLOW[tone],
          )}
        />
      </header>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex shrink-0 items-center gap-2 px-4 pt-3 text-xs lg:px-8",
            notice.tone === "error" ? "text-amber-300" : "text-fg-secondary",
          )}
        >
          {notice.tone === "info" && (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-accent-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-accent-400" />
            </span>
          )}
          {notice.text}
        </p>
      )}

      {model.highlights.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pt-3 lg:px-8">
          {model.highlights.map((h) => (
            <HighlightTile key={h.label} h={h} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 p-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:grid-rows-[minmax(0,1fr)] lg:px-8">
        <section className="flex flex-col gap-2 lg:min-h-0">
          <div className="flex items-center gap-2">
            <IconButton
              variant="bordered"
              size="sm"
              icon={<ChevronLeftIcon />}
              aria-label="Previous turn"
              disabled={shown === 0}
              onClick={() => setShown((s) => (s === null ? last : Math.max(0, s - 1)))}
            />
            <IconButton
              variant="bordered"
              size="sm"
              icon={<ChevronRightIcon />}
              aria-label="Next turn"
              disabled={shown === null}
              onClick={() => setShown((s) => (s === null || s >= last ? null : s + 1))}
            />
            <Button
              size="sm"
              variant={shown === null ? "secondary" : "ghost"}
              onClick={() => setShown(null)}
            >
              Final board
            </Button>
            <span className="ml-1 min-w-0 truncate text-xs text-fg-muted">{caption}</span>
          </div>
          <div className="flex items-center gap-4 rounded-card-lg border border-line-soft bg-fill-soft px-3 py-2">
            <div className="flex shrink-0 flex-col gap-1">
              {model.series.map((s) => (
                <span key={s.label} className="flex items-baseline gap-1.5 text-xs">
                  <span className={cn("font-black uppercase tracking-pill", TILE_INK[s.tone])}>
                    {s.label}
                  </span>
                  <LeftToFind
                    left={(shown === null ? s.points.at(-1) : s.points[shown + 1]) ?? 0}
                  />
                </span>
              ))}
            </div>
            <RaceChart
              series={model.series}
              turnTones={turnTones}
              shown={shown}
              onShow={setShown}
            />
          </div>
          <div className="flex aspect-[5/6] w-full flex-col sm:aspect-[8/5] lg:aspect-auto lg:min-h-0 lg:flex-1">
            <WordGrid cards={board} />
          </div>
        </section>

        <aside className="flex flex-col gap-2 lg:min-h-0">
          {aside}
          <div className="flex min-h-0 flex-col gap-2 lg:overflow-y-auto lg:pr-1">
            {model.turns.map((turn) => (
              <TurnCard
                key={turn.index}
                turn={turn}
                selected={shown === turn.index}
                onSelect={() => setShown((s) => (s === turn.index ? null : turn.index))}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
