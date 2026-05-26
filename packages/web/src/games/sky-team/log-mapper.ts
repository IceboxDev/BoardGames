import type { PlayerIndex, SkyTeamLogEntry, SlotId } from "@boardgames/core/games/sky-team/types";
import type { LogAction, LogBlock, LogVariant } from "../../components/action-log";

function playerLabel(p: PlayerIndex | -1): string {
  if (p === 0) return "Pilot";
  if (p === 1) return "Co-Pilot";
  return "System";
}

/**
 * Friendly slot name for the history — collapses the specific slot id (e.g.
 * "copilot-radio-2", "landing-gear-3") into the control surface a player
 * actually thinks of ("Radio", "Landing Gear"). The exact slot id stays in
 * dev logs; the action log is for the end user.
 */
function friendlySlotName(slot: SlotId): string {
  if (slot === "pilot-axis" || slot === "copilot-axis") return "Axis";
  if (slot === "pilot-engine" || slot === "copilot-engine") return "Engine";
  if (slot === "pilot-radio" || slot === "copilot-radio-1" || slot === "copilot-radio-2") {
    return "Radio";
  }
  if (slot === "landing-gear-1" || slot === "landing-gear-2" || slot === "landing-gear-3") {
    return "Landing Gear";
  }
  if (slot === "flaps-1" || slot === "flaps-2" || slot === "flaps-3" || slot === "flaps-4") {
    return "Flaps";
  }
  if (slot === "brakes-2" || slot === "brakes-4" || slot === "brakes-6") return "Brakes";
  if (slot === "concentration-1" || slot === "concentration-2" || slot === "concentration-3") {
    return "Concentration";
  }
  return slot;
}

function slotIcon(slot: SlotId): string {
  if (slot === "pilot-axis" || slot === "copilot-axis") return "↔";
  if (slot === "pilot-engine" || slot === "copilot-engine") return "⚙";
  if (slot === "pilot-radio" || slot === "copilot-radio-1" || slot === "copilot-radio-2") {
    return "📻";
  }
  if (slot.startsWith("landing-gear")) return "🛬";
  if (slot.startsWith("flaps")) return "🪶";
  if (slot.startsWith("brakes")) return "🛑";
  if (slot.startsWith("concentration")) return "☕";
  return "▣";
}

function outcomeText(outcome: string): string {
  switch (outcome) {
    case "win":
      return "Landed safely — mission complete!";
    case "loss-spin":
      return "Plane spun out (axis hit the red X)";
    case "loss-collision":
      return "Collided with an airliner";
    case "loss-overshoot":
      return "Overshot the airport";
    case "loss-overrun":
      return "Overran the runway — too fast at landing";
    case "loss-undershoot":
      return "Undershot the airport — descended too early";
    case "loss-mandatory":
      return "A required slot was left empty";
    case "loss-airliners-remain":
      return "Airliners still on the approach at landing";
    case "loss-gear-or-flaps":
      return "Landing gear or flaps not fully deployed";
    case "loss-axis-not-level":
      return "Plane wasn't level at landing";
    default:
      return outcome;
  }
}

type EffectEntry = Extract<
  SkyTeamLogEntry,
  { t: "axis-update" | "engine-resolve" | "radio" | "gear" | "flaps" | "brakes" | "coffee-gained" }
>;

const EFFECT_TYPES = new Set<EffectEntry["t"]>([
  "axis-update",
  "engine-resolve",
  "radio",
  "gear",
  "flaps",
  "brakes",
  "coffee-gained",
]);

/**
 * Build the "— effect" suffix appended after a placement line. `dieValue`
 * is the value the die went down with (post-coffee adjust); used for radio
 * relative-space numbering since radio always targets `current + value - 1`,
 * i.e. relative space = die value.
 */
function effectSuffix(
  effect: EffectEntry,
  dieValue: number,
): { text: string; variant: LogVariant } {
  switch (effect.t) {
    case "axis-update": {
      const sign = effect.pos > 0 ? "+" : "";
      return {
        text: ` — axis tilts to ${sign}${effect.pos}`,
        variant: effect.pos === 0 ? "success" : "warning",
      };
    }
    case "engine-resolve": {
      if (effect.finalRound) {
        return {
          text: ` — engines synced (final round, speed ${effect.speed})`,
          variant: "info",
        };
      }
      const advanced =
        effect.advance === 0
          ? "held position"
          : `advanced ${effect.advance} space${effect.advance === 1 ? "" : "s"}`;
      return {
        text: ` — engines synced: speed ${effect.speed}, ${advanced}`,
        variant: effect.advance > 0 ? "success" : "info",
      };
    }
    case "radio":
      return effect.removed
        ? { text: ` — cleared an airliner at space ${dieValue}`, variant: "success" }
        : { text: ` — no airliner at space ${dieValue}`, variant: "neutral" };
    case "gear":
      return {
        text: ` — switch engaged (blue marker → ${effect.bluePos + 1})`,
        variant: "success",
      };
    case "flaps":
      return {
        text: ` — switch engaged (orange marker → ${effect.orangePos + 1})`,
        variant: "success",
      };
    case "brakes":
      return { text: " — brake engaged", variant: "success" };
    case "coffee-gained":
      return { text: ` — coffee gained (${effect.total} total)`, variant: "info" };
  }
}

export function mapSkyTeamLog(
  entries: readonly SkyTeamLogEntry[],
  playerNames?: [string, string],
): LogBlock[] {
  const blocks: LogBlock[] = [];
  let current: LogBlock | null = null;

  const naming = (p: PlayerIndex | -1) => {
    if (p === -1) return playerLabel(p);
    return playerNames?.[p] ?? playerLabel(p);
  };

  const ensureBlock = () => {
    if (!current) {
      current = { key: "pre", label: "Setup", actions: [] };
      blocks.push(current);
    }
    return current;
  };

  const push = (action: LogAction) => {
    ensureBlock().actions.push(action);
  };

  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    const actionKey = `${i}`;

    if (e.t === "round-start") {
      current = { key: `round-${e.round}`, label: `Round ${e.round}`, actions: [] };
      blocks.push(current);
      i++;
      continue;
    }

    if (e.t === "place") {
      // Merge the immediate follow-up effect (axis-update / engine-resolve /
      // radio / gear / flaps / brakes / coffee-gained) into the same line.
      // The effect log only fires when the placement actually triggers one
      // (e.g. axis fires once BOTH axis dice are down).
      const next = entries[i + 1];
      const effect =
        next && EFFECT_TYPES.has(next.t as EffectEntry["t"]) ? (next as EffectEntry) : null;
      const slotName = friendlySlotName(e.slot);
      const coffee =
        e.coffeeAdjust !== 0 ? ` (coffee ${e.coffeeAdjust > 0 ? "+" : ""}${e.coffeeAdjust})` : "";
      const { text: suffix, variant } = effect
        ? effectSuffix(effect, e.value)
        : { text: "", variant: "action" as LogVariant };
      push({
        key: actionKey,
        icon: slotIcon(e.slot),
        spans: [
          { text: `${naming(e.player)} placed ` },
          { text: `${e.value}`, bold: true },
          { text: ` on ${slotName}${coffee}${suffix}` },
        ],
        variant,
      });
      i += effect ? 2 : 1;
      continue;
    }

    switch (e.t) {
      case "ready":
        // "Ready to roll" entries are dev noise — pilots ready up every round
        // before the dice are rolled; the actual roll line is the meaningful
        // event. Skip them.
        break;
      case "roll":
        push({
          key: actionKey,
          icon: "🎲",
          spans: [{ text: `${naming(e.player)} rolled ${e.values.length} dice` }],
          variant: "info",
        });
        break;
      case "reroll":
        push({
          key: actionKey,
          icon: "🔁",
          spans: [
            {
              text: `Rerolled ${e.pilotIds.length + e.copilotIds.length} dice (${e.remaining} reroll${e.remaining === 1 ? "" : "s"} left)`,
            },
          ],
          variant: "special",
        });
        break;
      case "coffee-spent":
        push({
          key: actionKey,
          icon: "☕",
          spans: [{ text: `Spent ${e.amount} coffee` }],
          variant: "info",
        });
        break;
      case "round-end":
        push({
          key: actionKey,
          icon: "⤓",
          spans: [
            {
              text: `Descended to ${e.altitude} ft${e.collectedReroll ? " (+1 reroll)" : ""}${e.isFinalNext ? " — next is final approach" : ""}`,
            },
          ],
          variant: "info",
        });
        break;
      case "outcome":
        push({
          key: actionKey,
          icon: e.outcome === "win" ? "✓" : "✗",
          spans: [{ text: outcomeText(e.outcome), bold: true }],
          variant: e.outcome === "win" ? "success" : "danger",
        });
        break;
      // Effect entries reached on their own (i.e. NOT immediately preceded by
      // a `place` we've already consumed) — fall back to a standalone line.
      case "axis-update":
      case "engine-resolve":
      case "radio":
      case "gear":
      case "flaps":
      case "brakes":
      case "coffee-gained": {
        const { text, variant } = effectSuffix(e as EffectEntry, 0);
        push({
          key: actionKey,
          icon: "•",
          spans: [{ text: text.replace(/^ — /, "") }],
          variant,
        });
        break;
      }
    }
    i++;
  }

  return blocks;
}
