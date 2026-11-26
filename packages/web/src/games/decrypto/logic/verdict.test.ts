import type { DecryptoPlayerView } from "@boardgames/core/games/decrypto/types";
import { describe, expect, it } from "vitest";
import { type RevealedTx, verdictFor } from "./verdict";

const view = { team: 0, variant: "standard" } as DecryptoPlayerView;

const tx = (over: Partial<RevealedTx>): RevealedTx => ({
  round: 2,
  team: 0,
  code: [1, 2, 3],
  decodeGuess: [1, 2, 3],
  interceptGuess: [3, 2, 4],
  intercepted: false,
  miscommunicated: false,
  ...over,
});

describe("verdicts in the viewer's words", () => {
  it("our clean transmission: decoded and safe", () => {
    const v = verdictFor(view, tx({}));
    expect(v.tone).toBe("good");
    expect(v.stamp).toBe("Decoded · safe");
    expect(v.lines.map((l) => l.title)).toEqual(["We decoded it", "Safe from Black"]);
    expect(v.lines[1]?.detail).toBe("They guessed 3-2-4 · 1 of 3 right");
  });

  it("our misread and their interception are both bad for us", () => {
    const v = verdictFor(
      view,
      tx({
        decodeGuess: [1, 2, 4],
        miscommunicated: true,
        interceptGuess: [1, 2, 3],
        intercepted: true,
      }),
    );
    expect(v.tone).toBe("bad");
    expect(v.stamp).toBe("Misread & intercepted");
    expect(v.lines[0]?.detail).toBe("We read 1-2-4 · it was 1-2-3 · a black token to us");
    expect(v.lines[1]?.title).toBe("Black intercepted us");
  });

  it("their transmission: our interception is the headline", () => {
    const hit = verdictFor(view, tx({ team: 1, interceptGuess: [1, 2, 3], intercepted: true }));
    expect(hit.stamp).toBe("We intercepted!");
    expect(hit.tone).toBe("good");
    expect(hit.lines[0]?.detail).toBe("We read 1-2-3 exactly · a white token to us");

    const miss = verdictFor(view, tx({ team: 1 }));
    expect(miss.stamp).toBe("Intercept missed");
    expect(miss.lines.map((l) => l.title)).toEqual(["Our intercept missed", "Black decoded it"]);
  });

  it("round 1 has no interception line to fail", () => {
    const v = verdictFor(view, tx({ round: 1, interceptGuess: null }));
    expect(v.stamp).toBe("Decoded");
    expect(verdictFor(view, tx({ round: 1, team: 1, interceptGuess: null })).tone).toBe("neutral");
  });

  it("the 3-player game sends every token to the interceptor", () => {
    const v = verdictFor(
      { team: 0, variant: "interceptor" } as DecryptoPlayerView,
      tx({ decodeGuess: [2, 1, 3], miscommunicated: true }),
    );
    expect(v.lines[0]?.detail).toContain("a token to Interceptor");
  });
});
