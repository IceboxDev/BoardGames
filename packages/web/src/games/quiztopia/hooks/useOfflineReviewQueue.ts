import { MAX_BULK_REVIEWS, type ReviewBody, ReviewBodySchema } from "@boardgames/core/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api-fetch";
import { submitReview, submitReviewsBulk } from "../api";

// A review that couldn't reach the server (offline, 5xx) waits here and is
// replayed later. Reviews are idempotent on `clientId`, so a replay of one
// the server did receive is harmless. The queue is a plain localStorage FIFO;
// every storage access is wrapped because private mode / quota / a blocked
// origin can make any of them throw, and a study session must survive that.

export const PENDING_REVIEWS_KEY = "quiztopia.pendingReviews.v1";

function readQueue(): ReviewBody[] {
  try {
    const raw = window.localStorage.getItem(PENDING_REVIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ReviewBody[] = [];
    for (const item of parsed) {
      const r = ReviewBodySchema.safeParse(item);
      if (r.success) out.push(r.data);
    }
    return out;
  } catch {
    return [];
  }
}

function writeQueue(items: readonly ReviewBody[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(PENDING_REVIEWS_KEY);
    else window.localStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify(items));
  } catch {
    // Quota / private mode: the in-memory copy still drains this session.
  }
}

function isClientRejection(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

/**
 * Drain the queue: bulk chunks first; a chunk the server rejects outright
 * (4xx) is retried one review at a time so only the bad review is dropped.
 * Stops at the first network / server failure and keeps the rest for later.
 */
export async function flushPendingReviews(): Promise<number> {
  let items = readQueue();
  let sent = 0;
  while (items.length > 0) {
    const chunk = items.slice(0, MAX_BULK_REVIEWS);
    try {
      await submitReviewsBulk({ reviews: chunk });
      items = items.slice(chunk.length);
      sent += chunk.length;
      writeQueue(items);
      continue;
    } catch (err) {
      if (!isClientRejection(err)) break;
    }
    // The chunk was rejected: find the offending review(s) individually.
    let stop = false;
    for (const review of chunk) {
      try {
        await submitReview(review);
        sent++;
      } catch (err) {
        if (!isClientRejection(err)) {
          stop = true;
          break;
        }
        // 4xx on a single review: malformed or unknown question — drop it.
      }
      items = items.slice(1);
      writeQueue(items);
    }
    if (stop) break;
  }
  return sent;
}

export function useOfflineReviewQueue() {
  const [pendingCount, setPendingCount] = useState(() => readQueue().length);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      await flushPendingReviews();
    } finally {
      flushing.current = false;
      setPendingCount(readQueue().length);
    }
  }, []);

  const enqueue = useCallback((review: ReviewBody) => {
    const items = readQueue();
    items.push(review);
    writeQueue(items);
    setPendingCount(items.length);
  }, []);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  return { enqueue, flush, pendingCount };
}
