import { fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../../components/ui";
import { type BoardHotkeys, useBoardHotkeys } from "./useBoardHotkeys";

function keys(patch: Partial<BoardHotkeys> = {}): BoardHotkeys {
  return {
    cols: 7,
    myTurn: true,
    drop: vi.fn(),
    pop: vi.fn(),
    hint: vi.fn(),
    toggleEval: vi.fn(),
    ...patch,
  };
}

const press = (key: string, target: Window | Element = window) =>
  fireEvent.keyDown(target, { key });

describe("useBoardHotkeys", () => {
  it("drops by number and by the picked column", () => {
    const k = keys();
    const { result } = renderHook(() => useBoardHotkeys(k));
    press("3");
    expect(k.drop).toHaveBeenLastCalledWith(2);
    press("ArrowRight"); // first arrow picks the centre
    expect(result.current).toBe(3);
    press("ArrowRight");
    press("Enter");
    expect(k.drop).toHaveBeenLastCalledWith(4);
    press("p");
    expect(k.pop).toHaveBeenLastCalledWith(4);
  });

  it("leaves Enter and Space to a focused button", () => {
    const k = keys();
    renderHook(() => useBoardHotkeys(k));
    press("ArrowLeft");
    const { getByRole } = render(<Button>Resign</Button>);
    const button = getByRole("button");
    const event = press("Enter", button);
    expect(k.drop).not.toHaveBeenCalled();
    expect(event).toBe(true); // not prevented: the button still activates
    press(" ", button);
    expect(k.drop).not.toHaveBeenCalled();
  });

  it("moves nothing off turn, and offers only the assists on hand", () => {
    const k = keys({ myTurn: false, hint: null, toggleEval: null });
    renderHook(() => useBoardHotkeys(k));
    press("4");
    press("ArrowLeft");
    press("Enter");
    expect(k.drop).not.toHaveBeenCalled();
    expect(press("h")).toBe(true);
    expect(press("e")).toBe(true);
  });
});
