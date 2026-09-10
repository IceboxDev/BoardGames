import type { Announcement } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveInventoryEntry } from "../../lib/resolve-inventory-entry.ts";

// The queue used to route EVERY approval through the full game picker, so
// approving "Wingspan" opened a 160-row list with the pre-selected row
// scrolled out of sight — it read as "pick a game from scratch". These tests
// pin the split: a named game approves in one click, the picker only appears
// when the admin genuinely has to choose (free text, or an explicit re-map).

const fetchMock = vi.fn();
const resolveMock = vi.fn();
vi.mock("../../lib/collection.ts", () => ({
  adminFetchAnnouncements: (...args: unknown[]) => fetchMock(...args),
  adminResolveAnnouncement: (id: string, body: unknown) => resolveMock(id, body),
}));

import { AnnouncementsCard } from "./AnnouncementsCard";

const NAMED: Announcement = {
  id: "a-named",
  userId: "u1",
  userName: "Jaqueline Binder",
  slug: "wingspan",
  freeTextName: null,
  note: null,
  status: "pending",
  resolutionSlug: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: "2026-09-09T12:00:00.000Z",
};

const FREE_TEXT: Announcement = {
  ...NAMED,
  id: "a-free",
  slug: null,
  freeTextName: "the bird one",
};

const WINGSPAN = resolveInventoryEntry("wingspan").title;
const PARKS = resolveInventoryEntry("parks").title;

function renderCard(announcements: Announcement[]) {
  fetchMock.mockResolvedValue({ announcements });
  resolveMock.mockResolvedValue({ ok: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnouncementsCard />
    </QueryClientProvider>,
  );
}

const searchBox = () => screen.queryByLabelText("Search ownable games");

beforeEach(() => {
  fetchMock.mockReset();
  resolveMock.mockReset();
});

describe("AnnouncementsCard — approving", () => {
  it("approves a named game in one click without opening the picker", async () => {
    renderCard([NAMED]);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(resolveMock).toHaveBeenCalledWith("a-named", { action: "approve", slug: "wingspan" }),
    );
    expect(searchBox()).toBeNull();
  });

  it("opens the picker for a free-text announcement instead of resolving", async () => {
    renderCard([FREE_TEXT]);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Approve" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/They wrote: “the bird one”/)).toBeInTheDocument();
    expect(searchBox()).not.toBeNull();
    expect(resolveMock).not.toHaveBeenCalled();

    // The picked slug is what gets stamped, not the free text.
    await user.type(within(dialog).getByLabelText("Search ownable games"), "wingspan");
    await user.click(within(dialog).getByText(WINGSPAN));
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(resolveMock).toHaveBeenCalledWith("a-free", { action: "approve", slug: "wingspan" }),
    );
  });

  it("offers Change on a named game to re-map the slug before stamping", async () => {
    renderCard([NAMED]);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Change" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(`They announced ${WINGSPAN} — pick the game to stamp instead.`),
    ).toBeInTheDocument();
    expect(resolveMock).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Search ownable games"), "parks");
    await user.click(within(dialog).getByText(PARKS));
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(resolveMock).toHaveBeenCalledWith("a-named", { action: "approve", slug: "parks" }),
    );
  });

  it("only shows Change for named games and As custom for free text", async () => {
    renderCard([NAMED, FREE_TEXT]);

    await screen.findAllByRole("button", { name: "Approve" });
    expect(screen.getAllByRole("button", { name: "Change" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "As custom" })).toHaveLength(1);
  });
});
