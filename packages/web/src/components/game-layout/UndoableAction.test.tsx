import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UndoableActionButton, usePendingAction } from "./UndoableAction";

function Harness({ onCommit, enabled = true }: { onCommit: () => void; enabled?: boolean }) {
  const action = usePendingAction({ onCommit, enabled, delayMs: 5000 });
  return <UndoableActionButton action={action} label="End turn" />;
}

describe("UndoableActionButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends only after the grace window", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(screen.getByRole("button", { name: /Undo · 5/ })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1250));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "End turn" })).toBeInTheDocument();
  });

  it("Undo and Esc cancel; Enter sends at once", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    act(() => vi.advanceTimersByTime(6000));
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => vi.advanceTimersByTime(6000));
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("drops a pending action when it stops being allowed", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    rerender(<Harness onCommit={onCommit} enabled={false} />);
    act(() => vi.advanceTimersByTime(6000));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
