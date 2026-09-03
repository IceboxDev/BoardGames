import type { CalendarLocks, LockedDate, SessionUser } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session hook and the locks fetcher BEFORE importing the
// extension. Tests drive the hook purely from a seeded QueryClient — the
// fetcher must never reach a real API, so the stub hangs forever (queries
// that do fire just stay pending, which the hook renders as null).
vi.mock("../../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: vi.fn(),
}));
const fetchCalendarLocksMock = vi.fn(
  (_signal?: AbortSignal) => new Promise<CalendarLocks>(() => {}),
);
vi.mock("../../calendar-locks.ts", () => ({
  fetchCalendarLocks: (signal?: AbortSignal) => fetchCalendarLocksMock(signal),
}));

import { games } from "../../../games/registry.ts";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { dateKey } from "../../offline-availability.ts";
import { qk } from "../../query-keys.ts";
import voteLeaderExtension from "./vote-leader.ts";

const mockUseCurrentUser = vi.mocked(useCurrentUser);

function loggedIn() {
  mockUseCurrentUser.mockReturnValue({
    user: { id: "u1", name: "User One", role: "user" } as SessionUser,
    isLoading: false,
    isAdmin: false,
  });
}

function loggedOut() {
  mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
}

function mkLock(overrides: Partial<LockedDate> = {}): LockedDate {
  return {
    lockedBy: "u1",
    lockedAt: "2026-09-01 10:00:00",
    expectedUserIds: [],
    rsvps: {},
    host: null,
    eventTime: null,
    address: null,
    picksLockedAt: null,
    hostAtHome: true,
    attendance: { definite: 0, tentative: 0 },
    topGameSlug: null,
    ...overrides,
  };
}

/** DateKey for today + n days, built with the same helper the app uses. */
function keyFor(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return dateKey(d);
}

function renderAccent(seed?: CalendarLocks) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.calendarLocks(), seed);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => voteLeaderExtension.useAccentOverride(), { wrapper });
}

// Real catalog entries — the extension resolves accents through the actual
// registry, so the expected hex is whatever the catalog ships for the slug.
// The two must have distinct accents or the nearest-lock-wins assertions
// below would pass vacuously.
const gameA = games[0];
const gameB = games.find((g) => g.accentHex !== gameA.accentHex);
if (!gameB) throw new Error("catalog must hold two games with distinct accents");

beforeEach(() => {
  fetchCalendarLocksMock.mockClear();
  loggedIn();
});

describe("vote-leader extension", () => {
  it("satisfies the extension contract", () => {
    expect(voteLeaderExtension.key).toBe("vote-leader");
    expect(typeof voteLeaderExtension.useAccentOverride).toBe("function");
  });

  it("returns null while the locks query has no data", () => {
    const { result } = renderAccent();
    expect(result.current).toBeNull();
  });

  it("never fetches when logged out, and returns null", () => {
    loggedOut();
    const { result } = renderAccent();
    expect(result.current).toBeNull();
    expect(fetchCalendarLocksMock).not.toHaveBeenCalled();
  });

  it("returns the accent of the nearest upcoming lock with a vote winner", () => {
    const { result } = renderAccent({
      [keyFor(7)]: mkLock({ topGameSlug: gameB.slug }),
      [keyFor(2)]: mkLock({ topGameSlug: gameA.slug }),
    });
    expect(result.current).toBe(gameA.accentHex);
  });

  it("counts tonight (today's lock) as the nearest night", () => {
    const { result } = renderAccent({
      [keyFor(0)]: mkLock({ topGameSlug: gameA.slug }),
      [keyFor(3)]: mkLock({ topGameSlug: gameB.slug }),
    });
    expect(result.current).toBe(gameA.accentHex);
  });

  it("skips upcoming locks whose vote has no winner yet", () => {
    const { result } = renderAccent({
      [keyFor(1)]: mkLock(),
      [keyFor(4)]: mkLock({ topGameSlug: gameB.slug }),
    });
    expect(result.current).toBe(gameB.accentHex);
  });

  it("returns null when only past locks have winners", () => {
    const { result } = renderAccent({
      [keyFor(-3)]: mkLock({ topGameSlug: gameA.slug }),
      [keyFor(1)]: mkLock(),
    });
    expect(result.current).toBeNull();
  });

  it("returns null when the winning slug resolves to no catalog game", () => {
    const { result } = renderAccent({
      [keyFor(1)]: mkLock({ topGameSlug: "not-a-real-game" }),
    });
    expect(result.current).toBeNull();
  });
});
