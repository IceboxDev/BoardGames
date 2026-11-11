import type { SiteStatus } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HibernationGate } from "./HibernationGate";

vi.mock("../hooks/useSiteStatus.ts", () => ({ useSiteStatus: vi.fn() }));

import { useSiteStatus } from "../hooks/useSiteStatus.ts";

const mockStatus = vi.mocked(useSiteStatus);

function status(data: SiteStatus | undefined, isError = false) {
  mockStatus.mockReturnValue({ data, isError } as ReturnType<typeof useSiteStatus>);
}

const asleep = (over: Partial<SiteStatus> = {}): SiteStatus => ({
  hibernated: true,
  since: "2026-11-11T20:00:00.000Z",
  memorial: {
    nights: 120,
    matches: 640,
    onlineGames: 900,
    members: 18,
    firstNight: "2025-03-14",
    lastNight: "2026-11-07",
    topGames: [],
  },
  onlineAccess: false,
  admin: false,
  ...over,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HibernationGate>
        <Routes>
          <Route path="*" element={<div>The app</div>} />
        </Routes>
      </HibernationGate>
    </MemoryRouter>,
  );
}

beforeEach(() => mockStatus.mockReset());

describe("HibernationGate", () => {
  it("holds the app back until the status is known", () => {
    // Rendering early would let the sign-in guard send a signed-out visitor
    // to /login before the goodbye screen could take over.
    status(undefined);
    renderAt("/");
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("renders the app when the status can't be read", () => {
    status(undefined, true);
    renderAt("/");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("renders the app while awake", () => {
    status({ ...asleep(), hibernated: false, since: null, memorial: null });
    renderAt("/offline");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("shows the goodbye screen with no way in to someone without online access", async () => {
    status(asleep());
    renderAt("/offline");
    expect(await screen.findByText("It was fun while it lasted.")).toBeInTheDocument();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("gives an online member the button and lets them into the online area", async () => {
    status(asleep({ onlineAccess: true }));
    renderAt("/");
    expect(
      await screen.findByRole("button", { name: "Continue to the online games" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Admin console" })).not.toBeInTheDocument();
  });

  it("lets an online member play", () => {
    status(asleep({ onlineAccess: true }));
    renderAt("/play/lost-cities/solo");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("keeps the online area closed to someone without online access", () => {
    status(asleep());
    renderAt("/play/lost-cities/solo");
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("gives the admin both ways in and keeps the console open", async () => {
    status(asleep({ onlineAccess: true, admin: true }));
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Admin console" })).toBeVisible();
    status(asleep({ onlineAccess: true, admin: true }));
    renderAt("/admin");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("still serves the sign-in page by typed URL", () => {
    status(asleep());
    renderAt("/login");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });
});
