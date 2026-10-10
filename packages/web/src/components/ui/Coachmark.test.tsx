import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Coachmark, placeBubble } from "./Coachmark";

// A first-use hint: placed below its control (above when there's no room),
// clamped to a phone screen, dismissed by "Got it" or by a tap elsewhere —
// and absent while its control isn't on screen.

const VIEWPORT = { width: 390, height: 800 };
const BUBBLE = { width: 280, height: 120 };

describe("placeBubble", () => {
  it("sits below the control, centred on it", () => {
    const p = placeBubble({ top: 100, left: 145, width: 100, height: 40 }, BUBBLE, VIEWPORT);
    expect(p).toMatchObject({ side: "below", top: 152, left: 55 });
  });

  it("goes above when there's no room below", () => {
    const p = placeBubble({ top: 700, left: 145, width: 100, height: 40 }, BUBBLE, VIEWPORT);
    expect(p.side).toBe("above");
    expect(p.top).toBe(700 - 12 - 120);
  });

  it("stays inside a 16px gutter at the screen edges, arrow still on the control", () => {
    const right = placeBubble({ top: 100, left: 350, width: 30, height: 30 }, BUBBLE, VIEWPORT);
    expect(right.left).toBe(390 - 16 - 280);
    expect(right.arrowLeft).toBeGreaterThan(200);
    const left = placeBubble({ top: 100, left: 0, width: 30, height: 30 }, BUBBLE, VIEWPORT);
    expect(left.left).toBe(16);
    expect(left.arrowLeft).toBe(20);
  });
});

function withTarget() {
  const el = document.createElement("button");
  el.dataset.tour = "demo";
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 50,
      width: 120,
      height: 40,
      right: 170,
      bottom: 140,
      x: 50,
      y: 100,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("Coachmark", () => {
  it("shows beside its control and dismisses on Got it", async () => {
    const el = withTarget();
    const onDismiss = vi.fn();
    render(
      <Coachmark target='[data-tour="demo"]' title="Start here" onDismiss={onDismiss}>
        Tap to begin.
      </Coachmark>,
    );
    expect(await screen.findByRole("dialog", { name: "Start here" })).toBeInTheDocument();
    expect(screen.getByText("Tap to begin.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it("dismisses on a tap anywhere else, the control included", async () => {
    const el = withTarget();
    const onDismiss = vi.fn();
    render(
      <Coachmark target='[data-tour="demo"]' onDismiss={onDismiss}>
        Hint
      </Coachmark>,
    );
    await screen.findByText("Hint");
    act(() => {
      el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalled();
    el.remove();
  });

  it("renders nothing while its control isn't there", () => {
    render(
      <Coachmark target='[data-tour="missing"]' onDismiss={() => {}}>
        Hint
      </Coachmark>,
    );
    expect(screen.queryByText("Hint")).not.toBeInTheDocument();
  });
});
