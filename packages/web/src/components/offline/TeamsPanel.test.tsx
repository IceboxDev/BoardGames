import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Attendee } from "../../lib/calendar-games";

const balance = vi.hoisted(() => vi.fn());
vi.mock("../../lib/skills", () => ({ balanceTeams: balance }));

const { TeamsPanel } = await import("./TeamsPanel");

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
const random = () => fireEvent.click(screen.getByRole("button", { name: /^random/i }));

describe("TeamsPanel", () => {
  afterEach(() => {
    window.localStorage.clear();
    balance.mockReset();
  });

  it("starts with confirmed people in and maybes out", () => {
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    expect(chip("Ana")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Eve")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("teams · 2 + 2")).toBeInTheDocument();
  });

  it("deals every pooled player into the teams, including a tapped-in maybe", () => {
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    random();
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
    random();
    fireEvent.click(screen.getByRole("button", { name: /shuffle teams/i }));
    unmount();
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    expect(cards()).toHaveLength(2);
    expect(screen.getByRole("button", { name: /reshuffle/i })).toBeInTheDocument();
  });

  it("balances for tonight's top pick and shows the odds", async () => {
    balance.mockResolvedValue({
      slug: "codenames",
      teams: [
        { userIds: ["ana", "dee"], chance: 0.51 },
        { userIds: ["ben", "cid"], chance: 0.49 },
      ],
      basis: { ana: "game", ben: "traits", cid: "unknown", dee: "game" },
    });
    render(
      <TeamsPanel date="2026-09-26" attendees={ROSTER} lineup={["codenames"]} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /balance teams/i }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(balance).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "codenames",
        teamCount: 2,
        userIds: ["ana", "ben", "cid", "dee"],
      }),
    );
    expect(screen.getByText("Dead even")).toBeInTheDocument();
    expect(screen.getAllByText("51%").length).toBeGreaterThan(0);
    expect(screen.getByText(/Ben hasn't played Codenames yet/)).toBeInTheDocument();
    expect(screen.getByText(/Cid has no rated games yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /another fair split/i })).toBeInTheDocument();
  });

  it("deals at random, and says so, when the ratings can't be reached", async () => {
    balance.mockRejectedValue(new Error("offline"));
    render(
      <TeamsPanel date="2026-09-26" attendees={ROSTER} lineup={["codenames"]} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /balance teams/i }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByText(/dealt at random instead/)).toBeInTheDocument();
    expect(screen.queryByText("Dead even")).toBeNull();
  });

  it("asks for a game before balancing when the night has no lineup", () => {
    render(<TeamsPanel date="2026-09-26" attendees={ROSTER} onBack={() => {}} />);
    expect(screen.getByText("Pick the game to balance for")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /balance teams/i })).toBeDisabled();
  });
});
