import type { DrillCard } from "@boardgames/core/games/chess/trainer/drill";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillSchedule } from "./useDrill";
import { NEXT_AFTER_RIGHT_MS, useDrillSession } from "./useDrillSession";

const card: DrillCard = { key: "k1", fen: "f", uci: "e2e4", san: "e4", following: 3, ply: 0 };

function schedule(states: DrillSchedule["states"] = new Map()): DrillSchedule {
  return {
    today: "2026-10-20",
    states,
    overview: {
      states: [],
      today: { reviews: 0, correct: 0 },
      introducedToday: 0,
      streak: { current: 0, longest: 0, studiedToday: false },
      retention30: null,
    },
    error: false,
    pending: 0,
    grade: vi.fn(),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDrillSession", () => {
  it("teaches a new move first, then asks for it later as its first graded answer", () => {
    const s = schedule();
    const { result } = renderHook(() => useDrillSession([card], s, "session-1", undefined, true));
    expect(result.current.current?.tier).toBe("new");
    expect(result.current.phase).toBe("teach");

    act(() => result.current.play("d2d4"));
    expect(result.current.offMove).toBe(true);
    expect(s.grade).not.toHaveBeenCalled();

    act(() => result.current.play("e2e4"));
    expect(result.current.phase).toBe("taught");
    expect(result.current.dealt.map((d) => d.tier)).toEqual(["new", "recall"]);
    expect(s.grade).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(NEXT_AFTER_RIGHT_MS));
    expect(result.current.current?.tier).toBe("recall");
    expect(result.current.phase).toBe("ask");

    act(() => result.current.play("e2e4"));
    expect(result.current.phase).toBe("right");
    expect(s.grade).toHaveBeenCalledWith(
      "k1",
      "good",
      { played: "e2e4", expected: "e2e4", hinted: false },
      expect.any(Number),
      "trainer",
    );
  });

  it("deals a missed card again later in the session", () => {
    const s = schedule(
      new Map([
        [
          "k1",
          {
            questionId: "k1",
            state: "review",
            ease: 2.5,
            intervalDays: 3,
            dueDate: "2026-10-19",
            reps: 3,
            lapses: 0,
            lastReviewedAt: null,
          },
        ],
      ]),
    );
    const { result } = renderHook(() => useDrillSession([card], s, "session-2", undefined, true));
    expect(result.current.phase).toBe("ask");
    act(() => result.current.play("d2d4"));
    expect(result.current.phase).toBe("wrong");
    expect(s.grade).toHaveBeenCalledWith(
      "k1",
      "again",
      expect.anything(),
      expect.any(Number),
      "trainer",
    );
    expect(result.current.dealt.map((d) => d.tier)).toEqual(["review", "recall"]);
  });
});
