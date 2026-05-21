import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip — pressed state", () => {
  it("renders as <button> with aria-pressed=true when pressed", () => {
    render(
      <Chip pressed onClick={() => {}}>
        Active
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  });

  it("aria-pressed=false when unpressed", () => {
    render(
      <Chip pressed={false} onClick={() => {}}>
        Active
      </Chip>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("active applies tone-specific background classes", () => {
    render(
      <Chip pressed tone="rose">
        X
      </Chip>,
    );
    expect(screen.getByRole("button").className).toMatch(/bg-rose-500/);
  });

  it("active 'outlined' applies the colored border class", () => {
    render(
      <Chip pressed variant="outlined" tone="emerald">
        X
      </Chip>,
    );
    expect(screen.getByRole("button").className).toMatch(/border-emerald/);
  });

  it("inactive uses the neutral fill", () => {
    render(<Chip pressed={false}>X</Chip>);
    expect(screen.getByRole("button").className).toMatch(/bg-surface-800/);
  });
});

describe("Chip — interaction", () => {
  it("fires onClick on click when not disabled", async () => {
    const onClick = vi.fn();
    render(
      <Chip pressed={false} onClick={onClick}>
        X
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Chip pressed={false} disabled onClick={onClick}>
        X
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip — asStatic", () => {
  it("renders as a status span (not a button)", () => {
    render(
      <Chip asStatic pressed aria-label="Locked">
        Locked
      </Chip>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
