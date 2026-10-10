import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoundToggle } from "./SoundToggle";

describe("SoundToggle", () => {
  it("names what a press does and reports the press", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<SoundToggle muted={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn sounds off" }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<SoundToggle muted onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Turn sounds on" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
