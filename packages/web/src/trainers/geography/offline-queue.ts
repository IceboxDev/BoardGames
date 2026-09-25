import {
  type GeoReviewBody,
  GeoReviewBodySchema,
  MAX_GEO_BULK_REVIEWS,
} from "@boardgames/core/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api-fetch";
import { submitReview, submitReviewsBulk } from "./api";

// Reviews that couldn't reach the server wait in localStorage and replay
// later — idempotent on `clientId`, so a replay of one that did arrive is
// harmless. The same FIFO as Quiztopia's trainer, under its own key; every
// storage access is guarded (private mode, quota, blocked origin).

export const GEO_PENDING_KEY = "geography.pendingReviews.v1";

function readQueue(): GeoReviewBody[] {
  try {
    const raw = window.localStorage.getItem(GEO_PENDING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const r = GeoReviewBodySchema.safeParse(item);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

function writeQueue(items: readonly GeoReviewBody[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(GEO_PENDING_KEY);
    else window.localStorage.setItem(GEO_PENDING_KEY, JSON.stringify(items));
  } catch {
    // The in-memory copy still drains this session.
  }
}

const rejected = (err: unknown) => err instanceof ApiError && err.status >= 400 && err.status < 500;

/** Drain in bulk chunks; a rejected chunk is retried one by one so only the bad review is dropped. */
export async function flushGeoReviews(): Promise<number> {
  let items = readQueue();
  let sent = 0;
  while (items.length > 0) {
    const chunk = items.slice(0, MAX_GEO_BULK_REVIEWS);
    try {
      await submitReviewsBulk(chunk);
      items = items.slice(chunk.length);
      sent += chunk.length;
      writeQueue(items);
      continue;
    } catch (err) {
      if (!rejected(err)) break;
    }
    let stop = false;
    for (const review of chunk) {
      try {
        await submitReview(review);
        sent++;
      } catch (err) {
        if (!rejected(err)) {
          stop = true;
          break;
        }
      }
      items = items.slice(1);
      writeQueue(items);
    }
    if (stop) break;
  }
  return sent;
}

export function useGeoOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(() => readQueue().length);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      await flushGeoReviews();
    } finally {
      flushing.current = false;
      setPendingCount(readQueue().length);
    }
  }, []);

  const enqueue = useCallback((review: GeoReviewBody) => {
    const items = [...readQueue(), review];
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
