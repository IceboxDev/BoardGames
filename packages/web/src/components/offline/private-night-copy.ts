// Words and options shared by the lock-in dialog and the host's manage
// sheet: how games get picked, and the invitation as pasteable text.

import type { LockedDate, PickMode } from "@boardgames/core/protocol";
import { formatDayKey } from "../../lib/date-format";
import type { SegmentedOption } from "../ui/SegmentedControl";

export const PICK_MODE_OPTIONS: SegmentedOption<PickMode>[] = [
  { value: "host", label: "Host picks", tone: "amber", title: "The host curates the lineup" },
  {
    value: "group",
    label: "Everyone votes",
    tone: "accent",
    title: "Seated players vote as usual",
  },
];

export function pickModeHint(mode: PickMode): string {
  return mode === "host"
    ? "You choose the games; guests see your lineup and what to bring."
    : "Everyone with a seat hypes and ranks games, like an open night.";
}

/** The invitation as text — for the group chat, the only push we have. */
export function inviteText(date: string, lock: LockedDate, origin: string): string {
  const when = `${formatDayKey(date, "weekday")}${lock.eventTime ? ` at ${lock.eventTime}` : ""}`;
  const what = lock.title ? `${lock.title} — a private game night` : "a private game night";
  const seats = lock.seats
    ? ` ${Math.max(0, lock.seats.total - lock.seats.taken)} of ${lock.seats.total} seats are still free — first to answer, first seated.`
    : "";
  return `You're invited to ${what} on ${when}.${seats}\nRSVP here: ${origin}/offline?date=${date}`;
}
