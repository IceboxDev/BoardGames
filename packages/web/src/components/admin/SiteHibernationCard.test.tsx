import type { SiteStatus } from "@boardgames/core/protocol";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../../test/query-client";

// The switch must be hard to hit by accident: the typed word gates it, and the
// dialog says plainly that nothing is deleted.

vi.mock("../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: { id: "admin-1" }, isLoading: false, isAdmin: true }),
}));
vi.mock("../../lib/site", () => ({
  fetchSiteStatus: vi.fn(),
  adminFetchSiteLog: vi.fn(async () => ({ entries: [] })),
  adminFetchMemorialPreview: vi.fn(async () => ({
    nights: 28,
    matches: 131,
    onlineGames: 49,
    members: 26,
    firstNight: "2026-05-07",
    lastNight: "2026-10-30",
    topGames: [],
  })),
  adminHibernate: vi.fn(),
  adminWake: vi.fn(),
}));

import { adminHibernate, fetchSiteStatus } from "../../lib/site";
import { SiteHibernationCard } from "./SiteHibernationCard";

const awake: SiteStatus = {
  hibernated: false,
  since: null,
  memorial: null,
  onlineAccess: true,
  admin: true,
};

function renderCard() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter>
        <SiteHibernationCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchSiteStatus).mockResolvedValue(awake);
  vi.mocked(adminHibernate).mockReset();
});

describe("SiteHibernationCard", () => {
  it("hibernates only after the word is typed", async () => {
    vi.mocked(adminHibernate).mockResolvedValue({ ...awake, hibernated: true, since: "x" });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Hibernate the site…" }));

    expect(
      screen.getByText(/No account, night, RSVP, match or setting is deleted/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/28 nights · 131 games recorded/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Hibernate the site" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type HIBERNATE to confirm"), {
      target: { value: "hibernate" },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type HIBERNATE to confirm"), {
      target: { value: "HIBERNATE" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(adminHibernate).toHaveBeenCalledTimes(1));
  });

  it("offers waking when the site sleeps", async () => {
    vi.mocked(fetchSiteStatus).mockResolvedValue({
      ...awake,
      hibernated: true,
      since: "2026-11-11T20:00:00.000Z",
    });
    renderCard();
    expect(await screen.findByRole("button", { name: "Wake the site" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Hibernate the site…" })).not.toBeInTheDocument();
  });
});
