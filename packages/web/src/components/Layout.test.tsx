import { describe, expect, it } from "vitest";
import { backTarget } from "./Layout";

// `backTarget` is the pure pathname → parent route resolver that
// replaced the previous `useGameBackOverride` ref mechanism. Each test
// pins one rung of the route tree so a stray edit to the URL hierarchy
// is caught early — the back button is the only navigation affordance
// in the layout chrome, so a regression here breaks deep-screen
// recovery for every game.

describe("backTarget", () => {
  describe("dashboard sentinel", () => {
    it("/games → / (dashboard) labeled 'Dashboard'", () => {
      expect(backTarget("/games")).toEqual({ href: "/", label: "Dashboard" });
    });

    it("tolerates the trailing slash on /games/", () => {
      expect(backTarget("/games/")).toEqual({ href: "/", label: "Dashboard" });
    });
  });

  describe("game shell tree", () => {
    it("/play/:slug → /games", () => {
      expect(backTarget("/play/lost-cities")).toEqual({ href: "/games", label: "Back" });
    });

    it("/play/:slug/rules → /play/:slug (mode select)", () => {
      expect(backTarget("/play/lost-cities/rules")).toEqual({
        href: "/play/lost-cities",
        label: "Back",
      });
    });

    it("/play/:slug/solo → /play/:slug (mode select)", () => {
      expect(backTarget("/play/lost-cities/solo")).toEqual({
        href: "/play/lost-cities",
        label: "Back",
      });
    });

    it("/play/:slug/solo/<sub> → one level up (game-internal sub-routes)", () => {
      expect(backTarget("/play/dungeons-and-dragons/solo/campaign/abc")).toEqual({
        href: "/play/dungeons-and-dragons/solo/campaign",
        label: "Back",
      });
      expect(backTarget("/play/dungeons-and-dragons/solo/campaign/abc/game")).toEqual({
        href: "/play/dungeons-and-dragons/solo/campaign/abc",
        label: "Back",
      });
    });

    it("/play/:slug/companion → /play/:slug (mode select)", () => {
      expect(backTarget("/play/dungeons-and-dragons/companion")).toEqual({
        href: "/play/dungeons-and-dragons",
        label: "Back",
      });
    });

    it("/play/:slug/mp/join → /play/:slug", () => {
      expect(backTarget("/play/pandemic/mp/join")).toEqual({
        href: "/play/pandemic",
        label: "Back",
      });
    });

    it("/play/:slug/mp/lobby/:code → /play/:slug", () => {
      expect(backTarget("/play/pandemic/mp/lobby/ABCD")).toEqual({
        href: "/play/pandemic",
        label: "Back",
      });
    });

    it("/play/:slug/mp/play/:code → /play/:slug", () => {
      // Deep mp sub-routes always exit to mode select rather than back
      // to the lobby — leaving a game mid-flight is more naturally a
      // hop back to mode select; the user can re-enter the lobby URL
      // explicitly if they want to keep their seat.
      expect(backTarget("/play/pandemic/mp/play/ABCD")).toEqual({
        href: "/play/pandemic",
        label: "Back",
      });
    });

    it("/play/:slug/tournament → /play/:slug", () => {
      expect(backTarget("/play/lost-cities/tournament")).toEqual({
        href: "/play/lost-cities",
        label: "Back",
      });
    });

    it("/play/:slug/tournament/:a/:b/:t → /play/:slug", () => {
      expect(backTarget("/play/lost-cities/tournament/ismcts-v4/ismcts-v1/tid")).toEqual({
        href: "/play/lost-cities",
        label: "Back",
      });
    });

    it("/play/:slug/match-history → /play/:slug", () => {
      expect(backTarget("/play/set/match-history")).toEqual({
        href: "/play/set",
        label: "Back",
      });
    });
  });

  describe("unknown shapes", () => {
    it("falls back to /games for any non-play path the layout might be mounted under", () => {
      // The layout only mounts under online-gated routes; this defends
      // against a future surface that picks up the layout chrome but
      // hasn't been wired into the back resolver.
      expect(backTarget("/something-else")).toEqual({ href: "/games", label: "Back" });
    });
  });
});
