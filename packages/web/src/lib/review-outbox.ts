import { useEffect, useSyncExternalStore } from "react";
import { ApiError, SchemaError } from "./api-fetch.ts";

// A durable outbox for trainer reviews (Quiztopia, Geography): a review that
// can't reach the server waits in localStorage and is replayed later. Every
// review carries a client-generated id the server is idempotent on, so a
// replay of one that DID arrive is harmless — which is what makes "when in
// doubt, keep it and resend" the right default everywhere below.
//
// Guarantees:
//   - No lost writes. Every read-modify-write of the stored queue runs under
//     an exclusive Web Lock (`<key>:store`, shared by every tab of the
//     origin), always re-reads the queue inside the lock, and removes sent
//     items BY ID — never by writing back a snapshot taken before an await.
//   - One drainer. A flush holds `<key>:flush` for its whole run; a flush
//     that finds it taken (another tab, or this tab already flushing) skips.
//   - Only a definitive verdict drops a review: see `classifySendFailure`.
//     An expired session (401), a rate limit (429), a 5xx or no network keep
//     the review and retry with backoff.
//   - Storage that throws (private mode, quota, blocked origin) degrades to
//     an in-memory queue that still drains this page's lifetime.
// Browsers without `navigator.locks` get an in-tab mutex: same guarantees
// within one tab, best-effort across tabs (still safe: ids are idempotent).

// ── Failure classification ──────────────────────────────────────────────

/**
 * Statuses that mean "this payload will never be accepted": malformed body,
 * unknown question, gone, too large, or semantically invalid (e.g. a
 * `localDate` outside the server's window). Everything else is retryable.
 */
export const PERMANENT_REJECTION_STATUSES: ReadonlySet<number> = new Set([400, 404, 410, 413, 422]);

/** What a send's outcome means for the queued item. */
export type SendVerdict = "delivered" | "rejected" | "retry";

/** How a failed send should be treated. Shared by the outbox and live submits. */
export function classifySendFailure(err: unknown): SendVerdict {
  // The server answered 2xx; only the reply's shape surprised us. The write
  // landed — resending would be a no-op, keeping it would be a leak.
  if (err instanceof SchemaError) return err.stage === "response" ? "delivered" : "rejected";
  if (err instanceof ApiError && PERMANENT_REJECTION_STATUSES.has(err.status)) return "rejected";
  return "retry";
}

// ── Locks ───────────────────────────────────────────────────────────────

/** The subset of the Web Locks API the outbox uses. */
export interface LockProvider {
  request<R>(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (granted: boolean) => Promise<R>,
  ): Promise<R>;
}

function webLocks(): LockProvider | null {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return null;
  return {
    request: (name, options, callback) =>
      locks.request(name, options, (lock) => callback(lock !== null)),
  };
}

/** In-tab fallback: a FIFO mutex per name. */
export function createLocalLocks(): LockProvider {
  const tails = new Map<string, Promise<void>>();
  return {
    async request(name, options, callback) {
      if (options.ifAvailable && tails.has(name)) return callback(false);
      const prev = tails.get(name) ?? Promise.resolve();
      let release = () => {};
      const mine = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = prev.then(() => mine);
      tails.set(name, tail);
      await prev;
      try {
        return await callback(true);
      } finally {
        release();
        if (tails.get(name) === tail) tails.delete(name);
      }
    },
  };
}

// ── Outbox ──────────────────────────────────────────────────────────────

export interface ReviewOutboxOptions<T> {
  /** localStorage key holding the JSON array; also the lock-name prefix. */
  storageKey: string;
  /** Validate one stored entry; anything that fails is dropped on read. */
  parse: (raw: unknown) => T | null;
  /** The idempotency key the server dedupes on. */
  idOf: (item: T) => string;
  sendOne: (item: T) => Promise<unknown>;
  sendBatch: (items: readonly T[]) => Promise<unknown>;
  maxBatch: number;
  /** Delay before retry N (0-based) after a retryable failure; the last entry repeats. */
  backoffMs?: readonly number[];
  /** Injectable for tests. `null` = no persistent storage (memory only). */
  storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  locks?: LockProvider;
}

export interface FlushResult {
  sent: number;
  /** Dropped as permanently rejected. */
  rejected: number;
  /** Still queued after this flush. */
  remaining: number;
  /** Stopped early on a retryable failure (or another drainer held the lock). */
  stopped: boolean;
}

export interface OutboxSnapshot {
  /** Reviews waiting to reach the server. */
  pending: number;
  /** Reviews dropped as permanently rejected during this page's lifetime. */
  rejected: number;
}

export const DEFAULT_OUTBOX_BACKOFF_MS: readonly number[] = [5_000, 15_000, 60_000, 300_000];

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class ReviewOutbox<T> {
  private readonly opts: Required<Omit<ReviewOutboxOptions<T>, "storage" | "locks">>;
  private readonly storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  private readonly locks: LockProvider;
  /** Authoritative copy once storage has failed; mirror of storage otherwise. */
  private memory: T[] = [];
  private storageBroken = false;
  private snapshot: OutboxSnapshot = { pending: 0, rejected: 0 };
  private snapshotLoaded = false;
  private readonly listeners = new Set<() => void>();
  private inflight: Promise<FlushResult> | null = null;
  private starts = 0;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private detach: (() => void) | null = null;

  constructor(options: ReviewOutboxOptions<T>) {
    this.opts = {
      storageKey: options.storageKey,
      parse: options.parse,
      idOf: options.idOf,
      sendOne: options.sendOne,
      sendBatch: options.sendBatch,
      maxBatch: options.maxBatch,
      backoffMs: options.backoffMs ?? DEFAULT_OUTBOX_BACKOFF_MS,
    };
    this.storage = options.storage ?? defaultStorage;
    this.locks = options.locks ?? webLocks() ?? createLocalLocks();
  }

  // ── Storage ────────────────────────────────────────────────────────────

  private read(): T[] {
    if (this.storageBroken) return [...this.memory];
    try {
      const store = this.storage();
      if (!store) {
        this.storageBroken = true;
        return [...this.memory];
      }
      const raw = store.getItem(this.opts.storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(parsed)
        ? parsed.flatMap((entry) => {
            const item = this.opts.parse(entry);
            return item === null ? [] : [item];
          })
        : [];
      this.memory = items;
      return [...items];
    } catch {
      // Unreadable or corrupt: fall back to what this page last knew.
      return [...this.memory];
    }
  }

  private write(items: readonly T[]): void {
    this.memory = [...items];
    if (!this.storageBroken) {
      try {
        const store = this.storage();
        if (!store) this.storageBroken = true;
        else if (items.length === 0) store.removeItem(this.opts.storageKey);
        else store.setItem(this.opts.storageKey, JSON.stringify(items));
      } catch {
        // From now on memory is the truth for this page: a storage copy we
        // can no longer update would otherwise resend removed items forever.
        this.storageBroken = true;
      }
    }
    this.setSnapshot({ pending: items.length });
  }

  /** Read-modify-write under the cross-tab store lock. */
  private mutate(change: (items: T[]) => T[]): Promise<void> {
    return this.locks.request(`${this.opts.storageKey}:store`, {}, async () => {
      this.write(change(this.read()));
    });
  }

  private removeIds(ids: ReadonlySet<string>): Promise<void> {
    return this.mutate((items) => items.filter((item) => !ids.has(this.opts.idOf(item))));
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Queue one review (a no-op for an id already queued) and arm a retry. */
  readonly enqueue = async (item: T): Promise<void> => {
    const id = this.opts.idOf(item);
    await this.mutate((items) =>
      items.some((queued) => this.opts.idOf(queued) === id) ? items : [...items, item],
    );
    this.scheduleRetry();
  };

  /** Drop everything queued (a progress reset): taken under the store lock so no flush resurrects it. */
  readonly clear = async (): Promise<void> => {
    await this.mutate(() => []);
  };

  /**
   * Run `fn` with replay paused in every tab: waits for an in-flight flush to
   * finish and keeps new ones out until `fn` settles. For a progress reset —
   * a queued review sent between the server's wipe and the local `clear()`
   * would quietly re-create the progress just reset.
   */
  readonly exclusive = <R>(fn: () => Promise<R>): Promise<R> =>
    this.locks.request(`${this.opts.storageKey}:flush`, {}, () => fn());

  /** Send what is queued. Concurrent calls in one tab share one run. */
  readonly flush = (): Promise<FlushResult> => {
    if (!this.inflight) {
      this.inflight = this.locks
        .request(`${this.opts.storageKey}:flush`, { ifAvailable: true }, async (granted) => {
          if (!granted)
            return { sent: 0, rejected: 0, remaining: this.read().length, stopped: true };
          return this.drain();
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  };

  private async drain(): Promise<FlushResult> {
    let sent = 0;
    let rejected = 0;
    const done = (stopped: boolean): FlushResult => {
      const remaining = this.read().length;
      if (stopped && remaining > 0) this.noteFailure();
      else this.failures = 0;
      if (rejected > 0) this.setSnapshot({ rejected: this.snapshot.rejected + rejected });
      this.setSnapshot({ pending: remaining });
      return { sent, rejected, remaining, stopped };
    };

    for (;;) {
      const batch = this.read().slice(0, this.opts.maxBatch);
      if (batch.length === 0) return done(false);
      const verdict = await settle(() => this.opts.sendBatch(batch));
      if (verdict === "retry") return done(true);
      if (verdict === "delivered") {
        await this.removeIds(new Set(batch.map(this.opts.idOf)));
        sent += batch.length;
        continue;
      }
      // The batch as a whole was refused: find the bad review(s) one by one
      // so a single poisoned entry can't block everything behind it.
      for (const item of batch) {
        const one = await settle(() => this.opts.sendOne(item));
        if (one === "retry") return done(true);
        await this.removeIds(new Set([this.opts.idOf(item)]));
        if (one === "delivered") sent++;
        else rejected++;
      }
    }
  }

  // ── Retry scheduling ───────────────────────────────────────────────────

  private noteFailure(): void {
    this.failures++;
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.starts === 0 || this.retryTimer !== null) return;
    const { backoffMs } = this.opts;
    const delay = backoffMs[Math.min(Math.max(this.failures - 1, 0), backoffMs.length - 1)] ?? 0;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private flushNow = (): void => {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.flush();
  };

  /**
   * Begin replaying: flush now, on reconnect, when the tab becomes visible
   * and on a backoff timer after failures. Ref-counted; returns the stop.
   */
  readonly start = (): (() => void) => {
    this.starts++;
    if (this.starts === 1 && typeof window !== "undefined") {
      const onVisible = () => {
        if (document.visibilityState === "visible") this.flushNow();
      };
      const onStorage = (e: StorageEvent) => {
        if (e.key === this.opts.storageKey) this.setSnapshot({ pending: this.read().length });
      };
      window.addEventListener("online", this.flushNow);
      window.addEventListener("storage", onStorage);
      document.addEventListener("visibilitychange", onVisible);
      this.detach = () => {
        window.removeEventListener("online", this.flushNow);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", onVisible);
      };
      this.flushNow();
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.starts--;
      if (this.starts > 0) return;
      this.detach?.();
      this.detach = null;
      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    };
  };

  // ── Subscription (useSyncExternalStore) ────────────────────────────────

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): OutboxSnapshot => {
    if (!this.snapshotLoaded) {
      this.snapshotLoaded = true;
      this.snapshot = { pending: this.read().length, rejected: 0 };
    }
    return this.snapshot;
  };

  private setSnapshot(patch: Partial<OutboxSnapshot>): void {
    const current = this.getSnapshot();
    const next = { ...current, ...patch };
    if (next.pending === current.pending && next.rejected === current.rejected) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

async function settle(send: () => Promise<unknown>): Promise<SendVerdict> {
  try {
    await send();
    return "delivered";
  } catch (err) {
    return classifySendFailure(err);
  }
}

// ── React binding ───────────────────────────────────────────────────────

const SERVER_SNAPSHOT: OutboxSnapshot = { pending: 0, rejected: 0 };

/**
 * Subscribe to an outbox: its live counts plus `enqueue` / `flush`. Mounting
 * at least one consumer is what keeps the outbox replaying (`start`).
 */
export function useReviewOutbox<T>(outbox: ReviewOutbox<T>) {
  useEffect(() => outbox.start(), [outbox]);
  const snapshot = useSyncExternalStore(
    outbox.subscribe,
    outbox.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return {
    pendingCount: snapshot.pending,
    rejectedCount: snapshot.rejected,
    enqueue: outbox.enqueue,
    flush: outbox.flush,
  };
}
