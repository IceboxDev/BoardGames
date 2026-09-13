import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLACEMENTS,
  MAX_NODE_SCALE,
  type MapOrientation,
  MIN_NODE_SCALE,
  type NodePlacement,
  placementsToSource,
} from "../geometry";

// Dev-only placement editing for the Sensō map.
//
// Off (null) in production and whenever the URL has no `?adjust`, so the
// map renders the frozen placements from geometry.ts. On, the map builds its
// layout from this hook's state instead: every drag, resize and arrangement
// flip lands here, is mirrored to localStorage (a reload keeps the work in
// progress), and can be copied out as the TypeScript literal to paste back
// into geometry.ts — that paste is how a placement becomes permanent.

export interface MapAdjust {
  orientation: MapOrientation;
  placements: readonly NodePlacement[];
  selected: number | null;
  select: (region: number | null) => void;
  update: (region: number, patch: Partial<NodePlacement>) => void;
  /** Multiply every card's scale (the "resize them all" knob). */
  scaleAll: (factor: number) => void;
  reset: () => void;
  source: string;
}

export function isMapAdjustRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("adjust");
}

function storageKey(orientation: MapOrientation): string {
  return `senso-map-placements:${orientation}`;
}

function isPlacement(p: unknown): p is NodePlacement {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.scale === "number" &&
    (o.arrangement === "column" || o.arrangement === "row")
  );
}

function loadSaved(orientation: MapOrientation): NodePlacement[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(orientation));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isPlacement)) return null;
    if (parsed.length !== DEFAULT_PLACEMENTS[orientation].length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(orientation: MapOrientation, placements: readonly NodePlacement[]): void {
  try {
    window.localStorage.setItem(storageKey(orientation), JSON.stringify(placements));
  } catch {
    // Best-effort: adjusting still works within the session.
  }
}

export function clampScale(s: number): number {
  return Math.min(MAX_NODE_SCALE, Math.max(MIN_NODE_SCALE, Math.round(s * 100) / 100));
}

export function useMapPlacements(orientation: MapOrientation): MapAdjust | null {
  const active = isMapAdjustRequested();
  const [placements, setPlacements] = useState<readonly NodePlacement[]>(() =>
    active ? (loadSaved(orientation) ?? DEFAULT_PLACEMENTS[orientation]) : [],
  );
  const [selected, setSelected] = useState<number | null>(null);

  // The viewport can flip the orientation mid-session: swap in that
  // orientation's saved (or stock) placements.
  useEffect(() => {
    if (!active) return;
    setPlacements(loadSaved(orientation) ?? DEFAULT_PLACEMENTS[orientation]);
  }, [active, orientation]);

  const update = useCallback(
    (region: number, patch: Partial<NodePlacement>) => {
      setPlacements((prev) => {
        const next = prev.map((p, i) => {
          if (i !== region) return p;
          const merged = { ...p, ...patch };
          return {
            ...merged,
            x: Math.round(merged.x),
            y: Math.round(merged.y),
            scale: clampScale(merged.scale),
          };
        });
        save(orientation, next);
        return next;
      });
    },
    [orientation],
  );

  const scaleAll = useCallback(
    (factor: number) => {
      setPlacements((prev) => {
        const next = prev.map((p) => ({ ...p, scale: clampScale(p.scale * factor) }));
        save(orientation, next);
        return next;
      });
    },
    [orientation],
  );

  // Back to the frozen placements — and nothing saved, so the next load
  // starts from geometry.ts again.
  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey(orientation));
    } catch {
      // ignore
    }
    setPlacements(DEFAULT_PLACEMENTS[orientation]);
  }, [orientation]);

  const source = useMemo(
    () => (active ? placementsToSource(orientation, placements) : ""),
    [active, orientation, placements],
  );

  if (!active) return null;
  return {
    orientation,
    placements,
    selected,
    select: setSelected,
    update,
    scaleAll,
    reset,
    source,
  };
}
