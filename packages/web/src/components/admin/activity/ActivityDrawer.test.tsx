import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../types";

// Opening a member's trail is what clears their users-table bubble: the
// drawer reports the newest id it rendered, once, and invalidates the unseen
// counts. Pinned here because nothing else exercises that seam.

const fetchActivityMock = vi.fn();
const markSeenMock = vi.fn();
vi.mock("../../../lib/admin", () => ({
  adminFetchActivity: (...args: unknown[]) => fetchActivityMock(...args),
  adminFetchDevices: vi.fn().mockResolvedValue({ devices: [] }),
  adminMarkActivitySeen: (userId: string, lastSeenId: number) => markSeenMock(userId, lastSeenId),
}));
vi.mock("../../../hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({ data: [] }),
}));

import { qk } from "../../../lib/query-keys";
import { ActivityDrawer } from "./ActivityDrawer";

const USER: AdminUser = {
  id: "u1",
  name: "Lina Smith",
  email: "lina@example.com",
  role: "user",
  createdAt: "2026-01-01",
};

function entry(id: number) {
  return { id, type: "login", meta: {}, createdAt: "2026-09-10 10:00:00" };
}

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <ActivityDrawer user={USER} onClose={() => {}} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  fetchActivityMock.mockReset();
  markSeenMock.mockReset();
  markSeenMock.mockResolvedValue(undefined);
});

describe("ActivityDrawer — marking the trail as seen", () => {
  it("reports the highest rendered id once, then refreshes the bubble counts", async () => {
    // Sorted by event time, so the top row need not carry the highest id.
    fetchActivityMock.mockResolvedValue({
      entries: [entry(41), entry(42), entry(40)],
      nextBefore: null,
    });
    const { invalidate } = renderDrawer();

    await waitFor(() => expect(markSeenMock).toHaveBeenCalledWith("u1", 42));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.adminUnseenActivity() }),
    );
    expect(markSeenMock).toHaveBeenCalledTimes(1);
  });

  it("reports nothing for a member with an empty trail", async () => {
    fetchActivityMock.mockResolvedValue({ entries: [], nextBefore: null });
    renderDrawer();

    await screen.findByText("No activity yet");
    expect(markSeenMock).not.toHaveBeenCalled();
  });
});

describe("ActivityDrawer — lines", () => {
  it("describes publishing, receiving, retracting and following an arrival", async () => {
    const at = "2026-09-10 12:00:00";
    fetchActivityMock.mockResolvedValue({
      entries: [
        {
          id: 9,
          type: "arrival-published",
          meta: {
            arrivalId: "a1",
            pollId: 3,
            games: [
              { slug: "wingspan", purchaserUserId: "u2" },
              { slug: "parks", purchaserUserId: "u3" },
            ],
          },
          createdAt: at,
        },
        { id: 8, type: "arrival-received", meta: { slug: "wingspan" }, createdAt: at },
        { id: 7, type: "arrival-retracted", meta: { arrivalId: "a1" }, createdAt: at },
        {
          id: 6,
          type: "greeting-response",
          meta: { kind: "arrival", action: "cta", arrivalId: "a1" },
          createdAt: at,
        },
        { id: 5, type: "page-view", meta: { page: "arrival" }, createdAt: at },
      ],
      nextBefore: null,
    });
    renderDrawer();

    expect(await screen.findByText(/Announced the arrival of Wingspan, Parks/)).toBeInTheDocument();
    expect(screen.getByText(/Received Wingspan from the purchase vote/)).toBeInTheDocument();
    expect(screen.getByText(/Retracted an arrival announcement/)).toBeInTheDocument();
    // Shown, then followed: one line.
    expect(
      screen.getByText(/Followed the arrivals announcement to the collection/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Saw the arrivals announcement/)).toBeNull();
  });

  it("labels the trainers and marks a repeated line with its count", async () => {
    fetchActivityMock.mockResolvedValue({
      entries: [
        {
          id: 4,
          type: "geography-train",
          meta: { localDate: "2026-09-28" },
          createdAt: "2026-09-28 01:10:00",
          occurredAtMs: Date.parse("2026-09-28T01:10:00Z"),
        },
        {
          id: 3,
          type: "page-view",
          meta: { page: "games" },
          createdAt: "2026-09-28 01:09:00",
          occurredAtMs: Date.parse("2026-09-28T01:09:00Z"),
        },
        {
          id: 2,
          type: "page-view",
          meta: { page: "games" },
          createdAt: "2026-09-28 00:37:00",
          occurredAtMs: Date.parse("2026-09-28T00:37:00Z"),
        },
      ],
      nextBefore: null,
    });
    renderDrawer();

    expect(
      await screen.findByText("Started the day's World Geography training"),
    ).toBeInTheDocument();
    expect(screen.getByText("Browsed the games catalog")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });
});
