import { campaignProgress } from "@boardgames/core/games/codenames-duet/campaign/progress";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignMap } from "./CampaignMap";
import { missionDifficulty, missionRule, teamLine } from "./mission-copy";

describe("mission words", () => {
  it("says what a city's numbers mean (rulebook: an extra mistake costs two turns)", () => {
    expect(missionRule("prague")).toMatch(/every bystander is free/);
    expect(missionRule("paris")).toBe(
      "11 turns. No free mistakes: every bystander costs two turns.",
    );
    expect(missionRule("cairo")).toMatch(/^9 turns\. 5 free mistakes; after that/);
    expect(missionRule("tokyo")).toMatch(/1 free mistake;/);
  });

  it("rates the standard game easiest and the short, strict missions hardest", () => {
    expect(missionDifficulty("prague")).toBe(1);
    expect(missionDifficulty("vatican-city")).toBeGreaterThan(missionDifficulty("moscow"));
  });

  it("names the team", () => {
    const members = [{ userId: "u1", name: "Mantas", image: null }];
    expect(teamLine({ members, partnerKind: "ai", guestName: null })).toBe(
      "Mantas & the AI partner",
    );
    expect(teamLine({ members, partnerKind: "guest", guestName: "Ieva" })).toBe("Mantas & Ieva");
  });
});

describe("CampaignMap", () => {
  it("draws every city, and only the playable ones can be picked", () => {
    const onSelect = vi.fn();
    const progress = campaignProgress([{ city: "prague", won: true }]);
    render(<CampaignMap progress={progress} selected="berlin" onSelect={onSelect} />);
    const pickable = screen.getAllByRole("button");
    // Prague (cleared, replayable) + Berlin, Cairo, Moscow (open).
    expect(pickable).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /^Cairo, 9 turns, 5 free mistakes, open/ }));
    expect(onSelect).toHaveBeenCalledWith("cairo");
    expect(screen.getByRole("button", { name: /^Berlin.*chosen$/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /1 of 26 cities cleared/ })).toBeInTheDocument();
  });
});
