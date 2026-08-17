import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HexSkillChart } from "./HexSkillChart.tsx";

// Regression: the hover targets used to be small circles at the axis TIPS,
// so hovering an axis' value dot (which sits at value·RADIUS, well inside
// the hexagon for mid scores) showed nothing. The targets are now full-axis
// lanes from the center past the label.

const AXES = [
  { label: "Intelligence", value: 1, winChance: 64 },
  { label: "Planning", value: 0.89, winChance: 62 },
  { label: "Perception", value: 0.74, winChance: 56 },
  { label: "Sophistication", value: 0.81, winChance: 59 },
  { label: "Social", value: 0.62, winChance: 53 },
  { label: "Dexterity", value: 0, provisional: true },
];

function hitLanes(container: HTMLElement): SVGLineElement[] {
  return [...container.querySelectorAll<SVGLineElement>('line[stroke="transparent"]')];
}

describe("HexSkillChart hover", () => {
  it("renders one full-axis hover lane per axis", () => {
    const { container } = render(<HexSkillChart skill={{ axes: AXES }} />);
    expect(hitLanes(container)).toHaveLength(6);
  });

  it("shows the win-chance tooltip when hovering an axis lane (Perception)", () => {
    const { container } = render(<HexSkillChart skill={{ axes: AXES }} />);
    fireEvent.mouseEnter(hitLanes(container)[2]);
    // Label appears twice: the SVG axis label + the tooltip heading.
    expect(screen.getAllByText("Perception")).toHaveLength(2);
    expect(screen.getByText(/Score 74 of 100/)).toBeInTheDocument();
    expect(screen.getByText(/beats the average player 56% of the time/)).toBeInTheDocument();
    fireEvent.mouseLeave(hitLanes(container)[2]);
    expect(screen.queryByText(/beats the average player/)).not.toBeInTheDocument();
  });

  it("says a provisional axis needs more games instead of a number", () => {
    const { container } = render(<HexSkillChart skill={{ axes: AXES }} />);
    fireEvent.mouseEnter(hitLanes(container)[5]);
    expect(screen.getByText(/not rated yet — needs more games/)).toBeInTheDocument();
  });

  it("renders extra per-axis details in the tooltip when provided", () => {
    const details = AXES.map((axis, i) =>
      i === 0 ? <p key={axis.label}>1st in the group · sharpened by Chess</p> : null,
    );
    const { container } = render(<HexSkillChart skill={{ axes: AXES }} axisDetails={details} />);
    fireEvent.mouseEnter(hitLanes(container)[0]);
    expect(screen.getByText(/sharpened by Chess/)).toBeInTheDocument();
  });

  it("renders no lanes while the chart is the ghosted placeholder", () => {
    const { container } = render(<HexSkillChart skill={null} />);
    expect(hitLanes(container)).toHaveLength(0);
  });
});
