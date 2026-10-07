import type { QueryClient } from "@tanstack/react-query";
import { qk } from "../../lib/query-keys";

// Which cached reads each kind of write makes stale — named once here, so a
// new mutation picks the matching helper instead of hand-listing keys (and
// forgetting one: the wiki's per-question dots used to stay stale after a
// study session because `states` was missing from the list).

/** After grades land: due counts, streak/heatmap, queues, per-question dots, timeline pins, journal. */
export function invalidateAfterReviews(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [
    qk.quiztopiaOverviewAll(),
    qk.quiztopiaHistoryAll(),
    qk.quiztopiaQueueAll(),
    qk.quiztopiaStatesAll(),
    qk.quiztopiaPins(),
    qk.quiztopiaJournalAll(),
  ]);
}

/** After an article is marked read or unread: the journal shows reads by day. */
export function invalidateAfterRead(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: qk.quiztopiaJournalAll() });
}

/** After a settings save: the overview's new-card budget and the queue's cap. */
export function invalidateAfterSettings(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qk.quiztopiaOverviewAll(), qk.quiztopiaQueueAll()]);
}

/** After a progress reset: every per-member read; content and settings survive a reset. */
export function invalidateAfterReset(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({
    queryKey: qk.quiztopiaAll(),
    predicate: (q) => q.queryKey[1] !== "content" && q.queryKey[1] !== "settings",
  });
}

async function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
