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

  it("reportPageView goes through the queue and drops a burst repeat only", async () => {
    const { reportPageView, resetPageViewBurst } = await import("./page-views");
    resetPageViewBurst();
    apiFetch.mockResolvedValue({ ok: true });
    reportPageView("calendar");
    reportPageView("calendar"); // a re-render: dropped
    reportPageView("games");
    reportPageView("calendar"); // a genuine return: logged
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetch.mock.calls.map((c) => (c[1] as { body: { page: string } }).body.page)).toEqual([
      "calendar",
      "games",
      "calendar",
    ]);
  });

  it("logs the same page again once the burst window has passed", async () => {
    const { reportPageView, resetPageViewBurst } = await import("./page-views");
    resetPageViewBurst();
    apiFetch.mockResolvedValue({ ok: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      reportPageView("night", "2026-10-03");
      vi.setSystemTime(Date.now() + 11_000);
      reportPageView("night", "2026-10-03");
    } finally {
      vi.useRealTimers();
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("sends the via with the beacon", async () => {
    const { reportPageView, resetPageViewBurst } = await import("./page-views");
    resetPageViewBurst();
    apiFetch.mockResolvedValue({ ok: true });
    reportPageView("profile-skill", "u1", { via: "greeting:spotlight" });
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetch.mock.calls[0]?.[1]).toMatchObject({
      body: { page: "profile-skill", detail: "u1", via: "greeting:spotlight" },
    });
  });
});

describe("activity nav state", () => {
  it("round-trips a via and recognises a quiet tidy-up", async () => {
    const { activityNavState, isQuietNavState, quietNavState, viaFromNavState } = await import(
      "./page-views"
    );
    expect(viaFromNavState(activityNavState("greeting:arrival"))).toBe("greeting:arrival");
    expect(viaFromNavState(null)).toBeUndefined();
    expect(viaFromNavState({ activityVia: 3 })).toBeUndefined();
    expect(isQuietNavState(quietNavState())).toBe(true);
    expect(isQuietNavState({ from: "/" })).toBe(false);
  });
});
