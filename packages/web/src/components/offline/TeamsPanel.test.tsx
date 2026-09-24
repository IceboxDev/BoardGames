import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Attendee } from "../../lib/calendar-games";
import { TeamsPanel } from "./TeamsPanel";

const person = (name: string, over: Partial<Attendee> = {}): Attendee => ({
  userId: name.toLowerCase(),
  name,
  isHost: false,
  isAdmin: false,
  status: "definite",
  hasRsvped: true,
  isGuest: false,
  votes: { hype: 0, teach: 0, learn: 0 },
  bringing: [],
  seat: null,
  ...over,
});

const ROSTER = [
  person("Ana"),
  person("Ben"),
  person("Cid"),
  person("Dee"),
  person("Eve", { status: "tentative" }),
];

const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const cards = () => screen.queryAllByTestId("team-card");

describe("TeamsPanel", () => {
  afterEach(() => window.localStorage.clear());

  it("starts with confirmed people in and maybes out", () => {
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    expect(chip("Ana")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Eve")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("teams · 2 + 2")).toBeInTheDocument();
  });

  it("deals every pooled player into the teams, including a tapped-in maybe", () => {
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    fireEvent.click(chip("Eve"));
    fireEvent.click(screen.getByRole("button", { name: /shuffle teams/i }));
    expect(cards()).toHaveLength(2);
    const names = cards().flatMap((c) =>
      ["Ana", "Ben", "Cid", "Dee", "Eve"].filter((n) => within(c).queryAllByText(n).length > 0),
    );
    expect(names.sort()).toEqual(["Ana", "Ben", "Cid", "Dee", "Eve"]);
  });

  it("clamps the team count when the pool shrinks", () => {
    const eight = ["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8"].map((n) => person(n));
    render(<TeamsPanel date="2026-09-26" attendees={eight} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /increase teams/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase teams/i }));
    expect(screen.getByText("teams · 2 + 2 + 2 + 2")).toBeInTheDocument();
    for (const n of ["A1", "B2", "C3"]) fireEvent.click(chip(n));
    expect(screen.getByText("teams · 3 + 2")).toBeInTheDocument();
  });

  it("restores the saved split on remount", () => {
    const { unmount } = render(
      <TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /shuffle teams/i }));
    unmount();
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    expect(cards()).toHaveLength(2);
    expect(screen.getByRole("button", { name: /reshuffle/i })).toBeInTheDocument();
  });
});
