// READ-ONLY audit: replay the real match history through the skill engine and
// print what the feature would ship — slug coverage, eligibility distribution,
// per-trait boards, per-game boards, highlights. Run before deploying:
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/audit-skill-ratings.ts
//
// Writes nothing. Names are printed for smell-testing only.

import "../env.ts";
import { MatchOutcomeSchema, SKILL_TRAITS } from "@boardgames/core/protocol";
import { SKILL_CONFIG_V1 } from "@boardgames/core/skill/config";
import { fitSkillRatings } from "@boardgames/core/skill/fit";
import { highlightsFor } from "@boardgames/core/skill/highlights";
import { gameLeaderboards, traitStandings } from "@boardgames/core/skill/percentiles";
import { z } from "zod";
import { getDb, initDb } from "../db.ts";
import { jsonColumn, parseRows } from "../lib/db-rows.ts";
import { groupMatchUnits } from "../lib/match-units.ts";

const MatchRowSchema = z.object({
  id: z.number(),
  played_at: z.string(),
  game_slug: z.string().nullable(),
  outcome_json: jsonColumn(MatchOutcomeSchema),
});

const UserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  guest: z.number(),
  internal: z.number(),
});

async function main() {
  await initDb();
  const db = getDb();
  const matchRows = parseRows(
    MatchRowSchema,
    (
      await db.execute(
        "SELECT id, played_at, game_slug, outcome_json FROM match_results ORDER BY id",
      )
    ).rows,
    "match_results.audit",
  );
  const users = parseRows(
    UserRowSchema,
    (await db.execute("SELECT id, name, guest, internal FROM user")).rows,
    "user.audit",
  );
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const visible = new Set(users.filter((u) => u.guest === 0 && u.internal === 0).map((u) => u.id));

  const units = groupMatchUnits(matchRows);
  const inputs = units.map(({ rep }) => {
    let outcome = rep.outcome_json;
    if (
      outcome.kind === "coop" &&
      outcome.outcome === undefined &&
      outcome.score === undefined &&
      outcome.campaignResult !== undefined
    ) {
      outcome = { ...outcome, outcome: outcome.campaignResult };
    }
    return { slug: rep.game_slug, playedAt: rep.played_at, outcome };
  });

  console.log(`matches: ${matchRows.length} rows → ${units.length} units`);
  const fit = fitSkillRatings(inputs, SKILL_CONFIG_V1);
  console.log(
    `fit: ${fit.iterations} iterations, converged=${fit.converged}, ` +
      `skipped off-catalog=${fit.skippedOffCatalog}, no-evidence=${fit.skippedNoEvidence}`,
  );

  console.log("\n— eligibility (visible members) —");
  const rows = Object.entries(fit.players)
    .filter(([id]) => visible.has(id))
    .sort(([, a], [, b]) => b.ratedMatches - a.ratedMatches);
  for (const [id, p] of rows) {
    console.log(
      `  ${(nameOf.get(id) ?? id).padEnd(20)} matches=${String(p.ratedMatches).padStart(3)} ` +
        `games=${String(p.distinctGames).padStart(2)} eligible=${p.eligible ? "YES" : "no"}`,
    );
  }
  console.log(`  eligible: ${rows.filter(([, p]) => p.eligible).length}/${rows.length}`);

  const standings = traitStandings(fit, visible, SKILL_CONFIG_V1);
  const boards = gameLeaderboards(fit, visible, SKILL_CONFIG_V1);

  console.log("\n— trait boards (top 3) —");
  for (const { id, label } of SKILL_TRAITS) {
    const cleared = standings[id].filter((s) => !s.provisional);
    if (cleared.length < SKILL_CONFIG_V1.minLeaderboardPlayers) {
      console.log(`  ${label.padEnd(15)} LOCKED (${cleared.length} cleared exposure)`);
      continue;
    }
    const top = cleared
      .slice(0, 3)
      .map(
        (s) =>
          `${nameOf.get(s.userId) ?? s.userId} (θ=${s.theta.toFixed(2)}±${s.se.toFixed(2)}, p${s.percentile.toFixed(0)})`,
      )
      .join(", ");
    console.log(`  ${label.padEnd(15)} ${top}`);
  }

  console.log("\n— game boards —");
  for (const [slug, board] of Object.entries(boards)) {
    const top = board
      .slice(0, 3)
      .map((s) => `${nameOf.get(s.userId) ?? s.userId} (R=${s.rating.toFixed(2)}, n=${s.matches})`)
      .join(", ");
    console.log(`  ${slug.padEnd(22)} ${top}`);
  }

  console.log("\n— co-op difficulty —");
  for (const [slug, d] of Object.entries(fit.coopDifficulty)) {
    console.log(`  ${slug.padEnd(22)} d=${d.toFixed(3)}`);
  }

  console.log("\n— headline highlight per eligible member —");
  for (const [id, p] of rows) {
    if (!p.eligible) continue;
    const h = highlightsFor(id, standings, boards, SKILL_CONFIG_V1)[0];
    console.log(`  ${(nameOf.get(id) ?? id).padEnd(20)} ${h ? JSON.stringify(h) : "(none)"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
