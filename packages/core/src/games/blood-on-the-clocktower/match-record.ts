// A finished companion game as the Storyteller's Match History keeps it:
// who sat where, what they truly were, which team they ended on, who won.
// The wire shape is `BotcRecordSchema` (protocol/http/companion-records.ts).

import type { BotcRecordInput } from "../../protocol/http/companion-records.ts";
import { isEvilPlayer } from "./companion.ts";
import type { CompanionState } from "./schema.ts";

/** The last day the town reached, read from the log's phase labels. */
export function daysReached(state: CompanionState): number {
  let days = 0;
  for (const entry of state.log) {
    const m = /^Day (\d+)$/.exec(entry.when);
    if (m) days = Math.max(days, Number(m[1]));
  }
  return days;
}

/**
 * The record of a game that has ended, or `null` while it is still running.
 * `endedAt` is when the end was seen (ISO). A Storyteller name or reason the
 * record can't carry (blank) is dropped rather than failing the record.
 */
export function botcMatchRecord(state: CompanionState, endedAt: string): BotcRecordInput | null {
  if (state.phase.kind !== "ended") return null;
  const storyteller = state.storyteller?.trim();
  return {
    game: "blood-on-the-clocktower",
    edition: state.script,
    storyteller: storyteller ? storyteller.slice(0, 60) : null,
    players: state.players.map((p) => ({
      seat: p.seat,
      name: p.name.trim().slice(0, 60) || `Seat ${p.seat + 1}`,
      character: p.character,
      alignment: isEvilPlayer(p) ? "evil" : "good",
      alive: p.alive,
    })),
    winner: state.phase.winner,
    reason: state.phase.reason.trim().slice(0, 200) || "the Storyteller called it",
    days: daysReached(state),
    startedAt: state.startedAt ?? null,
    endedAt,
  };
}
