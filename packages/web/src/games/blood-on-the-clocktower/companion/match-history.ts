import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { botcMatchRecord } from "@boardgames/core/games/blood-on-the-clocktower/match-record";
import { CompanionRecordSchema } from "@boardgames/core/protocol";
import { useEffect } from "react";
import {
  newCompanionRecordId,
  recordCompanionGame,
  useCompanionRecordOutbox,
} from "../../../lib/companion-records";
import { companionStore } from "./store";

/**
 * Queue the ended game for the Storyteller's Match History, once per version
 * of it (a winner changed after an Undo replaces the saved record). Returns
 * whether it queued; a record that fails validation is logged and skipped —
 * it would only be refused by the server.
 */
export async function recordEndedGame(game: CompanionState, now = new Date()): Promise<boolean> {
  if (!game.gameId) return false;
  const record = CompanionRecordSchema.safeParse(botcMatchRecord(game, now.toISOString()));
  if (!record.success) {
    if (game.phase.kind === "ended") {
      console.warn("[botc] finished game not recordable:", record.error.issues[0]);
    }
    return false;
  }
  return recordCompanionGame(game.gameId, record.data);
}

/**
 * Keep the running game's Match History record in step: stamp an id on a game
 * dealt before ids existed, queue the record when it ends, and keep the
 * outbox replaying while the companion is open.
 */
export function useMatchHistoryRecording(game: CompanionState | null): void {
  useCompanionRecordOutbox();

  const needsId = game !== null && !game.gameId;
  useEffect(() => {
    if (needsId) companionStore.stampGameId(newCompanionRecordId());
  }, [needsId]);

  useEffect(() => {
    if (game?.phase.kind === "ended") void recordEndedGame(game);
  }, [game]);
}
