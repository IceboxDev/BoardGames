import { personClueNote } from "@boardgames/core/games/codenames/notes";
import { buildDuetView } from "@boardgames/core/games/codenames-duet/player-view";
import { markAway } from "@boardgames/core/games/codenames-duet/presence";
import {
  applyClue,
  applyGuess,
  createDuet,
  partnerOf,
} from "@boardgames/core/games/codenames-duet/rules";
import type { DuetState, Side } from "@boardgames/core/games/codenames-duet/types";
import { describe, expect, it } from "vitest";
import {
  buildDuetReview,
  duetAwayNotices,
  duetDetail,
  duetGridCards,
  duetLastTurn,
  duetStripClues,
} from "./logic";

function game(): DuetState {
  return createDuet({
    seed: 11,
    ai: [null, null],
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
}

const agentsOn = (s: DuetState, side: Side) =>
  s.key.flatMap((pair, i) => (pair[side] === "agent" && !s.found[i] ? [i] : []));
const bystanderOn = (s: DuetState, side: Side) =>
  s.key.findIndex((pair, i) => pair[side] === "bystander" && !s.found[i]);

/** One turn: a 2-clue aimed at two agents, one found, then a bystander ends it. */
function playedOnce() {
  let s = game();
  const giver = s.giver;
  const [a, b] = agentsOn(s, giver) as [number, number];
  s = applyClue(s, giver, { word: "zqx", count: 2 }, personClueNote([a, b]));
  s = applyGuess(s, partnerOf(giver), a);
  s = applyGuess(s, partnerOf(giver), bystanderOn(s, giver));
  return { s, giver, a, b };
}

const NO_CTX = { showKey: true, chosen: [], choosable: () => false, owed: new Set<number>() };

describe("duet table logic", () => {
  it("lists the viewer's own clues with what each still owes", () => {
    const { s, giver, b } = playedOnce();
    const mine = duetStripClues(buildDuetView(s, s.phase, giver));
    expect(mine).toEqual([{ turn: 0, word: "zqx", count: 2, found: 1, pinned: 0, owed: [b] }]);
    // The partner's view has no clue of its own yet; a spectator none at all.
    expect(duetStripClues(buildDuetView(s, s.phase, partnerOf(giver)))).toEqual([]);
    expect(duetStripClues(buildDuetView(s, s.phase, -1))).toEqual([]);
  });

  it("numbers the latest touches on the live board, as the review's board does", () => {
    const { s, giver, a } = playedOnce();
    const view = buildDuetView(s, s.phase, giver);
    const live = duetGridCards(view, NO_CTX);
    expect(live[a]).toMatchObject({ touch: 1, touchTone: "green", cover: "green" });
    expect(live.filter((c) => c.touch !== undefined)).toHaveLength(2);

    const review = buildDuetReview({
      words: s.words,
      key: s.key,
      turns: view.turns,
      tokensTotal: s.tokensTotal,
      tiers: [null, null],
      names: [null, null],
    });
    const board = review.boardAt(0);
    live.forEach((card, i) => {
      expect(card.touch).toBe(board[i]?.touch);
    });
  });

  it("outlines an opened clue's leftovers", () => {
    const { s, giver, b } = playedOnce();
    const cards = duetGridCards(buildDuetView(s, s.phase, giver), {
      ...NO_CTX,
      owed: new Set([b]),
    });
    expect(cards[b]?.owed).toBe(true);
    expect(cards.filter((c) => c.owed)).toHaveLength(1);
  });

  it("tells the last turn in one line", () => {
    const { s, giver } = playedOnce();
    const last = duetLastTurn(buildDuetView(s, s.phase, giver), ["Ann", "Bo"]);
    expect(last).toMatchObject({ who: giver === 0 ? "Ann" : "Bo", tone: "green" });
    expect(last?.clue).toEqual({ word: "zqx", count: 2 });
    expect(last?.touches.map((t) => t.mark)).toEqual(["own", "bystander"]);
  });

  it("offers the partner's seat to the AI, marked blocking when the game waits on them", () => {
    const s = markAway(game(), game().giver, 100);
    const partner = partnerOf(s.giver);
    const notices = duetAwayNotices(buildDuetView(s, s.phase, partner));
    expect(notices).toEqual([
      { seat: s.giver, since: 100, handoverAt: 100 + 45_000, blocking: true },
    ]);
    // Nobody is told about themselves; spectators can't hand seats over.
    expect(duetAwayNotices(buildDuetView(s, s.phase, s.giver))).toEqual([]);
    expect(duetAwayNotices(buildDuetView(s, s.phase, -1))).toEqual([]);
  });

  it("writes one result line for the game-over screen and the replay", () => {
    const result = { won: false, reason: "assassin", agentsFound: 9, tokensLeft: 1 } as const;
    expect(duetDetail(result)).toBe("An assassin was contacted · 9 / 15 agents · 1 turn to spare");
    expect(duetDetail(result, "Paris failed")).toMatch(/^Paris failed · An assassin/);
  });
});
