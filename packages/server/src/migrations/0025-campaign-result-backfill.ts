// Migration 0025 — back-fill `campaignResult` onto unresolved campaign
// sessions whose campaign has since concluded.
//
// A D&D campaign session recorded before the story ended carries no `outcome`
// (it was genuinely unresolved at recording time). Once a later session of the
// same (game_slug, campaign) records the concluding win/loss, the earlier
// sittings are no longer "ongoing" — but nothing revisited them, so profiles
// kept labeling them that way forever. Going forward the admin history write
// path stamps `campaignResult` at conclusion time (resolveCampaignSessions);
// this migration applies the same stamp to matches recorded before that
// existed ("The Wound of the Forest" sessions 49/50 in prod).
//
// Data-only; no schema change. Idempotent by construction: rows that already
// carry `$.campaignResult` still match, but json_set overwrites with the same
// derived value.

import type { Migration } from "./types.ts";

export const campaignResultBackfill: Migration = {
  version: 25,
  name: "campaign_result_backfill",
  statements: [
    `UPDATE match_results
     SET outcome_json = json_set(
       outcome_json,
       '$.campaignResult',
       (SELECT json_extract(m2.outcome_json, '$.outcome')
        FROM match_results m2
        WHERE m2.game_slug = match_results.game_slug
          AND json_extract(m2.outcome_json, '$.kind') = 'coop'
          AND json_extract(m2.outcome_json, '$.campaign')
              = json_extract(match_results.outcome_json, '$.campaign')
          AND json_extract(m2.outcome_json, '$.outcome') IS NOT NULL
        ORDER BY m2.played_at DESC, m2.id DESC
        LIMIT 1)
     )
     WHERE json_extract(outcome_json, '$.kind') = 'coop'
       AND json_extract(outcome_json, '$.campaign') IS NOT NULL
       AND json_extract(outcome_json, '$.outcome') IS NULL
       AND EXISTS (
         SELECT 1 FROM match_results m2
         WHERE m2.game_slug = match_results.game_slug
           AND json_extract(m2.outcome_json, '$.kind') = 'coop'
           AND json_extract(m2.outcome_json, '$.campaign')
               = json_extract(match_results.outcome_json, '$.campaign')
           AND json_extract(m2.outcome_json, '$.outcome') IS NOT NULL
       )`,
  ],
};
