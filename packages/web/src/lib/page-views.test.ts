import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("./api-fetch", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("activity queue", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("sends activity requests one at a time, in the order they were queued", async () => {
    const { queueActivity } = await import("./page-views");
    const first = deferred<{ ok: true }>();
    const second = deferred<{ ok: true }>();
    apiFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const calls: string[] = [];
    const a = queueActivity(() => {
      calls.push("ack");
      return apiFetch("/api/greetings/ack", {});
    });
    const b = queueActivity(() => {
      calls.push("view");
      return apiFetch("/api/activity/view", {});
    });
    await Promise.resolve();
    // The page view must not start until the ack has been answered.
    expect(calls).toEqual(["ack"]);
    first.resolve({ ok: true });
    await a;
    await Promise.resolve();
    expect(calls).toEqual(["ack", "view"]);
    second.resolve({ ok: true });
    await b;
  });

  it("keeps going after a failed request", async () => {
    const { queueActivity } = await import("./page-views");
    apiFetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true });
    await expect(queueActivity(() => apiFetch("/x", {}))).rejects.toThrow("offline");
    await expect(queueActivity(() => apiFetch("/y", {}))).resolves.toEqual({ ok: true });
  });

  it("reportPageView goes through the queue and dedupes repeats", async () => {
    const { reportPageView } = await import("./page-views");
    apiFetch.mockResolvedValue({ ok: true });
    reportPageView("calendar");
    reportPageView("calendar");
    reportPageView("games");
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetch.mock.calls.map((c) => (c[1] as { body: { page: string } }).body.page)).toEqual([
      "calendar",
      "games",
    ]);
  });
});
