import { describe, expect, it } from "vitest";
import { turnOrder } from "./game-engine";
import { getActivePlayer } from "./rules";
import { act, afterSetup, emptyTrack, legal, rigTurn } from "./test-helpers";

const base = afterSetup(2, 7);

describe("rulebook examples", () => {
  it("Richard: a 1-Speed pile of Bernard + Ivo in the Forest scores 3 + 2 + 4 = 9", () => {
    const track = emptyTrack();
    track[0][0] = ["bernard#0", "ivo#0", "vampire-speed-2#x"];
    let s = rigTurn(base, 0, {
      hand: ["vampire-speed-2#0-0", "vampiric-will#0", "vampire-thirst#0-0"],
      pos: "road-8",
      track,
    });
    expect(s.current?.step).toBe("manipulate");
    s = act(s, { type: "end-manipulation" });
    // Vampire Speed 2 + Vampiric Will 1 + Thirst 1 = 4. Stay in the Forest.
    expect(s.current?.speed).toBe(4);
    s = act(s, { type: "stay" });
    const vpBefore = s.players[0].vp;
    s = act(s, { type: "hunt", row: 0, col: 0 });
    expect(s.players[0].vp - vpBefore).toBe(9);
    // All remaining Speed is lost after the (only) Hunt.
    expect(s.current?.speedLeft).toBe(0);
    expect(s.players[0].discard).toContain("bernard#0");
  });

  it("Koni: Thirst (3 with a Human) + The Hunger (2) = 5; two 3-VP Humans on the Plains = 10", () => {
    const track = emptyTrack();
    track[1][0] = ["mary#0", "cotton#0"];
    let s = rigTurn(base, 0, {
      hand: ["vampire-thirst#0-0", "s-the-hunger#0-0", "o-nel#0"],
      pos: "road-3",
      track,
    });
    // No discard/draw effect: step 1 is skipped.
    expect(s.current?.step).toBe("move");
    // Thirst 3 + The Hunger 2 + Peasant 0.
    expect(s.current?.speed).toBe(5);
    s = act(s, { type: "move", to: "road-5", spent: 2 });
    const vpBefore = s.players[0].vp;
    s = act(s, { type: "hunt", row: 1, col: 0 });
    // 3 + 3 printed, +1 each on the Plains, +1 each from The Hunger.
    expect(s.players[0].vp - vpBefore).toBe(10);
  });

  it("Theresa discarded by Vampiric Will before resolving does not Confuse", () => {
    let s = rigTurn(base, 0, {
      hand: ["s-vampire-strength#0-0", "vampiric-will#0", "theresa#0"],
      pos: "road-4",
    });
    s = act(s, { type: "resolve", card: "s-vampire-strength#0-0" });
    s = act(s, { type: "resolve", card: "vampiric-will#0", discard: "theresa#0" });
    expect(s.players[0].discard).toContain("theresa#0");
    if (s.current?.step === "manipulate") s = act(s, { type: "end-manipulation" });
    expect(s.players[0].pos).toBe("road-4");
    expect(s.current?.confused).toBe(false);
  });

  it("orders by region, then path, then closeness to the Labyrinth", () => {
    const s = structuredClone(afterSetup(4, 3));
    s.players[0].pos = "rail-3"; // Plains, rail
    s.players[1].pos = "rail-8"; // Forest, rail
    s.players[2].pos = "rail-5"; // Plains, rail, closer to the Labyrinth
    s.players[3].pos = "road-8"; // Forest, road
    expect(turnOrder(s, [0, 1, 2, 3])).toEqual([3, 1, 2, 0]);
  });
});

describe("speed and movement", () => {
  it("Speed 0 or less: no move and no space effect", () => {
    let s = rigTurn(base, 0, {
      hand: ["diego#0", "wadsworth#0", "nemes#0"],
      pos: "road-4",
    });
    expect(s.current?.speed).toBeLessThanOrEqual(0);
    expect(s.current?.step).toBe("act");
    expect(legal(s).map((a) => a.type)).toEqual(["end-turn"]);
    s = act(s, { type: "end-turn" });
    expect(s.players[0].pos).toBe("road-4");
  });

  it("Confuse moves 4 spaces toward the Labyrinth, without pushing or triggering", () => {
    const s = rigTurn(base, 0, {
      hand: ["bippo#0", "vampiric-speed-3#0", "vampire-speed-2#0-0"],
      pos: "road-1",
    });
    expect(s.players[0].pos).toBe("road-5");
    expect(s.current?.confused).toBe(true);
  });

  it("Spicy forces the move to the nearest Well and stops there", () => {
    const s = rigTurn(base, 0, {
      hand: ["bernard#0", "vampiric-speed-3#0", "vampire-speed-2#0-0"],
      pos: "road-3",
    });
    const moves = legal(s);
    // Speed 4; nearest Well road-1 is 2 away (rail-3 and road-6 are 3).
    expect(moves).toEqual([{ type: "move", to: "road-1", spent: 2 }]);
  });

  it("a Spicy card is carried until its Well is reached", () => {
    let s = rigTurn(base, 0, {
      hand: ["bernard#0", "o-nel#0", "vampire-thirst#0-0"],
      pos: "road-4",
    });
    // Speed 3 (Thirst with a Human) - 1 (Bernard) = 2; nearest Well road-6 is 2 away.
    s = act(s, legal(s)[0]);
    expect(s.players[0].pos).toBe("road-6");
    s = act(s, { type: "end-turn" });
    expect(s.players[0].playArea.some((c) => c.id === "bernard#0")).toBe(false);

    let t = rigTurn(base, 0, {
      hand: ["bernard#0", "o-nel#0", "mindy#0"],
      pos: "road-9",
    });
    // Speed -1: cannot reach a Well, Bernard stays in the playing area.
    t = act(t, { type: "end-turn" });
    expect(t.players[0].playArea.find((c) => c.id === "bernard#0")?.carried).toBe(true);
  });

  it("returning to the Castle takes the best tile and locks the Vampire in", () => {
    let s = rigTurn(base, 0, {
      hand: ["vampiric-speed-3#0", "vampire-speed-2#0-0", "vampire-thirst#0-0"],
      pos: "rail-2",
    });
    const vp = s.players[0].vp;
    s = act(s, { type: "move", to: "castle", spent: 3 });
    expect(s.players[0].castleTile).toBe(10);
    expect(s.players[0].vp - vp).toBe(10);
    expect(legal(s).map((a) => a.type)).toEqual(["end-turn"]);
  });

  it("pushes a Vampire off the landing space", () => {
    const b = structuredClone(base);
    b.players[1].pos = "road-5";
    let s = rigTurn(b, 0, {
      hand: ["vampiric-speed-3#0", "vampire-speed-2#0-0", "vampire-thirst#0-0"],
      pos: "road-3",
    });
    s = act(s, { type: "move", to: "road-5", spent: 2 });
    expect(s.current?.step).toBe("push");
    s = act(s, { type: "push", to: "road-6" });
    expect(s.players[1].pos).toBe("road-6");
    expect(s.current?.step).toBe("act");
  });
});

describe("hunting", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

  it("Fast adds +1 to the pile's cost, once", () => {
    const track = emptyTrack();
    track[0][1] = ["calvin#0", "reyda#0"];
    const s = rigTurn(base, 0, {
      hand: ["o-nel#0", "vampire-speed-2#0-0", "vampire-thirst#0-0"],
      pos: "road-4",
      track,
    });
    // Speed 5 (Thirst 3 with a Human). Column 2 + Fast = 3.
    const after = act(s, { type: "stay" });
    expect(legal(after)).toContainEqual({ type: "hunt", row: 0, col: 1 });
    const t = structuredClone(after);
    if (t.current) t.current.speedLeft = 2;
    expect(legal(t)).not.toContainEqual({ type: "hunt", row: 0, col: 1 });
  });

  it("Holy Water: no Hunt this turn", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    let s = rigTurn(base, 0, { hand: ["bolat#0", ...speedy.slice(0, 2)], pos: "road-4", track });
    s = act(s, { type: "stay" });
    expect(legal(s).some((a) => a.type === "hunt")).toBe(false);
  });

  it("a Well grants one more Hunt, in column 1 only", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    track[1][0] = ["agnes#0"];
    track[2][2] = ["ozmo#0"];
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-5", track });
    s = act(s, { type: "move", to: "road-6", spent: 1 });
    s = act(s, { type: "hunt", row: 2, col: 2 });
    expect(legal(s)).toContainEqual({ type: "hunt", row: 0, col: 0 });
    s = act(s, { type: "hunt", row: 0, col: 0 });
    expect(legal(s).some((a) => a.type === "hunt")).toBe(false);
  });

  it("the Labyrinth hunts a Rose for free, one Rose per Vampire", () => {
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-9" });
    s = act(s, { type: "move", to: "labyrinth", spent: 2 });
    const roses = legal(s).filter((a) => a.type === "hunt-rose");
    expect(roses).toHaveLength(3);
    s = act(s, roses[0]);
    // Ready: choose where it goes.
    expect(s.current?.step).toBe("ready");
    s = act(s, legal(s)[0]);
    expect(legal(s).some((a) => a.type === "hunt-rose")).toBe(false);
  });

  it("Gregarious pulls the top Hunt card into the hunt", () => {
    const track = emptyTrack();
    track[0][0] = ["wilma#0"];
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-4", track });
    const top = s.huntDeck[s.huntDeck.length - 1];
    s = act(s, { type: "stay" });
    s = act(s, { type: "hunt", row: 0, col: 0 });
    const owned = [...s.players[0].discard, ...(s.current?.readyQueue ?? [])];
    expect(owned).toContain(top);
  });

  it("the Cemetery refuses piles with Humans", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    track[1][0] = ["tyson#0"];
    let s = rigTurn(base, 0, { hand: speedy, pos: "cemetery", track });
    s = act(s, { type: "stay" });
    const hunts = legal(s).filter((a) => a.type === "hunt");
    expect(hunts).toEqual([{ type: "hunt", row: 1, col: 0 }]);
  });
});

describe("board spaces", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

  it("a Chest gives its token and 2 VP (Velvet Clothing: 4)", () => {
    const b = structuredClone(base);
    b.chests["road-4"] = "velvet#0";
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-3" });
    s = act(s, { type: "move", to: "road-4", spent: 1 });
    const vp = s.players[0].vp;
    s = act(s, { type: "space" });
    expect(s.players[0].vp - vp).toBe(4);
    expect(s.chests["road-4"]).toBeNull();
  });

  it("an Elder Crypt keeps one more Mission than you held", () => {
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-1" });
    s = act(s, { type: "move", to: "road-2", spent: 1 });
    s = act(s, { type: "space" });
    expect(s.current?.step).toBe("missions");
    const options = legal(s);
    expect(options.every((a) => a.type === "keep-missions" && a.keep.length === 2)).toBe(true);
    s = act(s, options[0]);
    expect(s.players[0].missions).toHaveLength(2);
    // 6 offered + 1 held − 2 kept go back.
    expect(s.crypts.mountains).toHaveLength(5);
  });

  it("a building Digests a Human of its type", () => {
    const b = structuredClone(base);
    b.players[0].discard = ["boris#0"];
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-2" });
    s = act(s, { type: "move", to: "road-3", spent: 1 });
    s = act(s, { type: "space" });
    s = act(s, { type: "digest", card: "boris#0" });
    expect(s.players[0].digested).toEqual(["boris#0"]);
  });
});

describe("Instant Missions", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];
  const withMission = (mission: string) => {
    const b = structuredClone(base);
    b.players[0].missions = [mission];
    return b;
  };

  it("Vampire of the Coast: after a Human on the Plains, one more pile in that column, free", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    track[1][0] = ["tyre#0"];
    track[2][1] = ["khasar#0"];
    let s = rigTurn(withMission("vampire-of-the-coast"), 0, { hand: speedy, pos: "road-4", track });
    s = act(s, { type: "stay" });
    expect(legal(s).some((a) => a.type === "instant")).toBe(false);
    s = act(s, { type: "hunt", row: 0, col: 0 });
    const free = legal(s).filter((a) => a.type === "instant");
    expect(free).toEqual([{ type: "instant", mission: "vampire-of-the-coast", row: 1, col: 0 }]);
    const vp = s.players[0].vp;
    const speed = s.current?.speedLeft;
    s = act(s, free[0]);
    // Monk 1 + Plains 1.
    expect(s.players[0].vp - vp).toBe(2);
    expect(s.current?.speedLeft).toBe(speed);
    expect(s.players[0].missions).toEqual([]);
    expect(s.players[0].usedMissions).toEqual(["vampire-of-the-coast"]);
  });

  it("Hungry!: only after a column-3 hunt, then any pile", () => {
    const track = emptyTrack();
    track[0][2] = ["vampiric-speed-2#0"];
    track[1][0] = ["tyre#0"];
    let s = rigTurn(withMission("hungry"), 0, { hand: speedy, pos: "road-4", track });
    s = act(s, { type: "stay" });
    s = act(s, { type: "hunt", row: 0, col: 2 });
    expect(legal(s)).toContainEqual({ type: "instant", mission: "hungry", row: 1, col: 0 });
  });

  it("Treasure Chest takes any Bonus token on the board", () => {
    const b = withMission("treasure-chest");
    b.chests["boat-10"] = "velvet#0";
    let s = rigTurn(b, 0, { hand: speedy, pos: "castle" });
    expect(legal(s)).toContainEqual({
      type: "instant",
      mission: "treasure-chest",
      space: "boat-10",
    });
    const vp = s.players[0].vp;
    s = act(s, { type: "instant", mission: "treasure-chest", space: "boat-10" });
    expect(s.players[0].vp - vp).toBe(4);
    expect(s.players[0].bonus.map((t) => t.id)).toContain("velvet#0");
  });

  it("Beast Master puts a Familiar straight into the playing area, Speed and all", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0", "nanoosh#0"];
    let s = rigTurn(withMission("beast-master"), 0, {
      hand: ["vampiric-speed-3#0", "agnes#0", "mycroft#0"],
      pos: "road-4",
      track,
    });
    // An Instant usable now keeps step 1 open.
    expect(s.current?.step).toBe("manipulate");
    s = act(s, { type: "end-manipulation" });
    s = act(s, { type: "stay" });
    const left = s.current?.speedLeft ?? 0;
    s = act(s, { type: "instant", mission: "beast-master", card: "nanoosh#0" });
    expect(s.players[0].playArea.map((c) => c.id)).toContain("nanoosh#0");
    expect(s.track[0][0]).toEqual(["mindy#0"]);
    // Lockjaw with 2 Humans in play: +2 Speed.
    expect(s.current?.speedLeft).toBe(left + 2);
  });

  it("The Opportunist scores 1 VP per Vampire closer to the Castle", () => {
    const b = withMission("the-opportunist");
    b.players[1].pos = "road-1";
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-6" });
    const vp = s.players[0].vp;
    s = act(s, { type: "instant", mission: "the-opportunist" });
    expect(s.players[0].vp - vp).toBe(1);
  });

  it("Digestion skips the turn: Humans digested, the rest discarded", () => {
    let s = rigTurn(withMission("digestion"), 0, {
      hand: ["mindy#0", "tyre#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    expect(s.current?.step).toBe("manipulate");
    s = act(s, { type: "instant", mission: "digestion" });
    expect(s.players[0].digested).toEqual(["mindy#0", "tyre#0"]);
    expect(s.players[0].discard).toContain("vampire-speed-2#0-0");
    expect(s.log.some((e) => e.t === "end-turn" && e.p === 0)).toBe(true);
    expect(s.log.some((e) => e.t === "move" && e.p === 0)).toBe(false);
  });

  it("a used Instant is gone: it cannot be exchanged at a Crypt", () => {
    const b = withMission("the-opportunist");
    b.players[1].pos = "road-1";
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-4" });
    s = act(s, { type: "instant", mission: "the-opportunist" });
    // Nothing else to do in step 1, so it closes by itself.
    expect(s.current?.step).toBe("move");
    s = act(s, { type: "move", to: "road-5", spent: 1 });
    s = act(s, { type: "space" });
    const sets = legal(s).filter((a) => a.type === "keep-missions");
    // Nothing held → keep exactly one, none of them the used tile.
    expect(sets.every((a) => a.type === "keep-missions" && a.keep.length === 1)).toBe(true);
    expect(sets.some((a) => a.type === "keep-missions" && a.keep.includes("the-opportunist"))).toBe(
      false,
    );
  });
});

describe("Roses at the end of the turn", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

  it("Eternal 1 VP always; Perfect 2 VP without a hunt; Dead 1 VP only after one", () => {
    const endVp = (rose: string, hunt: boolean) => {
      const track = emptyTrack();
      track[0][0] = ["vampiric-speed-2#0"];
      let s = rigTurn(base, 0, { hand: speedy, pos: "road-4", track, permanent: [rose] });
      s = act(s, { type: "stay" });
      if (hunt) s = act(s, { type: "hunt", row: 0, col: 0 });
      s = act(s, { type: "end-turn" });
      const e = [...s.log].reverse().find((l) => l.t === "end-turn" && l.p === 0);
      return e?.t === "end-turn" ? e.vp : -1;
    };
    expect(endVp("eternal-rose#0", false)).toBe(1);
    expect(endVp("eternal-rose#0", true)).toBe(1);
    expect(endVp("perfect-rose#0", false)).toBe(2);
    expect(endVp("perfect-rose#0", true)).toBe(0);
    expect(endVp("dead-rose#0", true)).toBe(1);
    expect(endVp("dead-rose#0", false)).toBe(0);
  });
});

describe("Familiars", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];
  const lastFamiliarVp = (s: ReturnType<typeof act>, card: string) =>
    s.log
      .filter((e) => e.t === "familiar" && e.card.startsWith(card))
      .reduce((n, e) => n + (e.t === "familiar" ? e.vp : 0), 0);

  it("Tyson: 1 VP at the end of a turn without a hunt", () => {
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-4", permanent: ["tyson#0"] });
    s = act(s, { type: "stay" });
    s = act(s, { type: "end-turn" });
    expect(s.log.some((e) => e.t === "end-turn" && e.p === 0 && e.vp === 1)).toBe(true);
  });

  it("Kutya: +1 Speed to hunt on a Well, or discard it for a column-1 Hunt", () => {
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-5", permanent: ["kutya#0"] });
    s = act(s, { type: "move", to: "road-6", spent: 1 });
    // Speed 8 − 1 moved + 1 Kutya on a Well.
    expect(s.current?.speedLeft).toBe(8);
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    track[1][0] = ["tyre#0"];
    let t = rigTurn(base, 0, { hand: speedy, pos: "road-4", track, permanent: ["kutya#0"] });
    t = act(t, { type: "stay" });
    // Speed is lost after the last Hunt, so Kutya goes first.
    t = act(t, { type: "familiar", card: "kutya#0" });
    expect(t.players[0].discard).toContain("kutya#0");
    t = act(t, { type: "hunt", row: 0, col: 0 });
    expect(legal(t)).toContainEqual({ type: "hunt", row: 1, col: 0 });
  });

  it("Chop: an extra Hunt for staying put, and 1 VP for hunting a Human", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    track[1][0] = ["tyre#0"];
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-4", track, permanent: ["chop#0"] });
    s = act(s, { type: "stay" });
    s = act(s, { type: "hunt", row: 0, col: 0 });
    expect(legal(s)).toContainEqual({ type: "hunt", row: 1, col: 0 });
    s = act(s, { type: "end-turn" });
    expect(s.log.some((e) => e.t === "end-turn" && e.p === 0 && e.vp === 1)).toBe(true);

    let moved = rigTurn(base, 0, { hand: speedy, pos: "road-3", track, permanent: ["chop#0"] });
    moved = act(moved, { type: "move", to: "road-4", spent: 1 });
    moved = act(moved, { type: "hunt", row: 0, col: 0 });
    expect(legal(moved).some((a) => a.type === "hunt")).toBe(false);
  });

  it("Sova: 1 VP for each Mission gained", () => {
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-1", permanent: ["sova#0"] });
    s = act(s, { type: "move", to: "road-2", spent: 1 });
    s = act(s, { type: "space" });
    const held = s.players[0].missions[0];
    const keepOld = legal(s).find((a) => a.type === "keep-missions" && a.keep.includes(held));
    const vp = s.players[0].vp;
    if (!keepOld) throw new Error("no keep set");
    s = act(s, keepOld);
    expect(s.players[0].vp - vp).toBe(1);
  });

  it("Wee Vlad: +1 Speed per Human worth 1 or 2 VP; Lockjaw: +2 Speed and 1 VP with 2+ Humans", () => {
    const vlad = rigTurn(base, 0, {
      hand: ["mindy#0", "yaga#0", "theresa#0"],
      pos: "road-4",
      permanent: ["wee-vlad#0"],
    });
    // Printed: Mindy 0, Yaga −1, Theresa 0. Mindy (1 VP) and Yaga (2 VP) +1 each;
    // Theresa is worth 4. Theresa Confuses first — Speed is read wherever she took us.
    expect(vlad.current?.speed).toBe(0 - 1 + 0 + 2);
    const vp = base.players[0].vp;
    const jaw = rigTurn(base, 0, {
      hand: ["mindy#0", "tyre#0", "vampire-speed-2#0-0"],
      pos: "road-4",
      permanent: ["lockjaw#0"],
    });
    expect(jaw.current?.speed).toBe(2 + 2);
    expect(jaw.players[0].vp - vp).toBe(1);
    expect(lastFamiliarVp(jaw, "lockjaw")).toBe(1);
  });

  it("Wiggles digests itself and one card from the playing area for 2 VP", () => {
    let s = rigTurn(base, 0, {
      hand: ["theresa#0", "vampire-speed-2#0-0", "vampire-speed-3#0-0"],
      pos: "road-4",
      permanent: ["wiggles#0"],
    });
    const vp = s.players[0].vp;
    s = act(s, { type: "familiar", card: "wiggles#0", target: "theresa#0" });
    expect(s.players[0].digested).toEqual(["wiggles#0", "theresa#0"]);
    expect(s.players[0].vp - vp).toBe(2);
    // Digested before she acted: no Confuse.
    if (s.current?.step === "manipulate") s = act(s, { type: "end-manipulation" });
    expect(s.current?.confused).toBe(false);
  });

  it("Ursa trades the whole hand for 2 cards and 1 VP, first thing only", () => {
    let s = rigTurn(base, 0, {
      hand: ["mindy#0", "tyre#0", "yaga#0"],
      pos: "road-4",
      permanent: ["ursa#0"],
    });
    const vp = s.players[0].vp;
    s = act(s, { type: "familiar", card: "ursa#0" });
    expect(s.players[0].discard).toEqual(
      expect.arrayContaining(["mindy#0", "tyre#0", "yaga#0", "ursa#0"]),
    );
    expect(s.players[0].playArea).toHaveLength(2);
    expect(s.players[0].vp - vp).toBe(1);
  });

  it("Nanny: 2 VP per push, and the pushed Vampire picks a Permanent to discard", () => {
    const b = structuredClone(base);
    b.players[1].pos = "road-5";
    b.players[1].playArea = [
      { id: "tyson#0", resolved: false },
      { id: "chop#0", resolved: false },
    ];
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-3", permanent: ["nanny#0"] });
    s = act(s, { type: "move", to: "road-5", spent: 2 });
    const vp = s.players[0].vp;
    s = act(s, { type: "push", to: "road-6" });
    expect(s.players[0].vp - vp).toBe(2);
    // Seat 1 decides now, mid-turn.
    expect(s.current?.step).toBe("nanny");
    expect(getActivePlayer(s)).toBe(1);
    expect(legal(s)).toEqual([
      { type: "discard-permanent", card: "tyson#0" },
      { type: "discard-permanent", card: "chop#0" },
    ]);
    s = act(s, { type: "discard-permanent", card: "chop#0" });
    expect(s.players[1].playArea.map((c) => c.id)).toEqual(["tyson#0"]);
    expect(s.players[1].discard).toContain("chop#0");
    expect(getActivePlayer(s)).toBe(0);
    expect(s.current?.step).toBe("act");
  });
});

describe("Human effects", () => {
  const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

  it("Bridget scores +1 on the Plains; Belle +2 in the Forest", () => {
    const hunt = (card: string, pos: string) => {
      const track = emptyTrack();
      track[0][0] = [card];
      let s = rigTurn(base, 0, { hand: speedy, pos, track });
      s = act(s, { type: "stay" });
      const vp = s.players[0].vp;
      s = act(s, { type: "hunt", row: 0, col: 0 });
      return s.players[0].vp - vp;
    };
    // Printed 2 + Plains 1 + Bridget 1.
    expect(hunt("bridget#0", "road-4")).toBe(4);
    // Printed 3 + Forest 2 + Belle 2.
    expect(hunt("belle#0", "road-8")).toBe(7);
    // Belle on the Plains: no bonus of her own.
    expect(hunt("belle#0", "road-4")).toBe(4);
  });

  it("hunting Zephania offers one free Digest from the playing area or discard pile", () => {
    const track = emptyTrack();
    track[0][0] = ["zephania#0"];
    const b = structuredClone(base);
    b.players[0].discard = ["diego#0"];
    let s = rigTurn(b, 0, { hand: speedy, pos: "road-4", track });
    s = act(s, { type: "stay" });
    s = act(s, { type: "hunt", row: 0, col: 0 });
    expect(s.current?.step).toBe("digest");
    expect(legal(s)).toContainEqual({ type: "digest", card: "diego#0" });
    expect(legal(s)).toContainEqual({ type: "digest", card: null });
    s = act(s, { type: "digest", card: "diego#0" });
    expect(s.players[0].digested).toEqual(["diego#0"]);
    expect(s.current?.step).toBe("act");
  });

  it("Dee draws a card in step 1", () => {
    let s = rigTurn(base, 0, { hand: ["dee#0", "vampire-speed-2#0-0", "o-nel#0"], pos: "road-4" });
    const before = s.players[0].playArea.length;
    s = act(s, { type: "resolve", card: "dee#0" });
    expect(s.players[0].playArea.length).toBe(before + 1);
  });
});

describe("Bonus tokens", () => {
  it("a +1 Hunt token, spent before the first Hunt, allows a second", () => {
    const track = emptyTrack();
    track[0][0] = ["o-nel#0"];
    track[1][2] = ["ruth#0"];
    const b = structuredClone(base);
    b.players[0].bonus = [{ id: "extra-hunt#0", used: false }];
    let s = rigTurn(b, 0, {
      hand: ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"],
      pos: "road-4",
      track,
    });
    s = act(s, { type: "stay" });
    s = act(s, { type: "use-bonus", token: "extra-hunt#0" });
    s = act(s, { type: "hunt", row: 1, col: 2 });
    expect(legal(s)).toContainEqual({ type: "hunt", row: 0, col: 0 });
    expect(s.players[0].bonus[0].used).toBe(true);
  });
});

describe("Powers", () => {
  it("Hypnosis moves one Hunt Track card to a neighbouring pile, once", () => {
    const track = emptyTrack();
    track[0][1] = ["o-nel#0"];
    track[0][0] = ["ruth#0"];
    let s = rigTurn(base, 0, {
      hand: ["hypnosis#0", "vampiric-speed-3#0", "vampiric-speed-2#0"],
      pos: "road-4",
      track,
    });
    const moves = legal(s).filter((a) => a.type === "hypnosis" && a.pick === "o-nel#0");
    // Row 0, column 2 (index 1): left, right and down — never off the track.
    expect(moves.map((a) => (a.type === "hypnosis" ? [a.row, a.col] : [])).sort()).toEqual([
      [0, 0],
      [0, 2],
      [1, 1],
    ]);
    s = act(s, { type: "hypnosis", card: "hypnosis#0", pick: "o-nel#0", row: 0, col: 0 });
    expect(s.track[0][0]).toEqual(["ruth#0", "o-nel#0"]);
    expect(s.track[0][1]).toEqual([]);
    expect(legal(s).some((a) => a.type === "hypnosis")).toBe(false);
  });

  it("the double Vampiric Will discards and draws twice", () => {
    let s = rigTurn(base, 0, {
      hand: ["vampiric-will-double#0", "diego#0", "wadsworth#0"],
      pos: "road-4",
    });
    s = act(s, { type: "resolve", card: "vampiric-will-double#0", discard: "diego#0" });
    expect(legal(s)).toContainEqual({
      type: "resolve",
      card: "vampiric-will-double#0",
      discard: "wadsworth#0",
    });
    s = act(s, { type: "resolve", card: "vampiric-will-double#0", discard: "wadsworth#0" });
    expect(s.players[0].discard).toEqual(expect.arrayContaining(["diego#0", "wadsworth#0"]));
    expect(legal(s).some((a) => a.type === "resolve" && a.card === "vampiric-will-double#0")).toBe(
      false,
    );
  });

  it("Vampiric Strength draws its base, or more with a Human in play", () => {
    const drawn = (hand: string[]) => {
      let s = rigTurn(base, 0, { hand, pos: "road-4" });
      const before = s.players[0].playArea.length;
      s = act(s, { type: "resolve", card: hand[0] });
      return s.players[0].playArea.length - before;
    };
    expect(drawn(["vampiric-strength#0", "vampiric-speed-2#0", "vampiric-speed-3#0"])).toBe(1);
    expect(drawn(["vampiric-strength#0", "o-nel#0", "vampiric-speed-3#0"])).toBe(2);
    expect(drawn(["vampiric-strength-great#0", "vampiric-speed-2#0", "vampiric-speed-3#0"])).toBe(
      2,
    );
    expect(drawn(["vampiric-strength-great#0", "o-nel#0", "vampiric-speed-3#0"])).toBe(3);
  });
});

describe("mandatory draws", () => {
  it("Dee's 'Draw 1 card' must resolve before step 1 ends; 'you may' draws need not", () => {
    let s = rigTurn(base, 0, {
      hand: ["dee#0", "vampiric-strength#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    expect(legal(s).some((a) => a.type === "end-manipulation")).toBe(false);
    s = act(s, { type: "resolve", card: "dee#0" });
    // Vampiric Strength says "You may draw": step 1 may now end without it.
    expect(legal(s).some((a) => a.type === "end-manipulation")).toBe(true);
  });

  it("the Starting Vampire Strength must draw once a Human is in play", () => {
    const s = rigTurn(base, 0, {
      hand: ["s-vampire-strength#0-0", "o-nel#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    expect(legal(s).some((a) => a.type === "end-manipulation")).toBe(false);
    const alone = rigTurn(base, 0, {
      hand: ["s-vampire-strength#0-0", "vampire-speed-3#0-0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    // No Human: nothing to draw, so nothing holds step 1 open.
    expect(alone.current?.step).toBe("move");
  });
});
