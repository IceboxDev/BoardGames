import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { Input } from "./Input";
import { RADIUS_UI_LG } from "./radii";
import { SegmentedControl } from "./SegmentedControl";
import { SelectableCard } from "./SelectableCard";

// The personalization theme hooks: primitives route their radii through the
// scale-factor classes in radii.ts (`--radius-ui-scale` / `--radius-card-scale`;
// unset ⇒ factor 1 ⇒ pixel-identical) and mark selected/active states with the
// stable `ui-selected` class that select-styles.css targets per
// data-select-style.

describe("radius theme hooks", () => {
  it("Avatar stays a circle — its shape is not themable", () => {
    render(<Avatar name="Ada Lovelace" />);
    const cls = screen.getByRole("img").className;
    expect(cls).toContain("rounded-full");
    expect(cls).not.toContain("--avatar-radius");
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

  // The overlay host is a `relative` UTILITY, never a `position` declaration in
  // the unlayered select-styles.css — there it outranked Tailwind and dragged
  // self-positioned controls back into flow under glow/border/fill/underline.
  // AvailabilityActionBar's pinned ADMIN / LOCK-IN chips are the real case:
  // their `sm:absolute` must survive alongside the marker.
  it("hosts the overlay with a utility a caller's own position can override", () => {
    render(
      <Chip pressed tone="amber" className="sm:absolute sm:right-3">
        Lock-in
      </Chip>,
    );
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("relative");
    expect(cls).toContain("sm:absolute");
  });
});
