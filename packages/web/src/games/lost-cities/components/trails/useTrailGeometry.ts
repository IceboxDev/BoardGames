import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * Card sizes for the five trails, computed from the board's own box and never
 * from what is on it. Every lane is reserved for all twelve cards of an
 * expedition, so a line that grows fills its lane and nothing on the board
 * moves or rescales; only a window resize changes these numbers.
 */
export interface TrailGeometry {
  /** Card width in your lane (px); a card is 1.5× as tall. */
  cw: number;
  ch: number;
  /** How far each card in a line sits below the previous: its band. */
  step: number;
  /** The lane's full height: one card plus eleven steps. */
  laneH: number;
  /** Width of the camp (discard pile) card. */
  camp: number;
  /** The opponent's log: 6 × 2 chips, or 4 × 3 on phones; chip width and height. */
  logCols: number;
  chipW: number;
  chipH: number;
  /** Narrow layout (phones): shorter header, no camp label. */
  narrow: boolean;
}

const GAP = 8;
/** A line shows each card's band: a fifth of its height. */
const STEP = 0.2;
const CAMP = 0.75;

export function trailGeometry(width: number, height: number): TrailGeometry {
  const narrow = width < 600;
  const colW = (width - 4 * (narrow ? 4 : GAP)) / 5;
  const logCols = narrow ? 4 : 6;
  const chipW = Math.max(10, Math.floor(Math.min(22, (colW - (narrow ? 8 : 18)) / logCols)));
  const chipH = Math.round(chipW * 1.1);
  const logRows = 12 / logCols;
  // Header, the opponent's chip rows, the camp label and paddings.
  const fixed = (narrow ? 62 : 70) + (logRows * chipH + 15) + (narrow ? 12 : 38) + 14;
  const byHeight = (height - fixed) / (CAMP + 1 + 11 * STEP) / 1.5;
  const byWidth = colW - (narrow ? 8 : 28);
  const cw = Math.max(24, Math.floor(Math.min(byHeight, byWidth, 96)));
  const ch = Math.round(cw * 1.5);
  const step = Math.round(ch * STEP);
  return {
    cw,
    ch,
    step,
    laneH: ch + 11 * step,
    camp: Math.round(cw * CAMP),
    logCols,
    chipW,
    chipH,
    narrow,
  };
}

/** {@link trailGeometry} for an element, kept current as it resizes. */
export function useTrailGeometry(ref: RefObject<HTMLElement | null>): TrailGeometry | null {
  const [geo, setGeo] = useState<TrailGeometry | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const next = trailGeometry(width, height);
        setGeo((prev) =>
          prev && prev.cw === next.cw && prev.chipW === next.chipW && prev.narrow === next.narrow
            ? prev
            : next,
        );
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [ref]);
  return geo;
}
