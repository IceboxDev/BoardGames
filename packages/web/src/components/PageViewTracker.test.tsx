import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route tracker decides which navigations are a new look. Pinned here:
// a search-param change that classifies the same is not; a genuine return
// is; a `via` rides along; a quiet tidy-up (the calendar stripping its
// `?date=` deep link) is skipped.

const reportPageView = vi.fn();
vi.mock("../lib/page-views", async (importActual) => ({
  ...(await importActual<typeof import("../lib/page-views")>()),
  reportPageView: (...args: unknown[]) => reportPageView(...args),
}));
vi.mock("../lib/device-info", () => ({ reportDevice: vi.fn() }));
vi.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: { id: "u1" } }) }));

const { PageViewTracker } = await import("./PageViewTracker");
const { activityNavState, quietNavState } = await import("../lib/page-views");

function setup(initial: string) {
  const router = createMemoryRouter([{ path: "*", element: <PageViewTracker /> }], {
    initialEntries: [initial],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function reported(): unknown[][] {
  return reportPageView.mock.calls;
}

beforeEach(() => {
  reportPageView.mockReset();
});

describe("PageViewTracker", () => {
  it("reports each new look, including a return, but not a same-view search change", async () => {
    const router = setup("/games");
    await act(() => router.navigate("/games?sort=weight"));
    await act(() => router.navigate("/"));
    await act(() => router.navigate("/games"));
    expect(reported().map((c) => c[0])).toEqual(["games", "home", "games"]);
  });

  it("passes the via a navigation carried", async () => {
    const router = setup("/");
    await act(() =>
      router.navigate("/u/u2/skill", { state: activityNavState("greeting:spotlight") }),
    );
    expect(reported()[1]).toEqual(["profile-skill", "u2", { via: "greeting:spotlight" }]);
  });

  it("skips a quiet tidy-up and does not re-report the route it lands on", async () => {
    const router = setup("/offline?date=2026-10-03");
    await act(() => router.navigate("/offline", { replace: true, state: quietNavState() }));
    await act(() => router.navigate("/offline?view=month"));
    expect(reported().map((c) => [c[0], c[1]])).toEqual([["night", "2026-10-03"]]);
  });
});
