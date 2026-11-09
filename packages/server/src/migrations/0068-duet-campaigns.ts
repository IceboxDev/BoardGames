// Migration 0068 — Codenames: Duet campaigns (the mission map).
//
// A campaign is a pair working through the 26-city map. Its members (one or
// two accounts) own it; its partner is another member, the AI, or a guest who
// only plays at the table. Progress is never stored: it is derived from the
// games (`@boardgames/core/games/codenames-duet/campaign/progress`), each one
// a row keyed by the session id (online/solo) or the client's id (a table
// game), so a retried write or two players' hooks record a game once.
// Schema-only: no existing rows.

import type { Migration } from "./types.ts";

export const duetCampaigns: Migration = {
  version: 68,
  name: "duet_campaigns",
  statements: [
    `CREATE TABLE IF NOT EXISTS duet_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      partner_kind TEXT NOT NULL CHECK (partner_kind IN ('member', 'ai', 'guest')),
      guest_name TEXT,
      created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS duet_campaign_members (
      campaign_id TEXT NOT NULL REFERENCES duet_campaigns(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      PRIMARY KEY (campaign_id, user_id)
    )`,
    "CREATE INDEX IF NOT EXISTS duet_campaign_members_user ON duet_campaign_members (user_id)",
    `CREATE TABLE IF NOT EXISTS duet_campaign_games (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES duet_campaigns(id) ON DELETE CASCADE,
      city TEXT NOT NULL,
      won INTEGER NOT NULL CHECK (won IN (0, 1)),
      agents_found INTEGER,
      tokens_left INTEGER,
      mode TEXT NOT NULL CHECK (mode IN ('solo', 'online', 'table')),
      replay_id INTEGER,
      played_at TEXT NOT NULL,
      recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      note TEXT
    )`,
    "CREATE INDEX IF NOT EXISTS duet_campaign_games_campaign ON duet_campaign_games (campaign_id, played_at)",
  ],
};
