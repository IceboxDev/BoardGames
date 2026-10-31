import type { MatchOutcome } from "@boardgames/core/history/types";
import { describe, expect, it } from "vitest";
import { matchStandings } from "./standings";

const p = (name: string) => ({ userId: name.toLowerCase(), displayName: name });

describe("matchStandings — the phone summary and full standings", () => {
  it("leads a scored game with its winner and previews the next three", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("Aydan Guliyeva"), score: 47 },
        { ...p("Mantas Kandratavicius"), score: 60 },
        { ...p("Beatrice Alessandri"), score: 46 },
        { ...p("Maximilian Burg"), score: 45 },
        { ...p("Marianna Alessandri"), score: 43 },
      ],
    };
    const s = matchStandings(outcome, "7-wonders");
    expect(s.lead).toMatchObject({ kind: "players", value: "60" });
    expect(s.lead.kind === "players" && s.lead.rows.map((r) => r.name)).toEqual([
      "Mantas Kandratavicius",
    ]);
    expect(s.preview.map((e) => e.text)).toEqual(["AG 47", "BA 46", "MB 45"]);
    expect(s.more).toBe(1);
    expect(s.groups[0].rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5]);
  });

  it("follows a recorded rank over the score, and lowest-wins games", () => {
    const tied: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("Ann Lee"), score: 16, rank: 2 },
        { ...p("Bo Ray"), score: 16, rank: 1 },
      ],
    };
    const lead = matchStandings(tied, "dobble-connect").lead;
    expect(lead.kind === "players" && lead.rows.map((r) => r.name)).toEqual(["Bo Ray"]);

    const penalty: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("Ann Lee"), score: 45 },
        { ...p("Bo Ray"), score: 31 },
      ],
    };
    const low = matchStandings(penalty, "take-5").lead;
    expect(low.kind === "players" && low.rows[0].name).toBe("Bo Ray");
  });

  it("puts the winning team first, with roles and the losers as 'beat …'", () => {
    const outcome: MatchOutcome = {
      kind: "teams",
      teams: [
        {
          members: [
            { ...p("Jaqueline Binder"), role: "Spymaster" },
            { ...p("Riccardo Giordano"), role: "Operative" },
          ],
        },
        {
          members: [
            { ...p("Mantas Kandratavicius"), role: "Spymaster" },
            { ...p("Melanie Eghbalian"), role: "Operative" },
          ],
        },
      ],
      winnerTeamIndices: [1],
    };
    const s = matchStandings(outcome, "codenames");
    expect(s.groups.map((g) => g.label)).toEqual(["Won", "Lost"]);
    expect(s.groups[0].rows[0].notes).toEqual(["Spymaster"]);
    // The auto-filled "Operative" on everyone else is left out.
    expect(s.groups[0].rows[1].notes).toEqual([]);
    expect(s.previewLead).toBe("beat");
    expect(s.preview.map((e) => e.text)).toEqual(["JB", "RG"]);
  });

  it("shows a co-op's result as a badge, a scored one against its maximum", () => {
    const scored: MatchOutcome = {
      kind: "coop",
      participants: [p("Ann Lee"), p("Bo Ray")],
      score: 4,
      scenario: "Standard",
    };
    expect(matchStandings(scored, "just-one").lead).toEqual({
      kind: "badge",
      text: "4 / 13",
      tone: "amber",
    });
    const won: MatchOutcome = { kind: "coop", participants: [p("Ann Lee")], outcome: "win" };
    expect(matchStandings(won, "bomb-busters").lead).toMatchObject({
      text: "Won",
      tone: "emerald",
    });
  });

  it("orders last-standing survivors first, then the last one out", () => {
    const outcome: MatchOutcome = {
      kind: "last-standing",
      players: [
        { ...p("Ann Lee"), eliminationOrder: 0 },
        p("Bo Ray"),
        { ...p("Cy Dow"), eliminationOrder: 1 },
      ],
    };
    const s = matchStandings(outcome, "exploding-kittens");
    expect(s.groups[0].rows.map((r) => r.name)).toEqual(["Bo Ray", "Cy Dow", "Ann Lee"]);
    expect(s.groups[0].rows[0].notes).toEqual(["Survived"]);
    expect(s.previewLead).toBe("then");
  });

  it("calls a drawn duel a draw, with nobody crowned", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("Ann Lee"), score: 0 },
        { ...p("Bo Ray"), score: 0 },
      ],
      draw: true,
    };
    const s = matchStandings(outcome, "chess");
    expect(s.lead).toMatchObject({ kind: "badge", text: "Draw" });
    expect(s.groups[0].rows.every((r) => r.tone === "neutral")).toBe(true);
  });
});
