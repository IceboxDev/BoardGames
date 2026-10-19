import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ScoreInput } from "./ScoreInput";

function Harness({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ScoreInput aria-label="score" value={value} onValueChange={setValue} />
      <output>{value}</output>
    </>
  );
}

describe("ScoreInput", () => {
  it("shows 0 as an empty field, so typing isn't glued to a 0", () => {
    render(<Harness />);
    const input = screen.getByLabelText("score") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "42" } });
    expect(input.value).toBe("42");
    expect(screen.getByRole("status").textContent).toBe("42");
  });

  it("can be cleared completely", () => {
    render(<Harness initial={7} />);
    const input = screen.getByLabelText("score") as HTMLInputElement;
    expect(input.value).toBe("7");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("0");
  });
});
