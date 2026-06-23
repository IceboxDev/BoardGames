import { useCallback, useEffect, useRef, useState } from "react";

// ── useReplayPlayback ────────────────────────────────────────────────────
//
// The shared transport state behind every game replay: a clamped step index,
// an interval-driven autoplay that halts at the final step, and a speed
// setting. Each game's replay reads `stepIndex` to derive the board snapshot
// for that step and renders `<ReplayControls playback={…}>` for the UI.
// Extracted from the byte-identical machinery that Lost Cities and Exploding
// Kittens each carried inline.

export type ReplayPlayback = {
  stepIndex: number;
  stepCount: number;
  playing: boolean;
  speed: number;
  isFirst: boolean;
  isLast: boolean;
  setSpeed: (ms: number) => void;
  play: () => void;
  stop: () => void;
  goTo: (index: number) => void;
};

export function useReplayPlayback(stepCount: number, initialSpeed = 500): ReplayPlayback {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastIndex = Math.max(0, stepCount - 1);

  const stop = useCallback(() => {
    setPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (stepIndex >= stepCount - 1) return;
    setPlaying(true);
  }, [stepIndex, stepCount]);

  const goTo = useCallback(
    (index: number) => {
      stop();
      setStepIndex(Math.max(0, Math.min(index, stepCount - 1)));
    },
    [stop, stepCount],
  );

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= stepCount - 1) {
          stop();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, stepCount, stop]);

  return {
    stepIndex,
    stepCount,
    playing,
    speed,
    isFirst: stepIndex === 0,
    isLast: stepIndex >= lastIndex,
    setSpeed,
    play,
    stop,
    goTo,
  };
}
