import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/Button";
import { GameDialogPanel } from "./GameDialogPanel";

describe("GameDialogPanel", () => {
  it("renders title, subtitle and children inside the tinted panel", () => {
    const { container } = render(
      <GameDialogPanel tone="warning" title="🙏 Favor" subtitle="Choose a card to give.">
        <Button size="xs">Give</Button>
      </GameDialogPanel>,
    );
    expect(screen.getByText("🙏 Favor").className).toMatch(/text-amber-300/);
    expect(screen.getByText("Choose a card to give.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Give" })).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toMatch(/border-amber-700\/50/);
  });

  it("maps each tone to its hue", () => {
    const { container } = render(
      <>
        <GameDialogPanel tone="danger">a</GameDialogPanel>
        <GameDialogPanel tone="success">b</GameDialogPanel>
        <GameDialogPanel tone="interrupt">c</GameDialogPanel>
        <GameDialogPanel tone="arcane">d</GameDialogPanel>
      </>,
    );
    const classes = Array.from(container.children).map((c) => (c as HTMLElement).className);
    expect(classes[0]).toMatch(/bg-rose-950\/50/);
    expect(classes[1]).toMatch(/bg-emerald-950\/40/);
    expect(classes[2]).toMatch(/bg-yellow-950\/40/);
    expect(classes[3]).toMatch(/bg-purple-950\/40/);
  });

  it("uses roomier padding and centering only when asked", () => {
    const { container } = render(
      <GameDialogPanel tone="danger" center spacious>
        x
      </GameDialogPanel>,
    );
    const cls = (container.firstChild as HTMLElement).className;
    expect(cls).toMatch(/p-6/);
    expect(cls).toMatch(/text-center/);
  });
});
