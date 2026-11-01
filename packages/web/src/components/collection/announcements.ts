import type { Announcement } from "@boardgames/core/protocol";
import { parseUtcStamp } from "../../lib/date-format.ts";

/** How long an approved / dismissed announcement stays in the strip. */
export const RESOLVED_SHOWN_DAYS = 14;

/** What the strip shows: every pending announcement, and the last 3 resolved recently. */
export function visibleAnnouncements(
  announcements: readonly Announcement[],
  now: number = Date.now(),
): { pending: Announcement[]; resolved: Announcement[] } {
  const cutoff = now - RESOLVED_SHOWN_DAYS * 86_400_000;
  return {
    pending: announcements.filter((a) => a.status === "pending"),
    resolved: announcements
      .filter((a) => {
        if (a.status === "pending" || a.resolvedAt === null) return false;
        const at = parseUtcStamp(a.resolvedAt);
        return at !== null && at.getTime() >= cutoff;
      })
      .slice(0, 3),
  };
}
