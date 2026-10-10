import { type PointerEvent, type ReactNode, useEffect } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PauseIcon,
  PlayIcon,
} from "../../../../components/icons";
import { IconButton } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

interface Props {
  ply: number;
  total: number;
  /** Moves in the side line on show (0: the game itself). */
  lineLength: number;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onGo: (ply: number) => void;
  onStep: (by: 1 | -1) => void;
  /** The slips, as ticks on the track: after which move, in what colour. */
  ticks: readonly { ply: number; fill: string }[];
  /** Off while practising (the task sets the position). */
  disabled?: boolean;
}

/** How long autoplay shows each position. */
const AUTOPLAY_MS = 850;

/** The transport under the board: ⏮ ◀ a scrub track ▶ ⏭, where the board is, autoplay. */
export function AnalysisNav({
  ply,
  total,
  lineLength,
  playing,
  onPlayingChange,
  onGo,
  onStep,
  ticks,
  disabled = false,
}: Props) {
  const atEnd = ply >= total;
  const inLine = lineLength > 0;
  useEffect(() => {
    if (!playing) return;
    if (atEnd || disabled || inLine) {
      onPlayingChange(false);
      return;
    }
    const timer = setTimeout(() => onStep(1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, atEnd, disabled, inLine, onPlayingChange, onStep]);

  const at = (p: number) => `${(total === 0 ? 0 : p / total) * 100}%`;
  const plyAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(total, Math.round(((e.clientX - box.left) / box.width) * total)));
  };
  const button = (label: string, icon: ReactNode, onClick: () => void, off: boolean) => (
    <IconButton
      icon={icon}
      aria-label={label}
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled || off}
    />
  );

  return (
    <div className="flex items-center gap-1">
      {button("Start (Home)", <ChevronsLeftIcon />, () => onGo(0), ply === 0 && !inLine)}
      {button(
        "Previous move (←)",
        <ChevronLeftIcon className="h-4 w-4" />,
        () => onStep(-1),
        ply === 0 && !inLine,
      )}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Move"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ply}
        aria-disabled={disabled}
        className={cn(
          "relative mx-1 h-7 min-w-0 flex-1 touch-none rounded-ui-md focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-400/60",
          disabled ? "opacity-40" : "cursor-pointer",
          inLine && "opacity-50",
        )}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowLeft") onStep(-1);
          else if (e.key === "ArrowRight") onStep(1);
          else if (e.key === "Home") onGo(0);
          else if (e.key === "End") onGo(total);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          onGo(plyAt(e));
        }}
        onPointerMove={(e) => {
          if (!disabled && e.buttons === 1) onGo(plyAt(e));
        }}
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
        <span
          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent-400/80"
          style={{ width: at(ply) }}
        />
        {ticks.map((t) => (
          <span
            key={t.ply}
            aria-hidden
            className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: at(t.ply), background: t.fill }}
          />
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300 ring-4 ring-accent-400/20 transition-[left] duration-150"
          style={{ left: at(ply) }}
        />
      </div>
      {button(
        "Next move (→)",
        <ChevronRightIcon className="h-4 w-4" />,
        () => onStep(1),
        atEnd || inLine,
      )}
      {button("End (End)", <ChevronsRightIcon />, () => onGo(total), atEnd && !inLine)}
      <span
        className="w-14 shrink-0 text-right font-mono text-2xs tabular-nums text-fg-muted"
        aria-live="polite"
      >
        {inLine ? `line +${lineLength}` : `${ply}/${total}`}
      </span>
      <IconButton
        icon={playing ? <PauseIcon /> : <PlayIcon />}
        aria-label={playing ? "Pause" : "Play through the game"}
        variant="bordered"
        size="sm"
        pressed={playing}
        onClick={() => {
          if (!playing && atEnd) onGo(0);
          onPlayingChange(!playing);
        }}
        disabled={disabled || inLine}
      />
    </div>
  );
}
