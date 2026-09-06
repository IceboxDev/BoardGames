import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckRow } from "./CheckRow";
import { OPTION_ROW_IDLE, OPTION_ROW_SELECTED } from "./option-row-chrome";

describe("CheckRow", () => {
  it("is a real labelled checkbox; clicking anywhere on the row toggles it", async () => {
    const onChange = vi.fn();
    render(<CheckRow checked={false} onChange={onChange} title="Catan" description="2017" />);
    const box = screen.getByRole("checkbox", { name: /Catan/ });
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByText("2017"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("draws the shared selected pair when checked and the idle chrome otherwise", () => {
    const { container, rerender } = render(<CheckRow checked onChange={() => {}} title="Catan" />);
    const row = () => container.firstChild as HTMLElement;
    for (const cls of OPTION_ROW_SELECTED.split(" ")) expect(row().className).toContain(cls);
    expect(screen.getByRole("checkbox")).toBeChecked();
    rerender(<CheckRow checked={false} onChange={() => {}} title="Catan" />);
    for (const cls of OPTION_ROW_IDLE.split(" ")) expect(row().className).toContain(cls);
  });

  it("renders the leading and trailing slots and a disabled state", () => {
    render(
      <CheckRow
        checked={false}
        disabled
        onChange={() => {}}
        title="Catan"
        leading={<img alt="" src="x.png" data-testid="thumb" />}
        trailing={<span>Expert</span>}
      />,
    );
    expect(screen.getByTestId("thumb")).toBeInTheDocument();
    expect(screen.getByText("Expert")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
