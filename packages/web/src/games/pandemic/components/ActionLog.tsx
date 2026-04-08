import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { ActionLogEntry, Role } from "@boardgames/core/games/pandemic/types";
import { useMemo } from "react";
import {
  ActionLog as ActionLogContainer,
  CardTag,
  type LogVariant,
  type TurnGroup,
} from "../../../components/action-log";

// ---------------------------------------------------------------------------
// Disease color helpers
// ---------------------------------------------------------------------------

const DISEASE_EMOJI: Record<string, string> = {
  blue: "\u{1F535}",
  yellow: "\u{1F7E1}",
  black: "\u26AB",
  red: "\u{1F534}",
};

// ---------------------------------------------------------------------------
// Variant mapping
// ---------------------------------------------------------------------------

const ACTION_VARIANT: Record<ActionLogEntry["action"], LogVariant> = {
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

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ACTION_ICON: Record<ActionLogEntry["action"], string> = {
  drive: "\u{1F697}",
  "direct-flight": "\u2708\uFE0F",
  "charter-flight": "\u2708\uFE0F",
  "shuttle-flight": "\u2708\uFE0F",
  "build-station": "\u{1F3D7}\uFE0F",
  treat: "\u{1F48A}",
  share: "\u{1F91D}",
  cure: "\u{1F489}",
  infect: "\u{1F9A0}",
  epidemic: "\u26A0\uFE0F",
  outbreak: "\u{1F4A5}",
  "draw-card": "\u{1F4E5}",
  discard: "\u{1F5D1}\uFE0F",
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

function DiseaseTag({ disease }: { disease: string }) {
  return <CardTag emoji={DISEASE_EMOJI[disease] ?? ""} label={disease} />;
}

function CityName({ name }: { name: string }) {
  return <span className="font-semibold text-white/80">{name}</span>;
}

function buildContent(entry: ActionLogEntry, roles: Role[]) {
  const player = playerLabel(entry.playerIndex, roles);

  switch (entry.action) {
    case "drive":
      return (
        <span>
          {player} drove to <CityName name={entry.city ?? "?"} />
          {entry.detail && <span className="text-gray-400"> ({entry.detail})</span>}
        </span>
      );
    case "direct-flight":
      return (
        <span>
          {player} flew to <CityName name={entry.city ?? "?"} />
        </span>
      );
    case "charter-flight":
      return (
        <span>
          {player} chartered a flight to <CityName name={entry.city ?? "?"} />
        </span>
      );
    case "shuttle-flight":
      return (
        <span>
          {player} shuttled to <CityName name={entry.city ?? "?"} />
        </span>
      );
    case "build-station":
      return (
        <span>
          {player} built a research station in <CityName name={entry.city ?? "?"} />
        </span>
      );
    case "treat":
      return (
        <span>
          {player} treated {entry.disease && <DiseaseTag disease={entry.disease} />} in{" "}
          <CityName name={entry.city ?? "?"} />
        </span>
      );
    case "share":
      return (
        <span>
          {player} shared knowledge{entry.detail && ` — ${entry.detail}`}
        </span>
      );
    case "cure":
      return (
        <span>
          {player} discovered a cure for {entry.disease && <DiseaseTag disease={entry.disease} />}!
        </span>
      );
    case "infect":
      return (
        <span>
          <CityName name={entry.city ?? "?"} /> infected with{" "}
          {entry.disease && <DiseaseTag disease={entry.disease} />}
          {entry.detail && <span className="text-gray-400"> ({entry.detail})</span>}
        </span>
      );
    case "epidemic":
      return (
        <span>
          Epidemic! <CityName name={entry.city ?? "?"} /> infected
          {entry.disease && (
            <span>
              {" "}
              with <DiseaseTag disease={entry.disease} />
            </span>
          )}
        </span>
      );
    case "outbreak":
      return (
        <span>
          Outbreak in <CityName name={entry.city ?? "?"} />!
          {entry.disease && (
            <span>
              {" "}
              (<DiseaseTag disease={entry.disease} />)
            </span>
          )}
        </span>
      );
    case "draw-card":
      return (
        <span>
          {player} drew{entry.detail ? ` ${entry.detail}` : " a card"}
        </span>
      );
    case "discard":
      return (
        <span>
          {player} discarded{entry.detail ? ` ${entry.detail}` : ""}
        </span>
      );
    default:
      return <span>{player} performed an action</span>;
  }
}

// ---------------------------------------------------------------------------
// Group entries by turn
// ---------------------------------------------------------------------------

function groupByTurn(entries: ActionLogEntry[], roles: Role[]): TurnGroup[] {
  const map = new Map<number, ActionLogEntry[]>();

  for (const entry of entries) {
    const existing = map.get(entry.turn);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(entry.turn, [entry]);
    }
  }

  const groups: TurnGroup[] = [];
  for (const [turn, turnEntries] of map) {
    groups.push({
      key: turn,
      label:
        turn === 0 ? "Setup" : `Turn ${turn} — ${playerLabel(turnEntries[0].playerIndex, roles)}`,
      entries: turnEntries.map((entry, i) => ({
        key: `${turn}-${i}`,
        icon: ACTION_ICON[entry.action],
        content: buildContent(entry, roles),
        variant: ACTION_VARIANT[entry.action],
      })),
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PandemicActionLogProps {
  actionLog: ActionLogEntry[];
  roles: Role[];
}

export default function PandemicActionLog({ actionLog, roles }: PandemicActionLogProps) {
  const groups = useMemo(() => groupByTurn(actionLog, roles), [actionLog, roles]);

  return (
    <ActionLogContainer
      groups={groups}
      emptyMessage="Actions will appear here..."
      maxHeight="calc(100vh - 8rem)"
    />
  );
}
