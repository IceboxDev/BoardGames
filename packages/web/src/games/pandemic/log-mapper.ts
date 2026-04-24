import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type {
  ActionLogEntry,
  DiseaseColor,
  PandemicLogAction,
  Role,
} from "@boardgames/core/games/pandemic/types";
import type {
  LogAction,
  LogBlock,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";

// ---------------------------------------------------------------------------
// Disease color helpers
// ---------------------------------------------------------------------------

const DISEASE_HEX: Record<DiseaseColor, string> = {
  blue: "#60a5fa",
  yellow: "#fbbf24",
  black: "#9ca3af",
  red: "#f87171",
};

function diseaseSpan(disease: string): LogTextSpan {
  return {
    text: disease,
    bold: true,
    color: DISEASE_HEX[disease as DiseaseColor] ?? "#e2e8f0",
  };
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<PandemicLogAction, LogVariant> = {
  drive: "neutral",
  "direct-flight": "neutral",
  "charter-flight": "neutral",
  "shuttle-flight": "neutral",
  "build-station": "action",
  treat: "success",
  share: "action",
  cure: "special",
  infect: "warning",
  epidemic: "danger",
  outbreak: "danger",
  "draw-card": "info",
  discard: "neutral",
};

const ICON_MAP: Record<PandemicLogAction, string> = {
  drive: "\uD83D\uDE97",
  "direct-flight": "\u2708\uFE0F",
  "charter-flight": "\u2708\uFE0F",
  "shuttle-flight": "\u2708\uFE0F",
  "build-station": "\uD83C\uDFD7\uFE0F",
  treat: "\uD83D\uDC8A",
  share: "\uD83E\uDD1D",
  cure: "\uD83D\uDC89",
  infect: "\uD83E\uDDA0",
  epidemic: "\u26A0\uFE0F",
  outbreak: "\uD83D\uDCA5",
  "draw-card": "\uD83D\uDCE5",
  discard: "\uD83D\uDDD1\uFE0F",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleName(role: Role): string {
  return getRoleDef(role).name;
}

function playerLabel(playerIndex: number, roles: Role[]): string {
  if (playerIndex < 0 || playerIndex >= roles.length) return "Setup";
  return roleName(roles[playerIndex]);
}

function citySpan(name: string): LogTextSpan {
  return { text: name, bold: true, color: "#e2e8f0" };
}

function buildSpans(entry: ActionLogEntry, roles: Role[]): LogSpan[] {
  const player = playerLabel(entry.playerIndex, roles);

  switch (entry.action) {
    case "drive":
      return [
        player,
        " drove to ",
        citySpan(entry.city ?? "?"),
        ...(entry.detail ? [{ text: ` (${entry.detail})`, color: "#9ca3af" } as LogTextSpan] : []),
      ];
    case "direct-flight":
      return [player, " flew to ", citySpan(entry.city ?? "?")];
    case "charter-flight":
      return [player, " chartered a flight to ", citySpan(entry.city ?? "?")];
    case "shuttle-flight":
      return [player, " shuttled to ", citySpan(entry.city ?? "?")];
    case "build-station":
      return [player, " built a research station in ", citySpan(entry.city ?? "?")];
    case "treat":
      return [
        player,
        " treated ",
        ...(entry.disease ? [diseaseSpan(entry.disease)] : []),
        " in ",
        citySpan(entry.city ?? "?"),
      ];
    case "share":
      return [player, " shared knowledge", ...(entry.detail ? [` \u2014 ${entry.detail}`] : [])];
    case "cure":
      return [
        player,
        " discovered a cure for ",
        ...(entry.disease ? [diseaseSpan(entry.disease)] : []),
        "!",
      ];
    case "infect":
      return [
        citySpan(entry.city ?? "?"),
        " infected with ",
        ...(entry.disease ? [diseaseSpan(entry.disease)] : []),
        ...(entry.detail ? [{ text: ` (${entry.detail})`, color: "#9ca3af" } as LogTextSpan] : []),
      ];
    case "epidemic":
      return [
        "Epidemic! ",
        citySpan(entry.city ?? "?"),
        " infected",
        ...(entry.disease ? [" with ", diseaseSpan(entry.disease)] : []),
      ];
    case "outbreak":
      return [
        "Outbreak in ",
        citySpan(entry.city ?? "?"),
        "!",
        ...(entry.disease ? [" (", diseaseSpan(entry.disease), ")"] : []),
      ];
    case "draw-card":
      return [player, " drew", entry.detail ? ` ${entry.detail}` : " a card"];
    case "discard":
      return [player, " discarded", entry.detail ? ` ${entry.detail}` : ""];
    default:
      return [player, " performed an action"];
  }
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapPandemicLog(entries: ActionLogEntry[], roles: Role[]): LogBlock[] {
  const grouped = new Map<number, ActionLogEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.turn);
    if (list) list.push(entry);
    else grouped.set(entry.turn, [entry]);
  }

  const blocks: LogBlock[] = [];
  for (const [turn, turnEntries] of grouped) {
    const actions: LogAction[] = turnEntries.map((entry, i) => ({
      key: `${turn}-${i}`,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, roles),
      variant: VARIANT_MAP[entry.action],
    }));
    blocks.push({
      key: turn,
      label:
        turn === 0
          ? "Setup"
          : `Turn ${turn} \u00b7 ${playerLabel(turnEntries[0].playerIndex, roles)}`,
      actions,
    });
  }
  return blocks;
}
