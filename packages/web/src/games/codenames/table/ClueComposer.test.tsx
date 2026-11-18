import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClueComposer } from "./ClueComposer";

function pressMore(times: number) {
  const more = screen.getByRole("button", { name: "More words" });
  for (let i = 0; i < times; i++) fireEvent.click(more);
  return more;
}

describe("ClueComposer", () => {
  it("steps past 9 to an ∞ clue (both games)", () => {
    const onSubmit = vi.fn();
    render(
      <ClueComposer faceDownWords={["APPLE"]} language="en" chosenWords={[]} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByLabelText("Clue word"), { target: { value: "orchard" } });
    const more = pressMore(12);
    expect((more as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("∞")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Give clue" }));
    expect(onSubmit).toHaveBeenCalledWith("orchard", "unlimited");
  });
});
