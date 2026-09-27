// Bench strategy specs: `name` or `name:key=value,key=value`. A spec with
// options registers a bench-only variant under the full spec string, so a
// seat's `aiStrategy` can carry it (e.g. `strigoi:rollouts=384`).
import { type HungerStrategy, registerStrategy } from "./ai-strategies";
import { DEFAULT_DRACULA, draculaPick } from "./search/dracula";
import { DEFAULT_STRIGOI, strigoiPick } from "./search/strigoi";
import { type AIStrategyId, ALL_STRATEGIES } from "./types";

type Factory = (opts: Record<string, number>) => HungerStrategy["pickAction"];

const FACTORIES: Record<string, Factory> = {
  dracula: (opts) => {
    const cfg = { ...DEFAULT_DRACULA, ...opts };
    return (state, seat, legal) => draculaPick(state, seat, legal, cfg);
  },
  strigoi: (opts) => {
    const cfg = { ...DEFAULT_STRIGOI, ...opts };
    return (state, seat, legal) => strigoiPick(state, seat, legal, cfg);
  },
};

export function parseSpec(spec: string): { name: string; opts: Record<string, number> } {
  const [name, rest] = spec.split(":", 2);
  const opts: Record<string, number> = {};
  if (rest) {
    for (const kv of rest.split(",")) {
      const [k, v] = kv.split("=");
      if (!k || v === undefined || Number.isNaN(Number(v))) throw new Error(`Bad option ${kv}`);
      opts[k] = Number(v);
    }
  }
  return { name, opts };
}

/** Make `spec` playable as a seat strategy id; returns the id to seat. */
export function seatForSpec(spec: string): AIStrategyId {
  const { name, opts } = parseSpec(spec);
  const shipped = ALL_STRATEGIES.some((s) => s.id === name);
  if (shipped && Object.keys(opts).length === 0) return name as AIStrategyId;
  const factory = FACTORIES[name];
  // An unknown id would silently play Nosferatu (getStrategy's default).
  if (!factory) throw new Error(`Unknown strategy spec ${spec}`);
  registerStrategy({
    id: spec as AIStrategyId,
    label: spec,
    description: spec,
    pickAction: factory(opts),
  });
  return spec as AIStrategyId;
}
