import type { BuildingStatus } from "@boardgames/core/games/quiztopia/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { districtByIndex } from "../../bands";
import BuildingCard, { buildingAriaLabel } from "./BuildingCard";

const CINEMA = districtByIndex(3);

describe("BuildingCard", () => {
  it.each<[BuildingStatus, string, string]>([
    ["dark", "DARK", "dark"],
    ["bright", "LIT", "lit"],
    ["won", "WON", "won"],
    ["lost", "LOST", "lost"],
  ])("status %s carries the %s badge and a spoken label", (status, badge, word) => {
    render(<BuildingCard district={CINEMA} status={status} />);
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: `Cinema, district 04 Film & TV, ${word}` }),
    ).toBeInTheDocument();
  });

  it("is a pressed button when selectable", () => {
    const onSelect = vi.fn();
    render(
      <BuildingCard district={CINEMA} status="dark" selectable selected onSelect={onSelect} />,
    );
    const button = screen.getByRole("button", { name: /Cinema, district 04/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("names the building in German when asked", () => {
    expect(buildingAriaLabel(CINEMA, "bright", "de")).toBe(
      "Kino, district 04 Film & Fernsehen, lit",
    );
    render(<BuildingCard district={CINEMA} status="bright" lang="de" />);
    expect(screen.getByText("Kino")).toBeInTheDocument();
  });
});
