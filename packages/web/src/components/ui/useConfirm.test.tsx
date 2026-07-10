import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useConfirm } from "./useConfirm";

type HarnessProps = { onOuterClose?: () => void; onResult?: (ok: boolean) => void };

/** Mirrors the real shape: a confirmation opened from inside an already-open dialog. */
function renderNested({ onOuterClose = () => {}, onResult = () => {} }: HarnessProps) {
  function NestedHarness() {
    const { confirm, confirmDialog } = useConfirm();
    return (
      <Modal onClose={onOuterClose} title="Outer dialog">
        <Button onClick={async () => onResult(await confirm({ title: "Remove Ada?" }))}>
          Remove
        </Button>
        {confirmDialog}
      </Modal>
    );
  }
  return render(<NestedHarness />);
}

const clickRemove = () => userEvent.click(screen.getByRole("button", { name: "Remove" }));

describe("useConfirm", () => {
  it("resolves true when confirmed", async () => {
    const onResult = vi.fn();
    renderNested({ onResult });
    await clickRemove();
    expect(screen.getByText("Remove Ada?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Remove Ada?")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    renderNested({ onResult });
    await clickRemove();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onResult).toHaveBeenCalledWith(false);
  });

  // Regression: both dialogs listen for Escape on `window`. Without the
  // topmost-only stack in dialog-a11y, one Escape dismissed the confirmation
  // AND closed the dialog behind it.
  it("Escape dismisses only the confirmation, not the dialog beneath it", async () => {
    const onOuterClose = vi.fn();
    const onResult = vi.fn();
    renderNested({ onOuterClose, onResult });
    await clickRemove();
    await userEvent.keyboard("{Escape}");
    expect(onResult).toHaveBeenCalledWith(false);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("Escape closes the underlying dialog once the confirmation is gone", async () => {
    const onOuterClose = vi.fn();
    renderNested({ onOuterClose });
    await clickRemove();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });
});
