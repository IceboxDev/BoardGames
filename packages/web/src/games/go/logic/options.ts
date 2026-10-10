import type { GoConfigInput } from "@boardgames/core/games/go/manifest";
import type { TimeControl } from "@boardgames/core/machines/clock";

/** The clock presets the setup screens offer. */
export const TIME_PRESETS = {
  none: { label: "Untimed", control: { kind: "none" } },
  blitz: { label: "5m + 5s", control: { kind: "fischer", mainSec: 300, incrementSec: 5 } },
  rapid: {
    label: "10m + 5×30s",
    control: { kind: "byoyomi", mainSec: 600, periods: 5, periodSec: 30 },
  },
  long: {
    label: "30m + 5×60s",
    control: { kind: "byoyomi", mainSec: 1800, periods: 5, periodSec: 60 },
  },
} as const satisfies Record<string, { label: string; control: TimeControl }>;
export type TimePreset = keyof typeof TIME_PRESETS;

export function presetOf(tc: TimeControl | undefined): TimePreset {
  if (!tc || tc.kind === "none") return "none";
  for (const [id, p] of Object.entries(TIME_PRESETS)) {
    if (JSON.stringify(p.control) === JSON.stringify(tc)) return id as TimePreset;
  }
  return "none";
}

/** What the options controls edit: the manifest's input shape, size made concrete. */
export interface GoOptionsValue {
  readonly size: 9 | 13 | 19;
  readonly handicap: number;
  /** `null`: the automatic komi. */
  readonly komi: number | null;
  readonly time: TimePreset;
}

export const DEFAULT_OPTIONS: GoOptionsValue = { size: 9, handicap: 0, komi: null, time: "none" };

export function toConfig(o: GoOptionsValue): GoConfigInput {
  return {
    size: o.size,
    handicap: o.handicap,
    ...(o.komi === null ? {} : { komi: o.komi }),
    timeControl: TIME_PRESETS[o.time].control,
  };
}

export function fromConfig(raw: unknown): GoOptionsValue {
  if (typeof raw !== "object" || raw === null) return DEFAULT_OPTIONS;
  const r = raw as Partial<Record<keyof GoConfigInput, unknown>>;
  const size = r.size === 9 || r.size === 13 || r.size === 19 ? r.size : DEFAULT_OPTIONS.size;
  return {
    size,
    handicap: typeof r.handicap === "number" ? r.handicap : 0,
    komi: typeof r.komi === "number" ? r.komi : null,
    time: presetOf(r.timeControl as TimeControl | undefined),
  };
}

/** Komi the game will use for these options. */
export function effectiveKomi(o: GoOptionsValue): number {
  return o.komi ?? (o.handicap > 0 ? 0.5 : 7.5);
}
