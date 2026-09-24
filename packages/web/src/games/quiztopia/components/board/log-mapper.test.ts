import { buildPlayerView } from "@boardgames/core/games/quiztopia/player-view";
import {
  answer,
  buildingWith,
  newGame,
  play,
  withHelpDeck,
} from "@boardgames/core/games/quiztopia/test-helpers";
import { describe, expect, it } from "vitest";
import { districtByIndex } from "../../bands";
import { mapQuiztopiaLog, verdictLine } from "./log-mapper";

const NAMES = ["Mantas", "Anna", "Lena"];

function lines(blocks: ReturnType<typeof mapQuiztopiaLog>): string[] {
  return blocks.flatMap((b) =>
    b.actions.map(
      (a) =>
        `${a.icon} ${a.spans.map((s) => (typeof s === "string" ? s : "text" in s ? s.text : s.card)).join("")}`,
    ),
  );
}

describe("mapQuiztopiaLog", () => {
  it("narrates picks, readers, verdicts and a Besetzung, one block per turn", () => {
    let gs = withHelpDeck(newGame({ playerCount: 3, seed: 1 }), [
      "besetzung",
      "streik",
      "datenleak",
      "insidertipp",
      "benefizvorstellung",
      "alternative-fakten",
    ]);
    const wonIndex = buildingWith(gs, "bright");
    gs = answer(gs, true, wonIndex); // turn 1, Mantas — bright → won
    const lostIndex = buildingWith(gs, "dark");
    gs = answer(gs, false, lostIndex); // turn 2, Anna — dark → lost
    // Turn 3, Lena's pick: anyone plays Besetzung on the lost building.
    gs = play(gs, 0, { kind: "play-help", helpId: "besetzung", buildingIndex: lostIndex });

    const blocks = mapQuiztopiaLog(buildPlayerView(gs, 0), NAMES);
    expect(blocks[0]?.label).toBe("Setup");
    expect(blocks.map((b) => b.label)).toEqual([
      "Setup",
      "Turn 1 · Mantas",
      "Turn 2 · Anna",
      "Turn 3 · Lena",
    ]);

    const won = districtByIndex(wonIndex).buildingLabel;
    const lost = districtByIndex(lostIndex).buildingLabel;
    const text = lines(blocks);
    expect(text).toContain(`▣ Mantas picked ${won}`);
    expect(text).toContain("📖 Lena reads");
    expect(text).toContain(`✓ Correct — ${won} won`);
    expect(text).toContain(`▣ Anna picked ${lost}`);
    expect(text).toContain(`✗ Wrong — ${lost} lost`);
    expect(text).toContain("✦ Occupation — a lost building returns to the middle");
    // The live turn has no verdict yet and never a reveal line before the reveal.
    expect(text.filter((l) => l.includes("Answer revealed"))).toHaveLength(0);
  });

  it("names buildings in German and marks the reveal on the live turn", () => {
    let gs = newGame({ playerCount: 2, seed: 3 });
    const i = buildingWith(gs, "dark");
    gs = play(gs, 0, { kind: "choose-building", buildingIndex: i });
    gs = play(gs, 0, { kind: "reveal" });
    const text = lines(mapQuiztopiaLog(buildPlayerView(gs, 1), NAMES, "de"));
    expect(text).toContain(`▣ Mantas picked ${districtByIndex(i).buildingLabelDe}`);
    expect(text).toContain("👁 Answer revealed — judging");
  });

  it("closes with the outcome", () => {
    let gs = newGame({ playerCount: 1, seed: 5, difficulty: 0 });
    // Wrong on a dark building loses it; wrong on a lit one only darkens it.
    while (gs.outcome === null && gs.phase !== "loss-pending") {
      const target = gs.buildings.includes("dark")
        ? buildingWith(gs, "dark")
        : buildingWith(gs, "bright");
      gs = answer(gs, false, target);
    }
    // Solo at Normal: five lost ends it unless Besetzung is face-up.
    if (gs.outcome === null) gs = play(gs, 0, { kind: "accept-loss" });
    const blocks = mapQuiztopiaLog(buildPlayerView(gs, 0), ["Mantas"]);
    expect(blocks.at(-1)?.label).toBe("Game over");
    expect(lines(blocks).at(-1)).toMatch(/Quiztopia went dark — 5 buildings lost/);
  });
});

describe("verdictLine", () => {
  it("describes every transition", () => {
    const cinema = 3;
    expect(
      verdictLine(
        { correct: true, shielded: false, buildingAfter: "bright", categoryIndex: cinema },
        "en",
      ).text,
    ).toBe("Correct — Cinema lit up");
    expect(
      verdictLine(
        { correct: false, shielded: false, buildingAfter: "dark", categoryIndex: cinema },
        "en",
      ).text,
    ).toBe("Wrong — Cinema went dark");
    expect(
      verdictLine(
        { correct: false, shielded: true, buildingAfter: "dark", categoryIndex: cinema },
        "en",
      ),
    ).toMatchObject({ variant: "warning", text: "Wrong — Strike held, Cinema unchanged" });
    expect(
      verdictLine(
        { correct: null, shielded: false, buildingAfter: "dark", categoryIndex: cinema },
        "en",
      ),
    ).toMatchObject({ icon: "↻", variant: "special" });
  });
});
