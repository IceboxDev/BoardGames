import {
  CHARACTERS,
  EDITION_NAME,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { BotcRecord, CompanionRecord } from "@boardgames/core/protocol";
import CompanionMatchHistory from "../../components/match-history/CompanionMatchHistory";
import {
  type CompanionRow,
  lengthAndDateColumns,
  recordLength,
} from "../../components/match-history/companion-columns";
import type { MatchColumn } from "../../components/match-history/MatchResultsTable";
import { formatShortDate } from "../../lib/date-format";
import { TYPE_TEXT } from "./companion/labels";
import { CharacterIcon } from "./companion/ui";

// The Storyteller's Match History: every Grimoire game they ran to the end,
// saved by the companion when a winner was declared. A row opens the truth of
// that town — who sat where, what they were, which team they ended on.

const WINNER_TEXT = { good: "text-sky-300", evil: "text-rose-300" } as const;
const WINNER_LABEL = { good: "Good won", evil: "Evil won" } as const;

const select = (record: CompanionRecord): BotcRecord | null =>
  record.game === "blood-on-the-clocktower" ? record : null;

const columns: MatchColumn<CompanionRow<BotcRecord>>[] = [
  {
    id: "result",
    header: "Result",
    cellClassName: (row) => `text-xs font-semibold ${WINNER_TEXT[row.record.winner]}`,
    cell: (row) => WINNER_LABEL[row.record.winner],
  },
  {
    id: "script",
    header: "Script",
    cellClassName: "text-xs text-fg-secondary",
    cell: (row) => EDITION_NAME[row.record.edition],
  },
  {
    id: "players",
    header: "Players",
    align: "right",
    cellClassName: "text-xs tabular-nums text-fg-secondary",
    cell: (row) => row.record.players.length,
  },
  ...lengthAndDateColumns<BotcRecord>(),
];

function summary(rows: readonly CompanionRow<BotcRecord>[]) {
  const good = rows.filter((r) => r.record.winner === "good").length;
  return (
    <>
      {rows.length} {rows.length === 1 ? "game" : "games"} run &middot;{" "}
      <span className={WINNER_TEXT.good}>Good {good}</span> /{" "}
      <span className={WINNER_TEXT.evil}>Evil {rows.length - good}</span>
    </>
  );
}

function detail({ record }: CompanionRow<BotcRecord>) {
  const length = recordLength(record);
  const facts = [
    EDITION_NAME[record.edition],
    record.days === 0
      ? "ended before the first day"
      : `${record.days} ${record.days === 1 ? "day" : "days"}`,
    length,
    formatShortDate(record.endedAt),
  ].filter(Boolean);
  return {
    eyebrow: "Blood on the Clocktower",
    title: <span className={WINNER_TEXT[record.winner]}>{WINNER_LABEL[record.winner]}</span>,
    body: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">
          {record.reason.charAt(0).toUpperCase() + record.reason.slice(1)}. {facts.join(" · ")}.
          {record.storyteller && <> Storyteller: {record.storyteller}.</>}
        </p>
        <ul className="flex flex-col gap-1">
          {record.players.map((p) => (
            <li key={p.seat} className="flex min-h-9 items-center justify-between gap-2 text-sm">
              <span
                className={`min-w-0 truncate ${p.alive ? "text-fg-primary" : "text-fg-muted line-through"}`}
              >
                {p.name}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <CharacterIcon character={p.character} size="sm" decorative />
                <span className={`font-semibold ${TYPE_TEXT[CHARACTERS[p.character].type]}`}>
                  {CHARACTERS[p.character].name}
                </span>
                <span className={`text-xs ${WINNER_TEXT[p.alignment]}`}>
                  {p.alignment === "good" ? "Good" : "Evil"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
  };
}

export default function ClocktowerMatchHistory({ onBack }: { onBack: () => void }) {
  return (
    <CompanionMatchHistory
      slug="blood-on-the-clocktower"
      select={select}
      columns={columns}
      summary={summary}
      detail={detail}
      emptyDescription="Games you run in the Storyteller companion land here once a team wins."
      onBack={onBack}
    />
  );
}
