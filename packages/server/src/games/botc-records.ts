/**
 * A finished online Clocktower game also lands in the Storyteller's own
 * Clocktower history, beside the games they ran with the phone companion:
 * the same `companion_records` row the companion saves, keyed by the session
 * id so a retried follow-up replaces it instead of adding another.
 */

import { botcMatchRecord } from "@boardgames/core/games/blood-on-the-clocktower/match-record";
import { BotcReplayLogSchema } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { CompanionRecordSchema } from "@boardgames/core/protocol";
import { saveCompanionRecord } from "../matches/companion-store.ts";
import type { EndedGame } from "./registry.ts";

export async function botcAfterGameOver(ended: EndedGame): Promise<void> {
  const storyteller = ended.seatUserIds[0];
  if (!storyteller) return;
  const log = BotcReplayLogSchema.parse(ended.replayLog);
  const grimoire = log.final.companion;
  if (!grimoire) return;
  const record = botcMatchRecord(grimoire, ended.endedAt.toISOString());
  if (!record) return;
  await saveCompanionRecord(storyteller, ended.sessionId, CompanionRecordSchema.parse(record));
}
