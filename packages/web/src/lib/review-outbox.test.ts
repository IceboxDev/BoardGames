import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, SchemaError } from "./api-fetch";
import {
  classifySendFailure,
  createLocalLocks,
  ReviewOutbox,
  type ReviewOutboxOptions,
} from "./review-outbox";

interface Item {
  id: string;
}

const KEY = "test.outbox.v1";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

function stored(storage: ReturnType<typeof memoryStorage>): string[] {
  const raw = storage.data.get(KEY);
  return raw ? (JSON.parse(raw) as Item[]).map((i) => i.id) : [];
}

/** A promise the test resolves or rejects by hand. */
function deferred() {
  let resolve: (v?: unknown) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeOutbox(over: Partial<ReviewOutboxOptions<Item>> = {}) {
  const storage = memoryStorage();
  const sendOne = vi.fn(async (_: Item): Promise<unknown> => ({}));
  const sendBatch = vi.fn(async (_: readonly Item[]): Promise<unknown> => ({}));
  const outbox = new ReviewOutbox<Item>({
    storageKey: KEY,
    parse: (raw) =>
      typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string"
        ? { id: raw.id }
        : null,
    idOf: (i) => i.id,
    sendOne,
    sendBatch,
    maxBatch: 2,
    storage: () => storage,
    locks: createLocalLocks(),
    ...over,
  });
  return { outbox, storage, sendOne, sendBatch };
}

const apiError = (status: number) => new ApiError(status, `status ${status}`);

afterEach(() => {
  vi.useRealTimers();
});

describe("classifySendFailure", () => {
  it("drops only definitive rejections", () => {
    for (const status of [400, 404, 410, 413, 422]) {
      expect(classifySendFailure(apiError(status))).toBe("rejected");
    }
  });

  it("keeps auth, rate-limit, conflict, timeout and server failures", () => {
    for (const status of [401, 403, 408, 409, 429, 500, 502, 503]) {
      expect(classifySendFailure(apiError(status))).toBe("retry");
    }
    expect(classifySendFailure(new TypeError("Failed to fetch"))).toBe("retry");
  });

  it("treats a response-shape error as delivered and a request-shape error as rejected", () => {
    expect(classifySendFailure(new SchemaError([], "response"))).toBe("delivered");
    expect(classifySendFailure(new SchemaError([], "request"))).toBe("rejected");
  });
});

describe("ReviewOutbox", () => {
  it("drains in batches and empties storage", async () => {
    const { outbox, storage, sendBatch } = makeOutbox();
    for (const id of ["a", "b", "c"]) await outbox.enqueue({ id });
    const result = await outbox.flush();
    expect(result).toEqual({ sent: 3, rejected: 0, remaining: 0, stopped: false });
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(storage.data.has(KEY)).toBe(false);
    expect(outbox.getSnapshot().pending).toBe(0);
  });

  it("does not queue the same id twice", async () => {
    const { outbox, storage } = makeOutbox();
    await outbox.enqueue({ id: "a" });
    await outbox.enqueue({ id: "a" });
    expect(stored(storage)).toEqual(["a"]);
  });

  it("never loses a review enqueued while a flush awaits the network", async () => {
    const gate = deferred();
    let calls = 0;
    const sendBatch = vi.fn(async (_: readonly Item[]) => {
      calls++;
      if (calls === 1) await gate.promise;
    });
    const { outbox, storage } = makeOutbox({ sendBatch });
    await outbox.enqueue({ id: "a" });
    const flushing = outbox.flush();
    await Promise.resolve();
    await outbox.enqueue({ id: "late" });
    gate.resolve();
    expect((await flushing).sent).toBe(2);
    expect(sendBatch.mock.calls.map(([batch]) => batch.map((i) => i.id))).toEqual([
      ["a"],
      ["late"],
    ]);
    expect(stored(storage)).toEqual([]);
  });

  it("keeps everything on 429 without retrying one by one", async () => {
    const { outbox, storage, sendOne } = makeOutbox({
      sendBatch: vi.fn(async () => {
        throw apiError(429);
      }),
    });
    for (const id of ["a", "b", "c"]) await outbox.enqueue({ id });
    const result = await outbox.flush();
    expect(result).toMatchObject({ sent: 0, rejected: 0, remaining: 3, stopped: true });
    expect(sendOne).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual(["a", "b", "c"]);
  });

  it("keeps everything when the session has expired (401)", async () => {
    const { outbox, storage } = makeOutbox({
      sendBatch: vi.fn(async () => {
        throw apiError(401);
      }),
    });
    await outbox.enqueue({ id: "a" });
    await outbox.flush();
    expect(stored(storage)).toEqual(["a"]);
  });

  it("isolates a poisoned review: a 400 batch is retried one by one and only the bad one is dropped", async () => {
    const sendOne = vi.fn(async (item: Item) => {
      if (item.id === "bad") throw apiError(400);
    });
    const { outbox, storage } = makeOutbox({
      maxBatch: 10,
      sendOne,
      sendBatch: vi.fn(async () => {
        throw apiError(400);
      }),
    });
    for (const id of ["a", "bad", "c"]) await outbox.enqueue({ id });
    const result = await outbox.flush();
    expect(result).toMatchObject({ sent: 2, rejected: 1, remaining: 0 });
    expect(stored(storage)).toEqual([]);
    expect(outbox.getSnapshot().rejected).toBe(1);
  });

  it("stops the one-by-one pass at the first retryable failure and keeps the rest", async () => {
    const sendOne = vi.fn(async (item: Item) => {
      if (item.id === "b") throw apiError(503);
    });
    const { outbox, storage } = makeOutbox({
      maxBatch: 10,
      sendOne,
      sendBatch: vi.fn(async () => {
        throw apiError(422);
      }),
    });
    for (const id of ["a", "b", "c"]) await outbox.enqueue({ id });
    const result = await outbox.flush();
    expect(result).toMatchObject({ sent: 1, stopped: true, remaining: 2 });
    expect(stored(storage)).toEqual(["b", "c"]);
  });

  it("does not resurrect items cleared while a flush is in flight", async () => {
    const gate = deferred();
    const { outbox, storage } = makeOutbox({
      sendBatch: vi.fn(async () => {
        await gate.promise;
        throw apiError(503);
      }),
    });
    for (const id of ["a", "b"]) await outbox.enqueue({ id });
    const flushing = outbox.flush();
    await Promise.resolve();
    await outbox.clear();
    gate.resolve();
    await flushing;
    expect(stored(storage)).toEqual([]);
    expect(outbox.getSnapshot().pending).toBe(0);
  });

  it("keeps replay out while an exclusive section runs", async () => {
    const { outbox, sendBatch } = makeOutbox();
    await outbox.enqueue({ id: "a" });
    const result = await outbox.exclusive(async () => {
      const during = await outbox.flush();
      await outbox.clear();
      return during;
    });
    expect(result).toMatchObject({ sent: 0, stopped: true });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(outbox.getSnapshot().pending).toBe(0);
  });

  it("shares one run between concurrent flushes", async () => {
    const gate = deferred();
    const sendBatch = vi.fn(async () => gate.promise);
    const { outbox } = makeOutbox({ sendBatch });
    await outbox.enqueue({ id: "a" });
    const first = outbox.flush();
    const second = outbox.flush();
    expect(second).toBe(first);
    gate.resolve();
    await first;
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("drains from memory when storage throws, without resending what was sent", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const { outbox, sendBatch } = makeOutbox({ storage: () => broken });
    await outbox.enqueue({ id: "a" });
    expect(outbox.getSnapshot().pending).toBe(1);
    expect((await outbox.flush()).sent).toBe(1);
    expect(await outbox.flush()).toMatchObject({ sent: 0, remaining: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("skips malformed stored entries", async () => {
    const { outbox, storage } = makeOutbox();
    storage.setItem(KEY, JSON.stringify([{ id: "a" }, { nope: 1 }, "junk"]));
    expect(outbox.getSnapshot().pending).toBe(1);
  });

  it("retries on a backoff timer after a retryable failure once started", async () => {
    vi.useFakeTimers();
    let fail = true;
    const sendBatch = vi.fn(async () => {
      if (fail) throw apiError(503);
    });
    const { outbox, storage } = makeOutbox({ sendBatch, backoffMs: [1_000, 5_000] });
    await outbox.enqueue({ id: "a" });
    const stop = outbox.start(); // flushes now → fails → arms a 1 s retry
    await vi.advanceTimersByTimeAsync(0);
    expect(sendBatch).toHaveBeenCalledTimes(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(stored(storage)).toEqual([]);
    stop();
  });

  it("notifies subscribers when the pending count changes", async () => {
    const { outbox } = makeOutbox();
    const listener = vi.fn();
    outbox.getSnapshot();
    const unsubscribe = outbox.subscribe(listener);
    await outbox.enqueue({ id: "a" });
    expect(listener).toHaveBeenCalled();
    expect(outbox.getSnapshot().pending).toBe(1);
    unsubscribe();
  });
});
