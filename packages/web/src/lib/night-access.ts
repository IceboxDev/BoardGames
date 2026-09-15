// A viewer's relationship to a locked night, derived from the `/locks`
// payload the server already shaped for them. Nothing here decides access —
// the server redacted what the viewer may not see — this only names the
// viewer's own place so the calendar cell and the night modal can phrase it.

import type { LockedDate } from "@boardgames/core/protocol";

export type ViewerSeat =
  | "host"
  | "seated"
  | "waitlisted"
  | "invited"
  | "declined"
  /** Not on a private night's guest list (the lock arrived redacted). */
  | "outsider";

/** The viewer's seat on a PRIVATE night; null on an open night or when signed out. */
export function viewerSeat(
  lock: LockedDate | undefined,
  userId: string | null,
  isAdmin: boolean,
): ViewerSeat | null {
  if (!lock?.isPrivate || !userId) return null;
  if (lock.redacted) return "outsider";
  if (lock.host?.userId === userId) return "host";
  if (lock.seatedUserIds.includes(userId)) return "seated";
  if (lock.waitlistUserIds.includes(userId)) return "waitlisted";
  if (lock.rsvps[userId] === "no") return "declined";
  if (lock.expectedUserIds.includes(userId)) return "invited";
  // An admin sees everything but need not be invited to anything.
  return isAdmin ? "outsider" : "invited";
}

/** 1-based place in the waitlist, or null when not waiting. */
export function waitlistPosition(
  lock: LockedDate | undefined,
  userId: string | null,
): number | null {
  if (!lock || !userId) return null;
  const i = lock.waitlistUserIds.indexOf(userId);
  return i < 0 ? null : i + 1;
}

/** Host or admin: may change seats, invitees, pick mode and the lineup. */
export function canManageNight(
  lock: LockedDate | undefined,
  userId: string | null,
  isAdmin: boolean,
): boolean {
  if (!lock || !userId) return false;
  return isAdmin || lock.host?.userId === userId;
}

/** Seats still free (0 when full); null on open nights. */
export function seatsLeft(lock: LockedDate | undefined): number | null {
  if (!lock?.seats) return null;
  return Math.max(0, lock.seats.total - lock.seats.taken);
}
