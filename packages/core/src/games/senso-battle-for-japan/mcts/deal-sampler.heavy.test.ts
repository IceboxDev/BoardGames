// Heavy tier (`pnpm test:heavy`): the deal sampler's statistical check — a
// 200 000-step chain against the exactly enumerated posterior. ~20 s alone,
// so it runs in its own CI job, not in the pre-commit hook.

import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { PosteriorDealSampler } from "./deal-sampler";
import { dealKey, enumerateDeals, midRound, OPTS, reduceRoot } from "./deal-sampler.fixtures";
import { cloneFast, dealRespectsVoids, resetFrom } from "./fast-round";
import { createLikelihoodScratch, worldLogWeight } from "./inference";
import { OPPONENT_MODEL } from "./opponent-weights";

describe("posterior deal sampler (convergence)", () => {
  it("converges to the enumerated posterior on reduced 3-player positions", () => {
    // Two roots: 560 consistent deals without voids, 40 with a revealed void.
    for (const [seed, plies, consistent, ratio] of [
      [11, 22, 560, 3],
      [7, 26, 40, 1.5],
    ] as const) {
      const { state, root: full, hist } = midRound(3, seed, plies);
      const root = reduceRoot(state, full, { [full.dealOrder[0]]: 3, [full.dealOrder[1]]: 3 }, 2);
      const all = enumerateDeals(root);
      expect(all.length).toBe(560);
      // Posterior ∝ likelihood over the void-consistent deals.
      const scratch = createLikelihoodScratch(root.base);
      const f = cloneFast(root.base);
      const logw: number[] = [];
      const keys: string[] = [];
      for (const owner of all) {
        if (!dealRespectsVoids({ owner }, root)) continue;
        f.owner.set(owner);
        logw.push(worldLogWeight(f, root.me, hist, OPPONENT_MODEL, OPTS.tau, OPTS.floor, scratch));
        keys.push(dealKey({ owner }, root));
      }
      expect(keys.length).toBe(consistent);
      const max = Math.max(...logw);
      let z = 0;
      const post = logw.map((l) => {
        const p = Math.exp(l - max);
        z += p;
        return p;
      });
      for (let i = 0; i < post.length; i++) post[i] /= z;
      // The likelihood must actually discriminate, or the test says nothing.
      expect(Math.max(...post) / Math.min(...post)).toBeGreaterThan(ratio);

      const sampler = new PosteriorDealSampler(
        root,
        hist,
        OPPONENT_MODEL,
        { ...OPTS, thin: 2 },
        createRng(5),
      );
      const counts = new Map<string, number>();
      const steps = 200_000;
      for (let i = 0; i < steps; i++) {
        resetFrom(f, root.base);
        sampler.next(f);
        const key = dealKey(f, root);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let tv = 0;
      let seen = 0;
      let iid = 0;
      let uniformTv = 0;
      for (let i = 0; i < keys.length; i++) {
        const c = counts.get(keys[i]) ?? 0;
        seen += c;
        tv += Math.abs(c / steps - post[i]);
        // Expected |empirical − p| of an i.i.d. draw (mean absolute deviation of a binomial).
        iid += Math.sqrt((2 * post[i] * (1 - post[i])) / (Math.PI * steps));
        uniformTv += Math.abs(1 / keys.length - post[i]);
      }
      expect(seen).toBe(steps); // never a deal outside the consistent set
      // Within the plan's bound, within three times the Monte Carlo error of
      // exact sampling (the chain's samples are correlated), and far from what
      // a sampler that ignored the likelihood would produce.
      expect(tv / 2).toBeLessThan(0.03);
      expect(tv / 2).toBeLessThan(3 * (iid / 2));
      expect(tv / 2).toBeLessThan(uniformTv / 2 / 4);
    }
  });
});
