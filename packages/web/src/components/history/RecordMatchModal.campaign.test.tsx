import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RecordMatchModal } from "./RecordMatchModal";

// A campaign night (picks locked on a campaign game) plays that one game, so
// "+ Match" on it opens with the game already picked. Any other night starts
// empty.

const CAMPAIGN = "2026-11-05";
const OPEN = "2026-11-06";

vi.mock("../../lib/calendar-locks", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/calendar-locks")>();
  const lock = (topGameSlug: string, picksLockedAt: string | null) => ({
    eventTime: "19:00",
    rsvps: {},
    topGameSlug,
    picksLockedAt,
  });
  return {
    ...mod,
    fetchCalendarLocks: async () => ({
      [CAMPAIGN]: lock("gloomhaven", "2026-11-01 10:00:00"),
      [OPEN]: lock("gloomhaven", null),
    }),
  };
});

vi.mock("../../hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({ data: [] }),
}));

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const gameInput = () => screen.getByPlaceholderText(/Game title/i) as HTMLInputElement;

describe("RecordMatchModal — campaign nights", () => {
  it("picks the campaign game for a match on that night", async () => {
    render(
      wrap(
        <RecordMatchModal
          state={{ mode: "create", dateKey: CAMPAIGN }}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    expect(await screen.findByDisplayValue("Gloomhaven")).toBeTruthy();
  });

  it("leaves the game empty when the picks aren't locked", async () => {
    render(
      wrap(
        <RecordMatchModal
          state={{ mode: "create", dateKey: OPEN }}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    // Let the locks query settle before asserting nothing was filled in.
    await new Promise((r) => setTimeout(r, 50));
    expect(gameInput().value).toBe("");
  });
});
