// The inputs behind a voting night's picker exclusions (core
// `games/night-filters.ts`): who is a non-drinker (admin-set `user.nonDrinker`,
// migration 0070) and which campaigns are ongoing (from match history).
// Read once per request and applied to every night the request covers, by
// both the per-night games payload and `/locks` — the same rule in both, so a
// night's picker and its calendar winner can't disagree.

import {
  CAMPAIGN_FAMILY_SLUGS,
  ongoingCampaignSlugs,
  pickerExclusions,
} from "@boardgames/core/games/night-filters";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";

export type PickerFilterInputs = {
  nonDrinkers: ReadonlySet<string>;
  ongoingCampaigns: ReadonlySet<string>;
};

const IdRowSchema = z.object({ id: z.string() });
const CampaignMatchRowSchema = z.object({
  game_slug: z.string(),
  scenario: z.string().nullable(),
  outcome: z.string().nullable(),
});

export async function loadPickerFilterInputs(db: Client): Promise<PickerFilterInputs> {
  const placeholders = CAMPAIGN_FAMILY_SLUGS.map(() => "?").join(",");
  const [drinkers, matches] = await Promise.all([
    db.execute(`SELECT id FROM "user" WHERE "nonDrinker" = 1`),
    db.execute({
      sql: `SELECT game_slug,
                   json_extract(outcome_json, '$.scenario') AS scenario,
                   json_extract(outcome_json, '$.outcome') AS outcome
              FROM match_results WHERE game_slug IN (${placeholders})`,
      args: [...CAMPAIGN_FAMILY_SLUGS],
    }),
  ]);
  return {
    nonDrinkers: new Set(parseRows(IdRowSchema, drinkers.rows, "user.nonDrinker").map((r) => r.id)),
    ongoingCampaigns: ongoingCampaignSlugs(
      parseRows(CampaignMatchRowSchema, matches.rows, "match_results.campaign").map((r) => ({
        slug: r.game_slug,
        scenario: r.scenario,
        won: r.outcome === "win",
      })),
    ),
  };
}

/**
 * The games this night's picker leaves out. A sealed night keeps what it was
 * voted with — its winner is history, and a campaign that has since become
 * ongoing must not take back the vote that started it — so it excludes nothing.
 */
export function nightPickerExclusions(
  inputs: PickerFilterInputs,
  night: { sealed: boolean; peopleIds: Iterable<string> },
): Set<string> {
  if (night.sealed) return new Set();
  let nonDrinkerComing = false;
  for (const id of night.peopleIds) if (inputs.nonDrinkers.has(id)) nonDrinkerComing = true;
  return pickerExclusions({ nonDrinkerComing, ongoingCampaigns: inputs.ongoingCampaigns });
}

/** `owned` minus `excluded`, as a new set. */
export function withoutExcluded(
  owned: Iterable<string>,
  excluded: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const s of owned) if (!excluded.has(s)) out.add(s);
  return out;
}
