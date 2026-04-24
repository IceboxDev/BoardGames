import type {
  ActionLogAction,
  ActionLogEntry,
  CanteenEffect,
  GearKind,
  PassionId,
  ResourceType,
  SiteType,
  TrailDieFace,
} from "@boardgames/core/games/parks/types";
import {
  CANTEEN_LABELS,
  GEAR_LABELS,
  PASSION_LABELS,
  RESOURCE_COLORS,
  RESOURCE_EMOJI,
  RESOURCE_LABELS,
  SEASON_LABELS,
  SEASON_MISSION_LABELS,
  SITE_LABELS,
  TRAIL_DIE_LABELS,
} from "@boardgames/core/games/parks/types";
import type {
  LogAction,
  LogBlock,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<ActionLogAction, LogVariant> = {
  "choose-passion": "special",
  "passion-mode": "special",
  "passion-goal-met": "success",
  move: "action",
  "site-effect": "info",
  "weather-token": "success",
  "use-canteen": "action",
  "place-water": "action",
  "buy-park": "success",
  "reserve-park": "info",
  exchange: "info",
  "take-canteen": "info",
  "snap-photo": "special",
  "trail-die": "info",
  "skip-park": "neutral",
  "buy-gear": "success",
  "activate-gear": "action",
  "campfire-lit": "info",
  "campfire-extinguished": "warning",
  "shutterbug-placed": "info",
  "shutterbug-taken": "success",
  "first-player-token": "special",
  "trail-end-bonus": "success",
  "discard-resource": "warning",
  pass: "neutral",
  "season-mission": "warning",
  "season-end": "warning",
  "game-end": "special",
};

const ICON_MAP: Record<ActionLogAction, string> = {
  "choose-passion": "\u2764\uFE0F", // heart
  "passion-mode": "\u2728", // sparkles
  "passion-goal-met": "\uD83C\uDFAF", // bullseye
  move: "\uD83D\uDC5F", // foot
  "site-effect": "\uD83D\uDCCD", // pin
  "weather-token": "\u2600\uFE0F",
  "use-canteen": "\uD83E\uDED9", // canteen-ish
  "place-water": "\uD83D\uDCA7", // water drop
  "buy-park": "\uD83C\uDFDE\uFE0F", // park
  "reserve-park": "\uD83D\uDD16", // bookmark
  exchange: "\uD83D\uDD04", // refresh
  "take-canteen": "\uD83E\uDED9",
  "snap-photo": "\uD83D\uDCF8", // camera
  "trail-die": "\uD83C\uDFB2", // die
  "skip-park": "\u23ED\uFE0F",
  "buy-gear": "\uD83C\uDF92", // backpack
  "activate-gear": "\u2699\uFE0F", // gear
  "campfire-lit": "\uD83D\uDD25", // fire
  "campfire-extinguished": "\uD83D\uDCA8", // dust/smoke
  "shutterbug-placed": "\uD83D\uDC1B",
  "shutterbug-taken": "\uD83D\uDC1B",
  "first-player-token": "\uD83E\uDD47",
  "trail-end-bonus": "\uD83C\uDFC1",
  "discard-resource": "\uD83D\uDDD1\uFE0F",
  pass: "\u23ED\uFE0F",
  "season-mission": "\uD83C\uDFC5", // medal
  "season-end": "\uD83D\uDCC5",
  "game-end": "\uD83C\uDFC6",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerName(playerIndex: number, myIndex: number): string {
  if (playerIndex < 0) return "Game";
  if (playerIndex === myIndex) return "You";
  return "Opponent";
}

function playerSpan(playerIndex: number, myIndex: number): LogTextSpan {
  if (playerIndex < 0) {
    return { text: "Game", bold: true, color: "#9ca3af" };
  }
  const isYou = playerIndex === myIndex;
  return {
    text: playerName(playerIndex, myIndex),
    bold: true,
    color: isYou ? "#7dd3fc" : "#fdba74",
  };
}

function resourceSpan(r: ResourceType): LogTextSpan {
  return {
    text: `${RESOURCE_EMOJI[r]} ${RESOURCE_LABELS[r]}`,
    bold: true,
    color: RESOURCE_COLORS[r],
  };
}

function siteSpan(site: SiteType): LogTextSpan {
  return { text: SITE_LABELS[site], italic: true, color: "#9ca3af" };
}

function canteenSpan(eff: CanteenEffect): LogTextSpan {
  return { text: CANTEEN_LABELS[eff], italic: true, color: "#a78bfa" };
}

function trailDieSpan(face: TrailDieFace): LogTextSpan {
  return { text: TRAIL_DIE_LABELS[face], italic: true, color: "#fbbf24" };
}

function passionSpan(p: PassionId): LogTextSpan {
  return { text: PASSION_LABELS[p], italic: true, color: "#a78bfa" };
}

function gearSpan(kind: GearKind): LogTextSpan {
  return { text: GEAR_LABELS[kind], bold: true, color: "#fbbf24" };
}

function positionLabel(pos: number): string {
  if (pos === -1) return "Start";
  if (pos === 9) return "Trail's End R1 (Park)";
  if (pos === 10) return "Trail's End R2 (Photo)";
  if (pos === 11) return "Trail's End R3 (Shop)";
  return `Site ${pos + 1}`;
}

// ---------------------------------------------------------------------------
// Spans builder
// ---------------------------------------------------------------------------

function buildSpans(entry: ActionLogEntry, myIndex: number): LogSpan[] {
  const actor = playerSpan(entry.playerIndex, myIndex);

  switch (entry.action) {
    case "choose-passion":
      return entry.passionId
        ? [actor, " chose passion ", passionSpan(entry.passionId)]
        : [actor, " chose a passion"];
    case "passion-goal-met":
      return entry.passionId
        ? [actor, " met passion goal: ", passionSpan(entry.passionId)]
        : [actor, " met passion goal"];
    case "passion-mode":
      return [
        actor,
        " activated ",
        {
          text: entry.passionMode === "gear" ? "Gear Effect" : "End-Game Bonus",
          bold: true,
          color: "#a78bfa",
        },
      ];
    case "move":
      return [
        actor,
        ` moved hiker ${entry.hikerId !== undefined ? entry.hikerId + 1 : ""}: `,
        { text: positionLabel(entry.fromPosition ?? -1), italic: true, color: "#9ca3af" },
        " \u2192 ",
        { text: positionLabel(entry.toPosition ?? -1), italic: true, color: "#9ca3af" },
      ];
    case "site-effect":
      return entry.site ? ["Resolves: ", siteSpan(entry.site)] : ["Site resolved"];
    case "weather-token":
      return entry.resource
        ? [actor, " claimed weather token: ", resourceSpan(entry.resource)]
        : [actor, " claimed weather token"];
    case "use-canteen":
      return entry.canteenEffect
        ? [actor, " used canteen: ", canteenSpan(entry.canteenEffect)]
        : [actor, " used a canteen"];
    case "place-water":
      return entry.waterGap !== undefined
        ? [actor, ` placed a water token (gap ${entry.waterGap + 1})`]
        : [actor, " placed a water token"];
    case "buy-park":
      return [
        actor,
        " purchased ",
        { text: entry.parkName ?? "park", bold: true, color: "#34d399" },
        ` (${entry.parkPt ?? 0} PT)`,
      ];
    case "exchange":
      return entry.resource
        ? [actor, " traded ", resourceSpan(entry.resource), " for Wildlife"]
        : [actor, " traded a resource"];
    case "take-canteen":
      return entry.canteenEffect
        ? [actor, " took a canteen: ", canteenSpan(entry.canteenEffect)]
        : [actor, " took a canteen"];
    case "snap-photo":
      return entry.resource
        ? [actor, " snapped a photo (paid ", resourceSpan(entry.resource), ")"]
        : [actor, " snapped a photo"];
    case "trail-die":
      return entry.trailDieFace
        ? [actor, " rolled the trail die: ", trailDieSpan(entry.trailDieFace)]
        : [actor, " rolled the trail die"];
    case "skip-park":
      return [actor, " skipped park action"];
    case "reserve-park":
      return [
        actor,
        " reserved ",
        { text: entry.parkName ?? "park", bold: true, color: "#fbbf24" },
        ` (${entry.parkPt ?? 0} PT)`,
        entry.source === "deck" ? " from the deck" : "",
      ];
    case "buy-gear":
      return entry.gearKind
        ? [
            actor,
            " bought ",
            gearSpan(entry.gearKind),
            entry.gearCost !== undefined ? ` for ${entry.gearCost} \u2600\uFE0F` : "",
            entry.source === "deck" ? " (blind)" : "",
          ]
        : [actor, " bought a gear card"];
    case "activate-gear":
      return entry.gearKind
        ? [actor, " activated ", gearSpan(entry.gearKind)]
        : [actor, " activated gear"];
    case "campfire-lit":
      return [actor, " lit the campfire"];
    case "campfire-extinguished":
      return [actor, " extinguished the campfire"];
    case "shutterbug-placed":
      return [
        { text: "Shutterbug", bold: true, color: "#e879f9" },
        " placed at ",
        { text: positionLabel(entry.toPosition ?? -1), italic: true, color: "#9ca3af" },
      ];
    case "shutterbug-taken":
      return [actor, " took the ", { text: "Shutterbug", bold: true, color: "#e879f9" }, " token"];
    case "first-player-token":
      return [actor, " took the ", { text: "First-Player Token", bold: true, color: "#fde047" }];
    case "trail-end-bonus":
      return entry.resource
        ? [actor, " claimed Trail's End row bonus: ", resourceSpan(entry.resource)]
        : [actor, " claimed a Trail's End row bonus"];
    case "discard-resource":
      return entry.resource
        ? [actor, " discarded over the cap: ", resourceSpan(entry.resource)]
        : [actor, " discarded a resource"];
    case "pass":
      return [actor, " passed"];
    case "season-mission":
      return entry.seasonMission
        ? [
            actor,
            " won mission: ",
            {
              text: SEASON_MISSION_LABELS[entry.seasonMission],
              italic: true,
              color: "#fbbf24",
            },
          ]
        : [actor, " won a season mission"];
    case "season-end":
      return [{ text: `${SEASON_LABELS[entry.season]} ended`, bold: true, color: "#fbbf24" }];
    case "game-end":
      return [{ text: "Game over!", bold: true, color: "#a78bfa" }];
  }
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapParksLog(entries: ActionLogEntry[], myIndex: number): LogBlock[] {
  const blocks: LogBlock[] = [];
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const blockKey = `${entry.season}-t${entry.turn}`;
    const label = `${SEASON_LABELS[entry.season]} \u00b7 Turn ${entry.turn + 1}`;

    const logAction: LogAction = {
      key: idx,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, myIndex),
      variant: VARIANT_MAP[entry.action],
    };

    const last = blocks[blocks.length - 1];
    if (last && last.key === blockKey) {
      last.actions.push(logAction);
    } else {
      blocks.push({ key: blockKey, label, actions: [logAction] });
    }
  }
  return blocks;
}
