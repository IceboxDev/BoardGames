import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import {
  addTraveller,
  beginNight,
  createGame,
  dawn,
  giveBeggarToken,
  kill,
  removeTraveller,
  setButlerMaster,
  setNegativeVote,
  setTripleVote,
} from "./companion.ts";
import type { GameSetup } from "./setup.ts";
import { recordVote, tallyVotes, voteOrder, voterStatus } from "./voting.ts";

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];

function day(edition: "trouble-brewing" | "bad-moon-rising", chars: CharacterId[]) {
  const setup: GameSetup = {
    edition,
    seats: chars.map((character, seat) => ({ seat, name: NAMES[seat], character })),
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs:
      edition === "bad-moon-rising"
        ? ["innkeeper", "courtier", "gossip"]
        : ["chef", "slayer", "saint"],
  };
  return dawn(beginNight(createGame(setup)));
}

// seat 0 Imp, 1 Poisoner, 2 Butler, 3 Empath, 4 Monk, 5 Soldier, 6 Mayor
const tb = () =>
  day("trouble-brewing", ["imp", "poisoner", "butler", "empath", "monk", "soldier", "mayor"]);

describe("voteOrder", () => {
  it("runs clockwise from the nominee's left, nominee last, skipping players who left", () => {
    let s = tb();
    expect(voteOrder(s, 2)).toEqual([3, 4, 5, 6, 0, 1, 2]);
    expect(voteOrder(s, 6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    s = addTraveller(s, "Ivy", "beggar", "good");
    s = removeTraveller(s, 7);
    expect(voteOrder(s, 0)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("voterStatus", () => {
  it("the living count 1, the marked ×3 / −1, the dead only with a ghost vote", () => {
    let s = tb();
    expect(voterStatus(s, 3)).toEqual({ kind: "alive", weight: 1 });
    s = setTripleVote(s, 3);
    s = setNegativeVote(s, 4);
    expect(voterStatus(s, 3)).toEqual({ kind: "alive", weight: 3 });
    expect(voterStatus(s, 4)).toEqual({ kind: "alive", weight: -1 });
    s = kill(s, 5, "storyteller");
    expect(voterStatus(s, 5)).toEqual({ kind: "ghost", weight: 1 });
    s = recordVote(s, 0, 1, [5]);
    expect(voterStatus(s, 5)).toEqual({ kind: "no-vote", reason: "dead" });
  });

  it("the Butler needs their master; the Beggar needs a token", () => {
    let s = tb();
    s = setButlerMaster(s, 2, 3);
    expect(voterStatus(s, 2)).toEqual({ kind: "butler", weight: 1, master: 3 });
    expect(tallyVotes(s, [2]).total).toBe(0);
    expect(tallyVotes(s, [2, 3]).total).toBe(2);
    s = addTraveller(s, "Ivy", "beggar", "good");
    expect(voterStatus(s, 7)).toEqual({ kind: "no-vote", reason: "no-tokens" });
    s = kill(s, 6, "storyteller");
    s = giveBeggarToken(s, 6);
    expect(voterStatus(s, 7)).toEqual({ kind: "beggar", weight: 1, tokens: 1 });
    s = recordVote(s, 0, 1, [7]);
    expect(s.players[7].beggarTokens).toBe(0);
    expect(voterStatus(s, 7)).toEqual({ kind: "no-vote", reason: "no-tokens" });
    expect(s.log.at(-1)?.text).toBe("Vote tokens spent: Ivy (Beggar token).");
  });

  it("under the Voudon only the Voudon and the dead vote, and the dead spend nothing", () => {
    let s = day("bad-moon-rising", [
      "zombuul",
      "godfather",
      "sailor",
      "chambermaid",
      "innkeeper",
      "tea-lady",
      "fool",
      "gossip",
    ]);
    s = addTraveller(s, "Ivy", "voudon", "evil");
    s = kill(s, 2, "storyteller");
    expect(voterStatus(s, 3)).toEqual({ kind: "no-vote", reason: "voudon" });
    expect(voterStatus(s, 8)).toEqual({ kind: "alive", weight: 1 });
    expect(voterStatus(s, 2)).toEqual({ kind: "alive", weight: 1 });
    s = recordVote(s, 8, 1, [2, 8]);
    expect(s.players[2].ghostVote).toBe(true);
    expect(s.day.aboutToDie).toEqual({ seat: 1, votes: 2 });
  });
});

describe("recordVote", () => {
  it("books the nomination from the hands, keeps them, and spends ghost votes", () => {
    let s = tb();
    s = kill(s, 5, "storyteller");
    s = kill(s, 6, "storyteller"); // 5 alive → 3 needed
    s = recordVote(s, 0, 1, [2, 3, 5, 6]);
    expect(s.day.nominations[0]).toMatchObject({
      nominator: 0,
      nominee: 1,
      votes: 4,
      required: 3,
      result: "about-to-die",
      voters: [2, 3, 5, 6],
    });
    expect(s.players[5].ghostVote).toBe(false);
    expect(s.players[6].ghostVote).toBe(false);
    expect(s.log.map((l) => l.text).slice(-2)).toEqual([
      "Alice nominated Bob — 4/3 votes: about to die.",
      "Vote tokens spent: Finn (ghost vote), Gwen (ghost vote).",
    ]);
    // A later tie with the same tally clears about-to-die and spends nothing new.
    s = recordVote(s, 2, 3, [0, 1, 4, 2]);
    expect(s.day.nominations[1]).toMatchObject({ votes: 4, result: "tied" });
    expect(s.day.aboutToDie).toBeUndefined();
  });

  it("a Thief-marked hand subtracts", () => {
    let s = tb();
    s = setNegativeVote(s, 4);
    expect(tallyVotes(s, [2, 3, 4]).total).toBe(1);
    s = recordVote(s, 0, 1, [2, 3, 4]);
    expect(s.day.nominations[0]).toMatchObject({ votes: 1, result: "failed" });
  });
});
