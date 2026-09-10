import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SensoForm } from "./SensoForm";

// The form's job beyond the pure rules: offer the Emperor only at a five-seat
// table, open the cube count exactly when points tie, and say who won and
// why — so a winner below the top score reads as the rule it is.

const USERS = ["Mantas", "Paul", "Juliane", "Lina", "Noah"].map((name, i) => ({
  id: `u${i + 1}`,
  name,
}));

function Harness({ seats }: { seats: number }) {
  const [value, setValue] = useState<MatchOutcomeFreeForAll>({
    kind: "free-for-all",
    players: USERS.slice(0, seats).map((u) => ({ userId: u.id, displayName: u.name, score: 0 })),
  });
  return <SensoForm users={USERS} value={value} onChange={setValue} />;
}

const points = (name: string) => screen.getByLabelText(`${name} — points`);
const chips = (label: string) => screen.queryAllByRole("button", { name: label });

describe("SensoForm", () => {
  it("offers the Emperor only once five seats are filled", () => {
    const { unmount } = render(<Harness seats={4} />);
    expect(chips("Takeda")).toHaveLength(4);
    expect(chips("Emperor")).toHaveLength(0);
    unmount();
    render(<Harness seats={5} />);
    expect(chips("Emperor")).toHaveLength(5);
  });

  it("opens the cube count on a points tie and crowns the Emperor when it survives", async () => {
    render(<Harness seats={5} />);
    const user = userEvent.setup();

    fireEvent.change(points("Mantas"), { target: { value: "12" } });
    fireEvent.change(points("Paul"), { target: { value: "12" } });
    fireEvent.change(points("Juliane"), { target: { value: "8" } });
    expect(screen.getByText("Tied at 12 points")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mantas — cubes on the map"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Paul — cubes on the map"), { target: { value: "4" } });
    // No Emperor seated yet: the tie is shared.
    expect(screen.getByTestId("senso-result")).toHaveTextContent("Shared: Mantas & Paul");

    await user.click(chips("Emperor")[2] as HTMLElement); // Juliane, on 8 points
    expect(screen.getByTestId("senso-result")).toHaveTextContent(
      "Winner: Juliane — the Emperor takes a tied throne",
    );
  });

  it("names a straight points win without a rung", () => {
    render(<Harness seats={2} />);
    fireEvent.change(points("Mantas"), { target: { value: "9" } });
    fireEvent.change(points("Paul"), { target: { value: "11" } });
    expect(screen.queryByText(/Tied at/)).not.toBeInTheDocument();
    expect(screen.getByTestId("senso-result")).toHaveTextContent("Winner: Paul");
    expect(screen.getByTestId("senso-result")).not.toHaveTextContent("—");
  });
});
