import type { PurchaseEvent } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchaseTimeline } from "./PurchaseTimeline";

const event = (overrides: Partial<PurchaseEvent> & { id: string }): PurchaseEvent => ({
  occurredOn: "2026-08-27",
  type: "campaign-update",
  title: `Event ${overrides.id}`,
  details: null,
  sourceUrl: null,
  ...overrides,
});

describe("PurchaseTimeline", () => {
  it("groups newest-first by month", () => {
    render(
      <PurchaseTimeline
        events={[
          event({ id: "e1", occurredOn: "2026-07-05" }),
          event({ id: "e2", occurredOn: "2026-08-14" }),
          event({ id: "e3", occurredOn: "2026-08-27" }),
        ]}
      />,
    );
    const headers = screen.getAllByText(/^(Jul|Aug) 2026$/).map((el) => el.textContent);
    expect(headers).toEqual(["Aug 2026", "Jul 2026"]);
    const titles = screen.getAllByText(/^Event e\d$/).map((el) => el.textContent);
    expect(titles).toEqual(["Event e3", "Event e2", "Event e1"]);
  });

  it("tones the icon bubble by event type and clamps details", () => {
    const { container } = render(
      <PurchaseTimeline
        events={[event({ id: "e1", type: "delay", details: "Container slot lost." })]}
      />,
    );
    expect(container.querySelector(".bg-amber-400\\/20")).not.toBeNull();
    expect(screen.getByText(/· Delay/)).toBeInTheDocument();
    expect(screen.getByText("Container slot lost.")).toBeInTheDocument();
  });

  it("links the source post only when one was recorded", () => {
    render(
      <PurchaseTimeline
        events={[
          event({ id: "e1", sourceUrl: "https://example.com/posts/1" }),
          event({ id: "e2", occurredOn: "2026-08-28" }),
        ]}
      />,
    );
    const links = screen.getAllByRole("link", { name: "Source ↗" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("rel", "noreferrer");
  });

  it("renders the empty state before any update lands", () => {
    render(<PurchaseTimeline events={[]} />);
    expect(screen.getByText("No updates yet")).toBeInTheDocument();
  });
});
