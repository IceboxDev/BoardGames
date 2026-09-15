import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../../lib/query-keys";
import type { AdminUser } from "./types";

// The drawer is where an admin notes another member's blank days as "away".
// The note is a reminder, not availability: it can only go on a day the
// member has NOT marked, and saving it updates the page's away map (which
// feeds the pie behind the drawer) rather than the member's calendar.

const fetchAvailabilityMock = vi.fn();
const setAwayMock = vi.fn();
vi.mock("../../lib/offline-availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/offline-availability")>();
  return {
    ...actual,
    adminFetchAvailability: (...args: unknown[]) => fetchAvailabilityMock(...args),
    adminSetAwayDay: (...args: unknown[]) => setAwayMock(...args),
  };
});

import { AvailabilityDrawer } from "./AvailabilityDrawer";

const USER = { id: "u1", name: "Paul", email: "paul@example.com" } as AdminUser;

const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const dayNumber = (key: string) => String(Number(key.slice(8, 10)));

function renderDrawer(awayDays: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.adminAwayDays(), { [USER.id]: awayDays });
  render(
    <QueryClientProvider client={qc}>
      <AvailabilityDrawer user={USER} awayDays={awayDays} onClose={() => {}} />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AvailabilityDrawer — away notes", () => {
  it("notes a blank future day as away and writes the member's list into the page map", async () => {
    const target = dayKey(3);
    fetchAvailabilityMock.mockResolvedValue({});
    setAwayMock.mockResolvedValue([target]);
    const qc = renderDrawer([]);

    // The 42-day grid can show the same day number twice (this month and
    // next); cells render in date order and past ones are disabled, so the
    // first enabled match is the nearer, future one.
    const cells = await screen.findAllByRole("button", {
      name: new RegExp(`^${dayNumber(target)}$`),
    });
    const cell = cells.find((c) => !(c as HTMLButtonElement).disabled);
    if (!cell) throw new Error("no enabled cell for the target day");
    await userEvent.click(cell);

    await waitFor(() => expect(setAwayMock).toHaveBeenCalledWith(USER.id, target, true));
    await waitFor(() =>
      expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [target] }),
    );
  });

  it("shows a noted day as away, clears it on the next tap, and counts it in the summary", async () => {
    const away = dayKey(5);
    fetchAvailabilityMock.mockResolvedValue({});
    setAwayMock.mockResolvedValue([]);
    renderDrawer([away]);

    const cell = await screen.findByRole("button", {
      name: `${dayNumber(away)} — away (admin note)`,
    });
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No availability set · 1 away")).toBeInTheDocument();
    await userEvent.click(cell);
    await waitFor(() => expect(setAwayMock).toHaveBeenCalledWith(USER.id, away, false));
  });

  it("never offers the note on a day the member marked themselves", async () => {
    const marked = dayKey(4);
    fetchAvailabilityMock.mockResolvedValue({ [marked]: "can" });
    renderDrawer([marked]); // a stale note under the member's own mark

    const cell = await screen.findByRole("button", { name: `${dayNumber(marked)} — can` });
    expect(cell).toBeDisabled();
    // The member's mark wins: no "away" in the label, none in the summary.
    expect(screen.queryByRole("button", { name: /away \(admin note\)/ })).toBeNull();
    expect(screen.getByText("1 day marked across the next 6 weeks")).toBeInTheDocument();
  });
});
