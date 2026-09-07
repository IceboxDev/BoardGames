import { setupBoard } from "@boardgames/core/games/senso-battle-for-japan/board";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SensoMap from "./SensoMap";

const view = {
  board: setupBoard(),
  affected: [{ region: 4, by: 1 }],
  players: [],
};

afterEach(() => vi.restoreAllMocks());

describe("SensoMap", () => {
  it("renders one focusable target per legal spec and fires onTarget on click and Enter", () => {
    const onTarget = vi.fn();
    render(
      <SensoMap
        view={view}
        orientation="landscape"
        onTarget={onTarget}
        targets={[
          { id: "det:3", kind: "place", region: 3, label: "Reinforce region 4" },
          { id: "agg:0:0", kind: "strike", region: 0, square: 0, label: "Strike region 1" },
        ]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Reinforce region 4" }));
    expect(onTarget).toHaveBeenLastCalledWith("det:3");
    fireEvent.keyDown(screen.getByRole("button", { name: "Strike region 1" }), { key: "Enter" });
    expect(onTarget).toHaveBeenLastCalledWith("agg:0:0");
  });

  it("draws the thirteen setup cubes and marks the affected region", () => {
    const { container } = render(
      <SensoMap view={view} orientation="landscape" affectedLabel={(seat) => `seat ${seat}`} />,
    );
    expect(container.querySelectorAll('rect[width="38"]')).toHaveLength(13);
    expect(container.querySelector("title")?.textContent).toContain("affected by seat 1");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("switches the frozen viewBox with the orientation", () => {
    const { container, rerender } = render(<SensoMap view={view} orientation="landscape" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 790 500");
    rerender(<SensoMap view={view} orientation="portrait" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 600 900");
  });
});
