import type { CompanionRecord, DndRecord } from "@boardgames/core/protocol";
import CompanionMatchHistory from "../../components/match-history/CompanionMatchHistory";
import {
  type CompanionRow,
  lengthAndDateColumns,
  recordLength,
} from "../../components/match-history/companion-columns";
import type { MatchColumn } from "../../components/match-history/MatchResultsTable";
import { formatShortDate } from "../../lib/date-format";

// The DM's Match History: every session they ended from the DM screen — the
// campaign, the party and who was in it, where the story stood, how long it
// ran. D&D has no winner, so a row is a session, not a result.

const select = (record: CompanionRecord): DndRecord | null =>
  record.game === "dungeons-and-dragons" ? record : null;

/** "Cragmaw Hideout (2 of 6)", or just the position when untitled. */
function waypointLabel({ waypoint }: DndRecord): string {
  if (waypoint.of === 0) return "—";
  const at = `${waypoint.index + 1} of ${waypoint.of}`;
  return waypoint.title ? `${waypoint.title} (${at})` : at;
}

/** "Thorin — Dwarf Fighter 3 · Ben". */
function memberLine(m: DndRecord["members"][number]): { name: string; about: string } {
  const build = [m.race, m.class, m.level === null ? null : String(m.level)]
    .filter((part) => part !== null && part !== "")
    .join(" ");
  return {
    name: m.name ?? m.playerName ?? "Unnamed adventurer",
    about: [build, m.name && m.playerName ? m.playerName : null].filter(Boolean).join(" · "),
  };
}

const columns: MatchColumn<CompanionRow<DndRecord>>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cellClassName: "text-xs font-semibold text-fg-primary",
    cell: (row) => row.record.campaignTitle ?? "Untitled campaign",
  },
  {
    id: "party",
    header: "Party",
    cellClassName: "text-xs text-fg-secondary",
    cell: (row) => `${row.record.partyName} (${row.record.members.length})`,
  },
  {
    id: "waypoint",
    header: "Reached",
    cellClassName: "text-xs text-fg-secondary",
    cell: (row) => waypointLabel(row.record),
  },
  ...lengthAndDateColumns<DndRecord>(),
];

function summary(rows: readonly CompanionRow<DndRecord>[]) {
  const campaigns = new Set(rows.map((r) => r.record.campaignId)).size;
  return `${rows.length} ${rows.length === 1 ? "session" : "sessions"} run · ${campaigns} ${
    campaigns === 1 ? "campaign" : "campaigns"
  }`;
}

function detail({ record }: CompanionRow<DndRecord>) {
  const length = recordLength(record);
  const facts = [
    record.campaignKind === "one-shot" ? "One-shot" : null,
    formatShortDate(record.endedAt),
    length,
    `${record.loggedEntries} ${record.loggedEntries === 1 ? "entry" : "entries"} logged`,
  ].filter(Boolean);
  return {
    eyebrow: record.campaignTitle ?? "Dungeons & Dragons",
    title: record.partyName,
    body: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">
          {facts.join(" · ")}. Reached: {waypointLabel(record)}.
        </p>
        {record.members.length === 0 ? (
          <p className="text-sm text-fg-muted">No adventurers were ready in the party.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {record.members.map((m) => {
              const line = memberLine(m);
              return (
                <li key={m.characterId} className="flex flex-col text-sm leading-tight">
                  <span className="text-fg-primary">{line.name}</span>
                  {line.about && <span className="text-xs text-fg-muted">{line.about}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ),
  };
}

export default function DndMatchHistory({ onBack }: { onBack: () => void }) {
  return (
    <CompanionMatchHistory
      slug="dungeons-and-dragons"
      select={select}
      columns={columns}
      summary={summary}
      detail={detail}
      emptyDescription="Sessions you end from the DM screen land here."
      onBack={onBack}
    />
  );
}
