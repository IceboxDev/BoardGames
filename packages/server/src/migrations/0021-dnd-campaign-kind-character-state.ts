// Migration 0021 — hall polish + persistent characters.
//
// • `dnd_campaigns.kind` — 'campaign' | 'one-shot', extracted from the
//   module so the hall can shelve them separately.
// • `dnd_characters.state_json` — persistent between-battles state
//   ({ hp, notes }): damage carries from fight to fight, rests heal it.
// Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndCampaignKindCharacterState: Migration = {
  version: 21,
  name: "dnd_campaign_kind_character_state",
  statements: [
    `ALTER TABLE dnd_campaigns ADD COLUMN kind TEXT NOT NULL DEFAULT 'campaign'`,
    `ALTER TABLE dnd_characters ADD COLUMN state_json TEXT`,
  ],
};
