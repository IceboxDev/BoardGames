import { fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, Input } from "../ui";
import { type StepHotkeys, useStepHotkeys } from "./useStepHotkeys";

function keys(patch: Partial<StepHotkeys> = {}): StepHotkeys {
  return { step: vi.fn(), first: vi.fn(), last: vi.fn(), escape: vi.fn(), ...patch };
}

const press = (key: string, target: Window | Element = window) =>
  fireEvent.keyDown(target, { key });

describe("useStepHotkeys", () => {
  it("steps, jumps to either end, and escapes", () => {
    const k = keys();
    renderHook(() => useStepHotkeys(k));
    press("ArrowLeft");
    expect(k.step).toHaveBeenLastCalledWith(-1);
    press("ArrowRight");
    expect(k.step).toHaveBeenLastCalledWith(1);
    press("Home");
    expect(k.first).toHaveBeenCalledOnce();
    press("End");
    expect(k.last).toHaveBeenCalledOnce();
    press("Escape");
    expect(k.escape).toHaveBeenCalledOnce();
  });

  it("keeps stepping from a focused button, but leaves fields and sliders alone", () => {
    const k = keys();
    renderHook(() => useStepHotkeys(k));
    const { getByRole } = render(
      <div>
        <Button>Move 3</Button>
        <Input aria-label="Search" />
        <div role="slider" aria-valuenow={0} tabIndex={0} aria-label="Graph" />
      </div>,
    );
    press("ArrowRight", getByRole("button"));
    expect(k.step).toHaveBeenCalledTimes(1);
    press("ArrowRight", getByRole("textbox"));
    press("ArrowRight", getByRole("slider"));
    expect(k.step).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", () => {
    const k = keys({ enabled: false });
    renderHook(() => useStepHotkeys(k));
    press("ArrowLeft");
    expect(k.step).not.toHaveBeenCalled();
  });
});
