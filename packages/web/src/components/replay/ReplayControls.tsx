import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import type { ReplayPlayback } from "./useReplayPlayback";

// ── ReplayControls ───────────────────────────────────────────────────────
//
// The shared transport bar for every game replay: first / prev / play-pause /
// next / last, a scrubber, the step counter, and a speed picker. Pairs with
// `useReplayPlayback`, which owns the step/play/speed state. Lost Cities and
// Exploding Kittens (and any future replay) render this instead of
// re-implementing the same six buttons + slider + select — previously a
// byte-for-byte copy down to the `!important` red Pause override.

const SPEEDS = [
  { ms: 1000, label: "1s" },
  { ms: 500, label: "0.5s" },
  { ms: 250, label: "0.25s" },
  { ms: 100, label: "0.1s" },
] as const;

type ReplayControlsProps = {
  playback: ReplayPlayback;
  /** Caption above the transport — typically the current step's description. */
  description?: string;
  className?: string;
};

export function ReplayControls({ playback, description, className = "" }: ReplayControlsProps) {
  const { stepIndex, stepCount, playing, speed, setSpeed, play, stop, goTo, isFirst, isLast } =
    playback;
  const last = Math.max(0, stepCount - 1);

  const outer = ["flex shrink-0 flex-col gap-1.5", className].filter(Boolean).join(" ");

  return (
    <div className={outer}>
      {description != null && (
        <p className="truncate px-2 text-center text-2xs text-fg-secondary" title={description}>
          {description}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" size="xs" onClick={() => goTo(0)} disabled={isFirst} title="First">
          ⟨⟨
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goTo(stepIndex - 1)}
          disabled={isFirst}
        >
          Prev
        </Button>
        {playing ? (
          <Button variant="danger" size="sm" onClick={stop}>
            Pause
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={play} disabled={isLast}>
            Play
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => goTo(stepIndex + 1)} disabled={isLast}>
          Next
        </Button>
        <Button variant="ghost" size="xs" onClick={() => goTo(last)} disabled={isLast} title="Last">
          ⟩⟩
        </Button>
        <input
          type="range"
          min={0}
          max={last}
          value={stepIndex}
          onChange={(e) => goTo(Number(e.target.value))}
          aria-label="Replay position"
          className="h-1.5 min-w-[8rem] flex-1 accent-accent-500"
        />
        <span className="min-w-[4rem] text-right text-xs tabular-nums text-fg-muted">
          {stepIndex} / {last}
        </span>
        <Select
          block={false}
          compact
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s.ms} value={s.ms}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
