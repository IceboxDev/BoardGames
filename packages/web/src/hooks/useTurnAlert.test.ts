import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURN_ALERT_BLINK_MS, useTurnAlert } from "./useTurnAlert";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.title = "Codenames";
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTurnAlert", () => {
  it("marks the title while something waits on the player, and puts it back", () => {
    const { rerender } = renderHook(({ label }) => useTurnAlert(label), {
      initialProps: { label: "Your clue" as string | null },
    });
    expect(document.title).toBe("● Your clue — Codenames");
    rerender({ label: null });
    expect(document.title).toBe("Codenames");
  });

  it("blinks only while the tab is hidden, and holds once it is looked at", () => {
    renderHook(() => useTurnAlert("Your guess"));
    vi.advanceTimersByTime(TURN_ALERT_BLINK_MS * 3);
    expect(document.title).toBe("● Your guess — Codenames");

    setHidden(true);
    vi.advanceTimersByTime(TURN_ALERT_BLINK_MS);
    expect(document.title).toBe("Codenames");
    vi.advanceTimersByTime(TURN_ALERT_BLINK_MS);
    expect(document.title).toBe("● Your guess — Codenames");
    vi.advanceTimersByTime(TURN_ALERT_BLINK_MS);

    setHidden(false);
    expect(document.title).toBe("● Your guess — Codenames");
  });

  it("puts the title back when the board goes away", () => {
    const { unmount } = renderHook(() => useTurnAlert("Your ruling"));
    unmount();
    expect(document.title).toBe("Codenames");
  });
});
