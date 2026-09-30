import { describe, expect, it } from "vitest";
import { classifyRoute } from "./page-classify";

const at = (path: string) => {
  const [pathname = "", search = ""] = path.split("?");
  return classifyRoute(pathname, search ? `?${search}` : "");
};

describe("classifyRoute", () => {
  it("names the top-level pages", () => {
    expect(at("/")).toEqual({ page: "home" });
    expect(at("/offline")).toEqual({ page: "calendar" });
    expect(at("/offline?date=2026-10-03")).toEqual({ page: "night", detail: "2026-10-03" });
    expect(at("/history")).toEqual({ page: "history" });
    expect(at("/players")).toEqual({ page: "players" });
    expect(at("/games")).toEqual({ page: "games" });
    expect(at("/settings")).toEqual({ page: "appearance" });
    expect(at("/admin")).toEqual({ page: "admin", detail: "users" });
    expect(at("/admin?tab=vote")).toEqual({ page: "admin", detail: "vote" });
  });

  it("logs a profile visit itself, and each profile sub-page", () => {
    expect(at("/u/abc")).toEqual({ page: "profile", detail: "abc" });
    expect(at("/u/abc/skill")).toEqual({ page: "profile-skill", detail: "abc" });
    expect(at("/u/abc/matches")).toEqual({ page: "profile-matches", detail: "abc" });
    expect(at("/u/abc/nights")).toEqual({ page: "profile-nights", detail: "abc" });
    expect(at("/u/abc/collection")).toEqual({ page: "profile-collection", detail: "abc" });
    expect(at("/u/abc/collection?tab=purchases")).toEqual({
      page: "profile-purchases",
      detail: "abc",
    });
    expect(at("/u/abc/nope")).toBeNull();
  });

  it("tells the game shell's modes apart", () => {
    expect(at("/play/arcs")).toEqual({ page: "play", detail: "arcs" });
    expect(at("/play/arcs/rules")).toEqual({ page: "play-rules", detail: "arcs" });
    expect(at("/play/arcs/solo")).toEqual({ page: "play-solo", detail: "arcs" });
    expect(at("/play/dnd/solo/hall/setup")).toEqual({ page: "play-solo", detail: "dnd" });
    expect(at("/play/arcs/companion")).toEqual({ page: "play-companion", detail: "arcs" });
    expect(at("/play/7-wonders/bga")).toEqual({ page: "play-bga", detail: "7-wonders" });
    expect(at("/play/arcs/mp/join")).toEqual({ page: "play-join", detail: "arcs" });
    expect(at("/play/arcs/mp/lobby/QX4P")).toEqual({ page: "play-lobby", detail: "arcs" });
    expect(at("/play/arcs/mp/play/QX4P")).toEqual({ page: "play-room", detail: "arcs" });
    expect(at("/play/arcs/match-history")).toEqual({ page: "play-replays", detail: "arcs" });
    expect(at("/play/arcs/match-history/r9")).toEqual({ page: "play-replay", detail: "arcs" });
    expect(at("/play/arcs/tournament")).toEqual({ page: "play-tournament", detail: "arcs" });
  });

  it("reads Quiztopia's solo shell as its trainer", () => {
    expect(at("/play/quiztopia/solo")).toEqual({ page: "trainer", detail: "quiztopia" });
    expect(at("/play/quiztopia/solo/study?category=3")).toEqual({
      page: "trainer-study",
      detail: "quiztopia",
    });
    expect(at("/play/quiztopia/solo/wiki/history/c12")).toEqual({
      page: "trainer-wiki",
      detail: "quiztopia",
    });
    expect(at("/play/quiztopia/solo/timeline")).toEqual({
      page: "trainer-timeline",
      detail: "quiztopia",
    });
    // The table game is still the game.
    expect(at("/play/quiztopia/mp/lobby/AB12")).toEqual({
      page: "play-lobby",
      detail: "quiztopia",
    });
  });

  it("logs the World Geography trainer", () => {
    expect(at("/trainer/geography")).toEqual({ page: "trainer", detail: "geography" });
    expect(at("/trainer/geography/study")).toEqual({ page: "trainer-study", detail: "geography" });
    expect(at("/trainer/geography/explore")).toEqual({
      page: "trainer-explore",
      detail: "geography",
    });
    expect(at("/trainer/other")).toBeNull();
  });

  it("skips signed-out and dev pages", () => {
    expect(at("/login")).toBeNull();
    expect(at("/reset-password")).toBeNull();
    expect(at("/dev/ui")).toBeNull();
  });
});
