import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyToClipboard } from "./useCopyToClipboard";

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockClipboard(writeText: (text: string) => Promise<void>) {
    Object.assign(navigator, { clipboard: { writeText } });
  }

  it("sets copied for the reset window, then clears it", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const { result } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => {
      await result.current.copy("hello");
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it("returns false and stays un-copied when the clipboard is blocked", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("blocked")));
    const { result } = renderHook(() => useCopyToClipboard());

    let ok = true;
    await act(async () => {
      ok = await result.current.copy("hello");
    });
    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("clears the pending reset timer on unmount (no late setState)", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const { result, unmount } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => {
      await result.current.copy("hello");
    });
    unmount();
    // Advancing past the reset window after unmount must not warn/throw.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it("restarts the reset window on rapid successive copies", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const { result } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => {
      await result.current.copy("a");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      await result.current.copy("b");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    // 3s after the first copy but only 1.5s after the second — still copied.
    expect(result.current.copied).toBe(true);
  });
});
