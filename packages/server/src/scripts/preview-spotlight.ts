// READ-ONLY dry run of the spotlight diff against real history.
//
// Replays the recorded matches twice through the production code path — once
// without the most recent game night, once with it — and prints the candidate
// ranking the admin card would offer. Use it to sanity-check the copy and the
// ordering against people you actually know before pressing Publish for real.
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/preview-spotlight.ts
//   pnpm --filter @boardgames/server exec tsx src/scripts/preview-spotlight.ts --nights 2
//
// Writes nothing.

import "../env.ts";
import { MatchOutcomeSchema } from "@boardgames/core/protocol";
import { spotlightCandidates } from "@boardgames/core/skill/greetings";
import { z } from "zod";
import { getDb, initDb } from "../db.ts";
import { jsonColumn, parseRows } from "../lib/db-rows.ts";
import { buildSkillState } from "../lib/skill-ratings.ts";

const MatchRowSchema = z.object({
  id: z.number(),
  played_at: z.string(),
  game_slug: z.string().nullable(),
  outcome_json: jsonColumn(MatchOutcomeSchema),
  updated_at: z.string().nullable(),
  recorded_at: z.string(),
});

const UserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  guest: z.number(),
  internal: z.number(),
});

function describe(event: Record<string, unknown>): string {
  switch (event.kind) {
    case "trait-climb":
      return `${event.trait}: ${event.from ?? "off-board"} → ${event.to} (field ${event.fieldSize})`;
    case "game-climb":
      return `${event.slug}: ${event.from ?? "off-board"} → ${event.to} (field ${event.fieldSize})`;
    case "profile-unlocked":
      return `profile unlocked (${event.ratedMatches} rated, ${event.distinctGames} games)`;
    case "streak-lead":
      return `longest run in the group (${event.length} straight)`;
    default:
      return JSON.stringify(event);
  }
}

async function main() {
  const nightsArg = process.argv.indexOf("--nights");
  const nights = nightsArg === -1 ? 1 : Number(process.argv[nightsArg + 1] ?? 1);

  await initDb();
  const db = getDb();
  const rows = parseRows(
    MatchRowSchema,
    (
      await db.execute(
        `SELECT id, played_at, game_slug, outcome_json, updated_at, recorded_at
         FROM match_results ORDER BY id`,
      )
    ).rows,
    "match_results.spotlight-preview",
  );
  const users = parseRows(
    UserRowSchema,
    (await db.execute("SELECT id, name, guest, internal FROM user")).rows,
    "user.spotlight-preview",
  );
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const visible = new Set(users.filter((u) => u.guest === 0 && u.internal === 0).map((u) => u.id));

  // "Before" = history minus the last N distinct play dates.
  const days = [...new Set(rows.map((r) => r.played_at))].sort();
  const cutoff = days[Math.max(0, days.length - nights)];
  const before = rows.filter((r) => r.played_at < cutoff);
  console.log(
    `history: ${rows.length} matches over ${days.length} dates\n` +
      `baseline: everything before ${cutoff} (${before.length} matches)\n` +
      `current:  everything (${rows.length} matches)\n`,
  );

  const candidates = spotlightCandidates(
    { ...toSnapshot(before, visible) },
    { ...toSnapshot(rows, visible) },
  );
  if (candidates.length === 0) {
    console.log("no candidates — nothing moved across that window");
    return;
  }
  console.log(`— ${candidates.length} candidate(s), best first —`);
  for (const [i, c] of candidates.entries()) {
    const marker = i === 0 ? "HEADLINE" : `  #${i + 1}   `;
    console.log(
      `${marker} ${String(Math.round(c.score)).padStart(4)}  ` +
        `${(nameOf.get(c.subjectUserId) ?? c.subjectUserId).padEnd(20)} ${describe(c.event)}`,
    );
  }
}

function toSnapshot(rows: Parameters<typeof buildSkillState>[0], visible: ReadonlySet<string>) {
  const state = buildSkillState(rows, visible);
  return {
    players: state.players,
    traitBoards: state.leaderboards.traits,
    gameBoards: state.leaderboards.games,
    streaks: state.streaks,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
