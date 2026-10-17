import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TreeView, type TreeViewNode } from "./TreeView";

const NODES: readonly TreeViewNode[] = [
  {
    id: "white",
    label: "White",
    children: [
      { id: "sicilian", label: "vs Sicilian", children: [{ id: "alapin", label: "Alapin" }] },
    ],
  },
  { id: "black", label: "Black", children: [] },
];

function Harness({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(["white"]));
  return (
    <TreeView
      aria-label="Folders"
      nodes={NODES}
      selectedId="white"
      onSelect={onSelect}
      expanded={open}
      onToggle={(id, o) =>
        setOpen((prev) => {
          const next = new Set(prev);
          if (o) next.add(id);
          else next.delete(id);
          return next;
        })
      }
    />
  );
}

describe("TreeView", () => {
  it("walks, opens, closes and selects with the tree keys", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const white = screen.getByRole("treeitem", { name: /White/ });
    expect(white.tabIndex).toBe(0);
    white.focus();
    fireEvent.keyDown(white, { key: "ArrowDown" });
    const sicilian = screen.getByRole("treeitem", { name: /vs Sicilian/ });
    expect(document.activeElement).toBe(sicilian);
    expect(screen.queryByRole("treeitem", { name: /Alapin/ })).toBeNull();
    fireEvent.keyDown(sicilian, { key: "ArrowRight" });
    expect(sicilian.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(sicilian, { key: "ArrowRight" });
    const alapin = screen.getByRole("treeitem", { name: /Alapin/ });
    expect(document.activeElement).toBe(alapin);
    fireEvent.keyDown(alapin, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("alapin");
    fireEvent.keyDown(alapin, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(sicilian);
    fireEvent.keyDown(sicilian, { key: "ArrowLeft" });
    expect(screen.queryByRole("treeitem", { name: /Alapin/ })).toBeNull();
    fireEvent.keyDown(sicilian, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: /Black/ }));
  });
});
