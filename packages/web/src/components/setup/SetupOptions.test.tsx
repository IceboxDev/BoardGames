import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/Button";
import { packSpans, SetupOptions } from "./SetupOptions";

describe("packSpans", () => {
  it("fills every 12-column row: the last option of a row takes what is left", () => {
    // A third + three quarters = 13 → the fourth option starts a new row.
    expect(packSpans(["m", "s", "s", "s"])).toEqual([4, 3, 5, 12]);
    // Chess: play as (s) + time (l) + takebacks (s) = exactly one row.
    expect(packSpans(["s", "l", "s"])).toEqual([3, 6, 3]);
    // One lonely option spans the row.
    expect(packSpans(["s"])).toEqual([12]);
    // A full-width option after a short row closes that row first.
    expect(packSpans(["s", "s", "full"])).toEqual([3, 9, 12]);
    expect(packSpans([])).toEqual([]);
  });

  it("never leaves a row short of 12", () => {
    const rows = (spans: number[]) => {
      const out: number[] = [];
      let sum = 0;
      for (const s of spans) {
        sum += s;
        if (sum === 12) {
          out.push(sum);
          sum = 0;
        }
      }
      return { out, left: sum };
    };
    for (const input of [
      ["s", "m", "l", "s", "full", "m"],
      ["l", "l", "l"],
      ["m", "m", "m", "m", "s"],
    ] as const) {
      expect(rows(packSpans(input)).left).toBe(0);
    }
  });
});

describe("SetupOptions", () => {
  it("renders each option's label, control and note, and dims a disabled one", () => {
    render(
      <SetupOptions
        options={[
          { id: "mode", label: "Mode", control: <Button>Elder</Button> },
          {
            id: "safe",
            label: "Beginners",
            disabled: true,
            note: "Rookie's Mountains are always safe.",
            control: <Button disabled>Safe</Button>,
          },
        ]}
      />,
    );
    expect(screen.getByText("Mode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elder" })).toBeTruthy();
    expect(screen.getByText("Rookie's Mountains are always safe.")).toBeTruthy();
    expect(screen.getByText("Beginners").parentElement?.className).toContain("opacity-60");
  });

  it("renders nothing without options", () => {
    const { container } = render(<SetupOptions options={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
