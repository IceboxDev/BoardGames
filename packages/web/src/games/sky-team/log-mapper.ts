import type { PlayerIndex, SkyTeamLogEntry } from "@boardgames/core/games/sky-team/types";
import type { LogBlock } from "../../components/action-log";

function playerLabel(p: PlayerIndex | -1): string {
  if (p === 0) return "Pilot";
  if (p === 1) return "Co-Pilot";
  return "System";
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

  for (const e of entries) {
    if (e.t === "round-start") {
      current = {
        key: `round-${e.round}`,
        label: `Round ${e.round}`,
        actions: [],
      };
      blocks.push(current);
      continue;
    }
    if (!current) {
      current = { key: "pre", label: "Setup", actions: [] };
      blocks.push(current);
    }
    const actionKey = `${current.actions.length}`;
    switch (e.t) {
      case "ready":
        current.actions.push({
          key: actionKey,
          icon: "✓",
          spans: [{ text: `${naming(e.player)} ready to roll` }],
          variant: "info",
        });
        break;
      case "roll":
        current.actions.push({
          key: actionKey,
          icon: "🎲",
          spans: [{ text: `${naming(e.player)} rolled (${e.values.length} dice)` }],
          variant: "info",
        });
        break;
      case "place":
        current.actions.push({
          key: actionKey,
          icon: "▣",
          spans: [
            { text: `${naming(e.player)} → ` },
            { text: e.slot, bold: true },
            { text: ` (${e.value})` },
            ...(e.coffeeAdjust !== 0
              ? [{ text: `, coffee ${e.coffeeAdjust > 0 ? "+" : ""}${e.coffeeAdjust}` }]
              : []),
          ],
          variant: "action",
        });
        break;
      case "axis-update":
        current.actions.push({
          key: actionKey,
          icon: "↔",
          spans: [{ text: `Axis → ${e.pos}` }],
          variant: e.pos === 0 ? "success" : "warning",
        });
        break;
      case "engine-resolve":
        current.actions.push({
          key: actionKey,
          icon: "⚙",
          spans: [
            {
              text: `Engines: speed ${e.speed}, advance ${e.advance}${
                e.finalRound ? " (final)" : ""
              }`,
            },
          ],
          variant: "info",
        });
        break;
      case "radio":
        current.actions.push({
          key: actionKey,
          icon: "📻",
          spans: [
            {
              text: e.removed
                ? `Radio cleared an airliner at space ${e.targetSpace + 1}`
                : `Radio missed at space ${e.targetSpace + 1}`,
            },
          ],
          variant: e.removed ? "success" : "neutral",
        });
        break;
      case "gear":
        current.actions.push({
          key: actionKey,
          icon: "🛬",
          spans: [{ text: `${e.slot} deployed (blue → ${e.bluePos})` }],
          variant: "success",
        });
        break;
      case "flaps":
        current.actions.push({
          key: actionKey,
          icon: "🪶",
          spans: [{ text: `${e.slot} extended (orange → ${e.orangePos})` }],
          variant: "success",
        });
        break;
      case "brakes":
        current.actions.push({
          key: actionKey,
          icon: "🛑",
          spans: [{ text: `${e.slot} engaged (brake → ${e.brakePos})` }],
          variant: "success",
        });
        break;
      case "coffee-gained":
        current.actions.push({
          key: actionKey,
          icon: "☕",
          spans: [{ text: `Coffee gained (${e.total} total)` }],
          variant: "info",
        });
        break;
      case "coffee-spent":
        current.actions.push({
          key: actionKey,
          icon: "☕",
          spans: [{ text: `Coffee spent (${e.amount})` }],
          variant: "info",
        });
        break;
      case "reroll":
        current.actions.push({
          key: actionKey,
          icon: "🔁",
          spans: [
            {
              text: `Reroll spent (${e.pilotIds.length + e.copilotIds.length} dice; ${e.remaining} tokens left)`,
            },
          ],
          variant: "special",
        });
        break;
      case "round-end":
        current.actions.push({
          key: actionKey,
          icon: "⤓",
          spans: [
            {
              text: `Round ended; altitude ${e.altitude} ft${
                e.collectedReroll ? " (+1 reroll)" : ""
              }${e.isFinalNext ? " — next is final" : ""}`,
            },
          ],
          variant: "info",
        });
        break;
      case "outcome":
        current.actions.push({
          key: actionKey,
          icon: e.outcome === "win" ? "✓" : "✗",
          spans: [{ text: e.outcome, bold: true }],
          variant: e.outcome === "win" ? "success" : "danger",
        });
        break;
    }
  }

  return blocks;
}
