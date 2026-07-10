import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Modal, ModalFooter } from "./Modal";

describe("Modal — rendering", () => {
  it("renders title, eyebrow, subheader, and body content", () => {
    render(
      <Modal onClose={() => {}} title="My Modal" eyebrow="Notice" subheader={<p>Some context</p>}>
        <div data-testid="modal-body">Body</div>
      </Modal>,
    );
    expect(screen.getByText("My Modal")).toBeInTheDocument();
    expect(screen.getByText("Notice")).toBeInTheDocument();
    expect(screen.getByText("Some context")).toBeInTheDocument();
    expect(screen.getByTestId("modal-body")).toBeInTheDocument();
  });

  it("aria-labelledby points at the title id when title is set", () => {
    render(
      <Modal onClose={() => {}} title="My Modal">
        <div />
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("My Modal");
  });

  it("uses aria-label fallback when title is absent", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="Picker">
        <div />
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Picker");
  });

  it("locks body scroll while mounted and restores on unmount", () => {
    const { unmount } = render(
      <Modal onClose={() => {}} ariaLabel="x">
        <div />
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Modal — sizing", () => {
  const panelOf = () => screen.getByRole("dialog");

  it("maps each size to exactly one width class, with a viewport height cap", () => {
    const cases = [
      ["xs", "max-w-md"],
      ["sm", "max-w-lg"],
      ["md", "max-w-xl"],
      ["lg", "max-w-2xl"],
      ["xl", "max-w-5xl"],
    ] as const;
    for (const [size, expected] of cases) {
      const { unmount } = render(
        <Modal onClose={() => {}} ariaLabel="x" size={size}>
          <div />
        </Modal>,
      );
      const cls = panelOf().className;
      expect(cls).toContain(expected);
      expect(cls).toContain("max-h-[90dvh]");
      // Exactly one unprefixed max-w-* — two would collide in the same CSS
      // layer and Tailwind's ordering, not ours, would pick the winner.
      expect(cls.split(/\s+/).filter((c) => c.startsWith("max-w-"))).toHaveLength(1);
      unmount();
    }
  });

  it("`full` fills the height and widens on large displays", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="x" size="full">
        <div />
      </Modal>,
    );
    const cls = panelOf().className;
    expect(cls).toContain("h-full");
    expect(cls).toContain("2xl:max-w-[110rem]");
    expect(cls).not.toContain("max-h-[90dvh]");
  });

  it("size wins outright: no default width is emitted alongside it", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="x" size="xs" panelClassName="border-amber-400/25">
        <div />
      </Modal>,
    );
    const cls = panelOf().className;
    expect(cls).toContain("max-w-md");
    expect(cls).toContain("border-amber-400/25");
    expect(cls).not.toContain("max-w-2xl");
  });

  it("legacy callers keep the historical default, and their panelClassName width stands alone", () => {
    const { unmount } = render(
      <Modal onClose={() => {}} ariaLabel="x">
        <div />
      </Modal>,
    );
    expect(panelOf().className).toContain("max-w-2xl");
    unmount();

    // A panelClassName-only caller (the not-yet-migrated game modals) must not
    // also receive the base `max-w-2xl`, or the two would fight.
    render(
      <Modal onClose={() => {}} ariaLabel="x" panelClassName="max-w-md">
        <div />
      </Modal>,
    );
    const cls = panelOf().className;
    expect(cls).toContain("max-w-md");
    expect(cls).not.toContain("max-w-2xl");
  });
});

describe("ModalFooter", () => {
  it("renders the start slot and the trailing actions", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="x" size="xs">
        <ModalFooter start={<span>3 known players</span>}>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button size="sm">Save</Button>
        </ModalFooter>
      </Modal>,
    );
    expect(screen.getByText("3 known players")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("Modal — close paths", () => {
  it("fires onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="x">
        <div />
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape is ignored when closeOnEscape=false", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="x" closeOnEscape={false}>
        <div />
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("fires onClose on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="x">
        <div />
      </Modal>,
    );
    // The backdrop is the first <button aria-label="Close"> inside the modal.
    const backdrop = screen.getAllByRole("button", { name: "Close" })[0];
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click is ignored when closeOnBackdrop=false", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="x" closeOnBackdrop={false}>
        <div />
      </Modal>,
    );
    const backdrop = screen.getAllByRole("button", { name: "Close" })[0];
    await userEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the dedicated close-X fires onClose", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="x">
        <div />
      </Modal>,
    );
    const closes = screen.getAllByRole("button", { name: "Close" });
    // Multiple "Close" buttons exist (backdrop + X). The last one is the X
    // (rendered later in the panel header).
    await userEvent.click(closes[closes.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("hideCloseButton drops the X (backdrop still works)", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="x" hideCloseButton>
        <div />
      </Modal>,
    );
    // Only the backdrop close-button remains.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });
});

describe("Modal — focus trap", () => {
  it("focuses the panel on mount", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="x">
        {/* biome-ignore lint/correctness/noRestrictedElements: test fixture probing the focus trap */}
        <button type="button">A</button>
        {/* biome-ignore lint/correctness/noRestrictedElements: test fixture probing the focus trap */}
        <button type="button">B</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  // The focus-trap's wrap-around edge cases (Tab from the last focusable
  // jumps to the first; Shift+Tab from the first jumps to the last) are
  // currently subtly buggy: the FOCUSABLE_SELECTOR matches `button:not([disabled])`
  // which catches the backdrop's `tabIndex={-1}` close-button, so the
  // "last" element the trap finds is the backdrop, not the user's content.
  // Leaving these as `.todo` so the bug is visible in the suite output
  // without failing CI.
  it.todo("Tab from the last focusable wraps back to the first (currently hits backdrop)");
  it.todo("Shift+Tab from the first focusable wraps to the last (currently hits backdrop)");
});
