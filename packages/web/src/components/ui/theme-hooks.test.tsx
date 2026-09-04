import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { Input } from "./Input";
import { AVATAR_RADIUS, RADIUS_UI_LG } from "./radii";
import { SegmentedControl } from "./SegmentedControl";
import { SelectableCard } from "./SelectableCard";

// The personalization theme hooks: primitives route their radii through the
// scale-factor classes in radii.ts (`--radius-ui-scale` / `--radius-card-scale`
// / `--avatar-radius`; unset ⇒ factor 1 / full round ⇒ pixel-identical) and
// mark selected/active states with the stable `ui-selected` class that
// select-styles.css targets per data-select-style.

describe("radius theme hooks", () => {
  it("Avatar routes its shape through --avatar-radius with a full-round fallback", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole("img").className).toContain(AVATAR_RADIUS);
  });

  it("Input routes its radius through the ui radius scale at its rounded-lg base", () => {
    render(<Input aria-label="name" />);
    expect(screen.getByRole("textbox").className).toContain(RADIUS_UI_LG);
  });
});

describe("ui-selected marker", () => {
  it("pressed Chip carries the marker + tone var; unpressed does not", () => {
    const { rerender } = render(
      <Chip pressed tone="rose">
        X
      </Chip>,
    );
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("ui-selected");
    expect(cls).toContain("[--ui-sel:var(--color-rose-400)]");
    rerender(<Chip pressed={false}>X</Chip>);
    expect(screen.getByRole("button").className).not.toContain("ui-selected");
  });

  it("asStatic status pills never carry the marker, even when pressed", () => {
    render(
      <Chip asStatic pressed aria-label="Locked">
        Locked
      </Chip>,
    );
    expect(screen.getByRole("status").className).not.toContain("ui-selected");
  });

  it("only the active SegmentedControl option carries the marker", () => {
    render(
      <SegmentedControl
        aria-label="view"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "A" }).className).toContain("ui-selected");
    expect(screen.getByRole("tab", { name: "B" }).className).not.toContain("ui-selected");
  });

  it("SelectableCard carries the marker only when selected", () => {
    const { rerender } = render(<SelectableCard title="Opt" selected onClick={() => {}} />);
    expect(screen.getByRole("button").className).toContain("ui-selected");
    rerender(<SelectableCard title="Opt" selected={false} onClick={() => {}} />);
    expect(screen.getByRole("button").className).not.toContain("ui-selected");
  });
});
