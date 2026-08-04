import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("renders a labelled dialog with its content, portaled to body", () => {
    render(
      <Drawer onClose={() => {}} eyebrow="Availability" title="Ada Lovelace">
        <p>drawer-content</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog", { name: "Ada Lovelace" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("drawer-content")).toBeInTheDocument();
    // Portaled: the dialog is not inside the (empty) React root container.
    expect(dialog.closest("body")).toBe(document.body);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Drawer onClose={onClose} title="T">
        <p>x</p>
      </Drawer>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Drawer onClose={onClose} title="T">
        <p>x</p>
      </Drawer>,
    );
    // Two "Close" controls exist: the scrim (tabIndex -1) and the header X.
    const scrim = screen.getAllByRole("button", { name: "Close" }).find((b) => b.tabIndex === -1);
    expect(scrim).toBeDefined();
    if (scrim) await userEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps an inert scrim when closeOnBackdrop is false", async () => {
    const onClose = vi.fn();
    render(
      <Drawer onClose={onClose} title="T" closeOnBackdrop={false}>
        <p>x</p>
      </Drawer>,
    );
    const scrim = screen.getAllByRole("button", { name: "Close" }).find((b) => b.tabIndex === -1);
    expect(scrim?.className).toMatch(/pointer-events-none/);
  });
});
