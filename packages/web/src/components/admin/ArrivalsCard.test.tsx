import type { AdminArrivalsState } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGame } from "../../lib/games-by-slug";

// The card is the admin's only way to turn a closed vote into news: it must
// say plainly when there is nothing to announce from, open the composer from
// the latest closed vote, and retract a published arrival behind a confirm.

const fetchMock = vi.fn();
const publishMock = vi.fn();
const retractMock = vi.fn();
vi.mock("../../lib/arrivals.ts", () => ({
  fetchAdminArrivals: (...args: unknown[]) => fetchMock(...args),
  publishArrival: (body: unknown) => publishMock(body),
  retractArrival: (id: string) => retractMock(id),
}));
vi.mock("../../hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({
    data: [
      { id: "u1", name: "Mantas", email: "m@x", createdAt: "2026-01-01" },
      { id: "g1", name: "Guest", email: "g@x", createdAt: "2026-01-01", guest: true },
    ],
  }),
}));
vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "admin" }, isAdmin: true, isLoading: false }),
}));

import { qk } from "../../lib/query-keys";
import { ArrivalsCard } from "./ArrivalsCard";

const WINGSPAN = resolveGame("wingspan")?.title ?? "wingspan";
const PARKS = resolveGame("parks")?.title ?? "parks";

const POLL: AdminArrivalsState["polls"][number] = {
  id: 3,
  createdAt: "2026-09-01 10:00:00",
  closedAt: "2026-09-03 16:00:00",
  winnerSlug: "wingspan",
  candidates: ["wingspan", "parks"],
  voterCount: 2,
  tally: [
    { slug: "wingspan", votes: 2, voterIds: ["u1", "u2"] },
    { slug: "parks", votes: 1, voterIds: ["u2"] },
  ],
  arrivedSlugs: [],
};

const ARRIVAL: AdminArrivalsState["arrivals"][number] = {
  id: "a1",
  pollId: 3,
  publishedAt: "2026-09-10 12:00:00",
  publishedBy: "admin",
  seenBy: 2,
  games: [
    {
      slug: "wingspan",
      purchaserUserId: "u1",
      votes: 2,
      photoUrl: "/api/arrivals/a1/photos/wingspan",
      placeholder: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4",
      width: 1280,
      height: 1600,
      photoBytes: 240_000,
    },
  ],
};

const PLAYERS = {
  u1: { name: "Mantas", image: null },
  u2: { name: "Paul", image: null },
  admin: { name: "The Admin", image: null },
};

function renderCard(state: AdminArrivalsState) {
  fetchMock.mockResolvedValue(state);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <ArrivalsCard />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  fetchMock.mockReset();
  publishMock.mockReset();
  retractMock.mockReset();
  retractMock.mockResolvedValue(undefined);
});

describe("ArrivalsCard", () => {
  it("explains there is nothing to announce from before any vote has closed", async () => {
    renderCard({ polls: [], arrivals: [], players: {} });
    expect(await screen.findByText("No closed vote yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Announce arrival" })).toBeNull();
  });

  it("shows the latest closed vote and opens the composer from it", async () => {
    renderCard({ polls: [POLL], arrivals: [], players: PLAYERS });
    const user = userEvent.setup();

    expect(await screen.findByText(WINGSPAN)).toBeInTheDocument();
    expect(screen.getByText(PARKS)).toBeInTheDocument();
    expect(screen.getByText(/latest vote closed .* — winner/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Announce arrival" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Announce an arrival")).toBeInTheDocument();
  });

  it("lists a published arrival and retracts it behind a confirm", async () => {
    const { invalidate } = renderCard({ polls: [POLL], arrivals: [ARRIVAL], players: PLAYERS });
    const user = userEvent.setup();

    expect(await screen.findByText("Bought by Mantas")).toBeInTheDocument();
    expect(screen.getByText(/by The Admin · seen by 2/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retract" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Retract this arrival?")).toBeInTheDocument();
    expect(retractMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Retract" }));
    await waitFor(() => expect(retractMock).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.adminArrivals() }));
    expect(await screen.findByText(/Arrival pulled/)).toBeInTheDocument();
  });
});
