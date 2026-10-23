import { DEFAULT_QUIZ_SETTINGS, type QuizSettings } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../../../lib/query-keys";

// Saves never lose or revert a change: each builds on the latest cache, PUTs
// go out one at a time in order, and an earlier reply never paints over a
// later optimistic change.

const STORED: QuizSettings = { ...DEFAULT_QUIZ_SETTINGS, newFactsPerDay: 7 };

const putMock = vi.fn<(body: QuizSettings) => Promise<QuizSettings>>();
const getMock = vi.fn<() => Promise<QuizSettings>>();

vi.mock("../api", () => ({
  settingsQuery: () => () => getMock(),
  putSettings: (body: QuizSettings) => putMock(body),
}));

import { useQuizSettings } from "./useQuizSettings";

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useQuizSettings(), { wrapper });
  return { qc, ...hook };
}

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
  getMock.mockResolvedValue(STORED);
});

describe("useQuizSettings", () => {
  it("refuses to save before the stored settings load (never PUTs the defaults)", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    let saved = true;
    act(() => {
      saved = result.current.save({ language: { primary: "de", secondary: null } });
    });
    expect(saved).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("builds each save on the one before and sends them in order", async () => {
    const first = deferred<QuizSettings>();
    const second = deferred<QuizSettings>();
    putMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, qc } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.save((cur) => ({ excludeFromAll: [...cur.excludeFromAll, "history"] }));
    });
    act(() => {
      result.current.save((cur) => ({ excludeFromAll: [...cur.excludeFromAll, "art"] }));
    });
    // Both changes are in the cache at once (the screen re-renders from it).
    expect(qc.getQueryData<QuizSettings>(qk.quizSettings())?.excludeFromAll).toEqual([
      "history",
      "art",
    ]);
    await waitFor(() => expect(result.current.settings.excludeFromAll).toEqual(["history", "art"]));
    expect(result.current.saving).toBe(true);

    // Serialized: the second PUT waits for the first.
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    expect(putMock.mock.calls[0][0].excludeFromAll).toEqual(["history"]);

    // The first reply ([3]) must not paint over the pending [3, 5].
    await act(async () => first.resolve({ ...STORED, excludeFromAll: ["history"] }));
    expect(qc.getQueryData<QuizSettings>(qk.quizSettings())?.excludeFromAll).toEqual([
      "history",
      "art",
    ]);
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(2));
    expect(putMock.mock.calls[1][0]).toMatchObject({
      newFactsPerDay: 7,
      excludeFromAll: ["history", "art"],
    });

    await act(async () => second.resolve({ ...STORED, excludeFromAll: ["history", "art"] }));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.settings.excludeFromAll).toEqual(["history", "art"]);
  });

  it("refetches the stored row when the last save fails", async () => {
    putMock.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    getMock.mockResolvedValue(STORED);
    act(() => {
      result.current.save({ language: { primary: "de", secondary: null } });
    });
    await waitFor(() => expect(result.current.saveError).not.toBeNull());
    await waitFor(() => expect(result.current.settings.language).toEqual(STORED.language));
  });
});
