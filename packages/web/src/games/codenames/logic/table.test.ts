import { personClueNote } from "@boardgames/core/games/codenames/notes";
import { buildPlayerView } from "@boardgames/core/games/codenames/player-view";
import { markAway } from "@boardgames/core/games/codenames/presence";
import { applyClue, applyGuess, askClue, createGame } from "@boardgames/core/games/codenames/rules";
import type { CodenamesState, KeyEntry } from "@boardgames/core/games/codenames/types";
import { describe, expect, it } from "vitest";
import { alertLabel, awayNotices, lastTurn, recentTouches, scoreOf, teamClues } from "./table";

function game(ai: (string | null)[] = [null, null, null, null]): CodenamesState {
  return createGame({ seed: 7, ai, language: "en", clueTimerSec: 0, guessTimerSec: 0 });
}

const cardsOf = (state: CodenamesState, entry: KeyEntry) =>
  state.key.flatMap((k, i) => (k === entry && !state.revealed[i] ? [i] : []));

/** One turn for the starter: a 2-clue aimed at two agents, one found, then a bystander. */
function playedOnce() {
  let s = game();
  const team = s.currentTeam;
  const [a, b] = cardsOf(s, team) as [number, number];
  s = applyClue(s, team, { word: "zqx", count: 2 }, personClueNote([a, b]));
  s = applyGuess(s, 2 + team, a);
  s = applyGuess(s, 2 + team, cardsOf(s, "bystander")[0] as number);
  return { s, team, a, b };
}

describe("teamClues", () => {
  it("lists the team's clues with what each found and, for its spymaster, still owes", () => {
    const { s, team, b } = playedOnce();
    const spymaster = teamClues(buildPlayerView(s, s.phase, team));
    expect(spymaster).toEqual([{ turn: 0, word: "zqx", count: 2, found: 1, pinned: 0, owed: [b] }]);
    // Operatives don't see what a clue meant.
    expect(teamClues(buildPlayerView(s, s.phase, 2 + team))[0]?.owed).toBeNull();
    // The other team has no clues yet; spectators none at all.
    expect(teamClues(buildPlayerView(s, s.phase, 3 - team))).toEqual([]);
    expect(teamClues(buildPlayerView(s, s.phase, -1))).toEqual([]);
  });
});

describe("the latest touches and the last turn", () => {
  it("numbers the last turn's touches until the next team touches a card", () => {
    const { s, team, a } = playedOnce();
    const recent = recentTouches(buildPlayerView(s, s.phase, 3 - team));
    expect(recent?.team).toBe(team);
    expect(recent?.live).toBe(false);
    expect(recent?.order.get(a)).toBe(1);
    expect(recent?.order.size).toBe(2);

    const next = applyClue(s, s.currentTeam, { word: "zqy", count: 1 });
    const theirs = cardsOf(next, next.currentTeam)[0] as number;
    const touched = applyGuess(next, 2 + next.currentTeam, theirs);
    const now = recentTouches(buildPlayerView(touched, touched.phase, team));
    expect(now?.team).toBe(next.currentTeam);
    expect([...(now?.order.keys() ?? [])]).toEqual([theirs]);
  });

  it("tells the last turn in one line", () => {
    const { s, team } = playedOnce();
    const last = lastTurn(buildPlayerView(s, s.phase, 3 - team));
    expect(last).toMatchObject({ team, clue: { word: "zqx", count: 2 }, end: "miss" });
    expect(last?.touches.map((t) => [t.own, t.result])).toEqual([
      [true, team],
      [false, "bystander"],
    ]);
  });
});

describe("score and alerts", () => {
  it("scores the starter out of nine and marks whose turn it is", () => {
    const s = game();
    const score = scoreOf(buildPlayerView(s, s.phase, 2));
    expect(score.map((t) => [t.team, t.left, t.total, t.active])).toEqual([
      [s.startingTeam, 9, 9, true],
      [1 - s.startingTeam, 8, 8, false],
    ]);
  });

  it("names what the game waits on this seat for", () => {
    const s = game();
    const team = s.currentTeam;
    expect(alertLabel(buildPlayerView(s, s.phase, team))).toBe("Your clue");
    expect(alertLabel(buildPlayerView(s, s.phase, 2 + team))).toBeNull();
    const word = s.words.find((w) => w.length >= 4) as string;
    const asked = askClue(s, team, { word: `${word}zq`, count: 1 }, null, 0);
    expect(alertLabel(buildPlayerView(asked, asked.phase, 1 - team))).toBe("Your ruling");
    const clued = applyClue(s, team, { word: "zqx", count: 1 });
    expect(alertLabel(buildPlayerView(clued, clued.phase, 2 + team))).toBe("Your guess");
  });
});

describe("awayNotices", () => {
  it("shows the people still here who dropped out, the one holding the table up first", () => {
    let s = game();
    const team = s.currentTeam;
    s = markAway(s, 2 + (1 - team), 100); // an operative of the other team
    s = markAway(s, team, 200); // the spymaster everyone waits on
    const notices = awayNotices(buildPlayerView(s, s.phase, 2 + team));
    expect(notices.map((n) => [n.seat, n.blocking])).toEqual([
      [team, true],
      [2 + (1 - team), false],
    ]);
    // Nobody is told about themselves; spectators can't hand seats over.
    expect(awayNotices(buildPlayerView(s, s.phase, team)).map((n) => n.seat)).not.toContain(team);
    expect(awayNotices(buildPlayerView(s, s.phase, -1))).toEqual([]);
  });
});
