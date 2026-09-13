// Posterior deal sampling for the paired PIMC.
//
// Deal-then-weight (inference.ts + the weighted loop in ismcts.ts) draws a deal
// uniformly and weights it by the likelihood of every opponent's observed
// plays. With one opponent that works; with two to four, the product of the
// play likelihoods spans orders of magnitude, a handful of deals carry all the
// weight and the weighted candidate means are noise (the effective sample
// size collapses — see diag-ess.ts). This sampler draws from the posterior
// instead: a Metropolis chain over consistent deals whose moves rotate cards
// between the opponents' hands and the undealt pool, accepted by the ratio of
// play likelihoods. Its samples feed the same paired loop unweighted.
//
// Design (plan "posterior deal sampling", 2026-09-07):
// - State: the opponents' hands plus the pool, seeded by `redeterminize`.
// - Proposal: a k-rotation over k distinct slots (k = 2 with probability
//   `pairProb`, else uniform in 3..cycleMax) with one uniformly chosen card
//   per slot. Ordered tuples and slot sizes are preserved by the move, so the
//   proposal is symmetric and plain Metropolis applies. Rotations longer than
//   swaps keep the chain connected when voids disconnect pair swaps (three
//   one-card seats with cyclic voids — a real late-round 4p/5p case).
// - A card landing on a seat void in its suit is an ordinary rejection.
// - The likelihood is separable by seat (inference.ts), so a proposal only
//   recomputes the seats it touched; the pool has no likelihood.
// - Seeds: `seedDraws` greedy deals scored by the full likelihood, systematic
//   resampling into `chains` chains (starting points inside the typical set),
//   then `burnIn` proposals per chain; emitted round-robin, `thin` proposals
//   apart. All randomness comes from the decision rng; no chain state survives
//   a decision, so the same state twice still yields the same action.

import type { Rng } from "../../../lib/rng";
import {
  allowed,
  cloneFast,
  type FastRound,
  N_CARDS,
  OUT,
  type RootInfo,
  redeterminize,
  resetFrom,
} from "./fast-round";
import {
  createLikelihoodScratch,
  type LikelihoodScratch,
  type RoundHistory,
  seatLogWeight,
} from "./inference";
import type { PolicyModel } from "./policy";

export interface SamplerOptions {
  /** Independent chains, emitted round-robin. */
  chains: number;
  /** Proposals per chain before the first emission. */
  burnIn: number;
  /** Proposals between two emissions of the same chain. */
  thin: number;
  /** Longest rotation (2 = swaps only). */
  cycleMax: number;
  /** Probability of proposing a swap rather than a longer rotation. */
  pairProb: number;
  /** Greedy deals scored and resampled into the chains' starting points. */
  seedDraws: number;
  /** Softmax temperature and uniform floor of the play likelihood (inference.ts). */
  tau: number;
  floor: number;
  /** Replay every decision under this void mask instead of the revealed voids (inference.ts). */
  fixedVoids?: Uint8Array | null;
}

export interface SamplerStats {
  proposals: number;
  accepted: number;
  /** Proposals refused because a card landed on a seat void in its suit. */
  voidRejects: number;
  /** Emitted deals. */
  emitted: number;
  /** Wall-clock spent seeding (draws, scoring, burn-in). */
  seedMs: number;
}

interface Chain {
  /** A dealt world: owner[] of the unseen cards is the chain's state. */
  world: FastRound;
  /** Cards per slot, `cap[slot]` valid entries. */
  cards: Int8Array[];
  /** Card → index inside its slot's list. */
  pos: Int8Array;
  /** Per seat: log-likelihood of that seat's observed plays in this world. */
  logL: Float64Array;
}

export class PosteriorDealSampler {
  readonly stats: SamplerStats = {
    proposals: 0,
    accepted: 0,
    voidRejects: 0,
    emitted: 0,
    seedMs: 0,
  };
  /** Slot → seat (-1 = the undealt pool). */
  private readonly slotSeat: Int8Array;
  /** Slot → number of cards. */
  private readonly cap: Int8Array;
  private readonly slotOfSeat: Int8Array;
  private readonly poolSlot: number;
  private readonly chains: Chain[] = [];
  private readonly scratch: LikelihoodScratch;
  private readonly order: Int8Array;
  private readonly moveCards = new Int8Array(6);
  private readonly moveSlots = new Int8Array(6);
  private readonly oldPos = new Int8Array(6);
  private readonly newL = new Float64Array(5);
  private cursor = 0;
  /** Fewer than two slots: the deal is determined, so proposals are skipped. */
  private readonly fixed: boolean;

  constructor(
    private readonly root: RootInfo,
    private readonly hist: RoundHistory,
    /** `null` = flat likelihood (uniform over consistent deals). */
    private readonly model: PolicyModel | null,
    private readonly opts: SamplerOptions,
    private readonly rng: Rng,
  ) {
    const t0 = performance.now();
    const base = root.base;
    const n = base.n;
    // Slots: every opponent still holding cards, then the pool if any card is undealt.
    const slotSeat: number[] = [];
    let dealt = 0;
    for (let k = 0; k < root.dealOrder.length; k++) {
      const seat = root.dealOrder[k];
      if (root.need[seat] === 0) continue;
      slotSeat.push(seat);
      dealt += root.need[seat];
    }
    const poolSize = root.unseen.length - dealt;
    this.poolSlot = poolSize > 0 ? slotSeat.length : -1;
    if (poolSize > 0) slotSeat.push(-1);
    this.slotSeat = Int8Array.from(slotSeat);
    this.cap = Int8Array.from(slotSeat.map((seat) => (seat < 0 ? poolSize : root.need[seat])));
    this.slotOfSeat = new Int8Array(n).fill(-1);
    slotSeat.forEach((seat, slot) => {
      if (seat >= 0) this.slotOfSeat[seat] = slot;
    });
    this.order = new Int8Array(slotSeat.length);
    this.scratch = createLikelihoodScratch(base, opts.fixedVoids ?? null);
    this.fixed = slotSeat.length < 2;
    this.seed();
    this.stats.seedMs = performance.now() - t0;
  }

  /** Acceptance rate so far (1 for a flat likelihood without void rejections). */
  get acceptRate(): number {
    return this.stats.proposals === 0 ? 1 : this.stats.accepted / this.stats.proposals;
  }

  /**
   * Write the next posterior deal into `f` (a fresh copy of `root.base`):
   * the unseen cards get their sampled seat, the pool stays OUT.
   */
  next(f: FastRound): void {
    const chain = this.chains[this.cursor];
    this.cursor = (this.cursor + 1) % this.chains.length;
    if (!this.fixed) for (let i = 0; i < this.opts.thin; i++) this.propose(chain);
    const unseen = this.root.unseen;
    for (let i = 0; i < unseen.length; i++) f.owner[unseen[i]] = chain.world.owner[unseen[i]];
    this.stats.emitted++;
  }

  /** Total log-likelihood of the chain the next emission will come from (tests). */
  peekLogLikelihood(): number {
    const chain = this.chains[this.cursor];
    let sum = 0;
    for (let s = 0; s < chain.logL.length; s++) sum += chain.logL[s];
    return sum;
  }

  /** Largest gap between a chain's cached seat terms and a fresh replay (tests). */
  cacheError(): number {
    let worst = 0;
    for (const chain of this.chains) {
      for (let slot = 0; slot < this.slotSeat.length; slot++) {
        const seat = this.slotSeat[slot];
        if (seat < 0) continue;
        const fresh = this.seatLogL(chain.world, seat);
        worst = Math.max(worst, Math.abs(fresh - chain.logL[seat]));
      }
    }
    return worst;
  }

  // ---------------------------------------------------------------------------

  private seatLogL(world: FastRound, seat: number): number {
    if (!this.model) return 0;
    return seatLogWeight(
      world,
      this.root.me,
      seat,
      this.hist,
      this.model,
      this.opts.tau,
      this.opts.floor,
      this.scratch,
    );
  }

  private seed(): void {
    const root = this.root;
    const base = root.base;
    const draws = Math.max(1, this.opts.seedDraws);
    const chainCount = Math.max(1, this.opts.chains);
    const dealScratch = new Int8Array(N_CARDS);
    // Draw and score `draws` greedy deals.
    const owners: Int8Array[] = [];
    const logLs: Float64Array[] = [];
    const totals = new Float64Array(draws);
    const world = cloneFast(base);
    for (let d = 0; d < draws; d++) {
      resetFrom(world, base);
      if (root.unseen.length > 0) redeterminize(world, root, this.rng, dealScratch);
      const logL = new Float64Array(base.n);
      let total = 0;
      for (let slot = 0; slot < this.slotSeat.length; slot++) {
        const seat = this.slotSeat[slot];
        if (seat < 0) continue;
        logL[seat] = this.seatLogL(world, seat);
        total += logL[seat];
      }
      owners.push(Int8Array.from(world.owner));
      logLs.push(logL);
      totals[d] = total;
    }
    // Systematic resampling by normalised likelihood.
    let max = Number.NEGATIVE_INFINITY;
    for (let d = 0; d < draws; d++) if (totals[d] > max) max = totals[d];
    const w = new Float64Array(draws);
    let sum = 0;
    for (let d = 0; d < draws; d++) {
      w[d] = Math.exp(totals[d] - max);
      sum += w[d];
    }
    const u0 = this.rng() / chainCount;
    let acc = 0;
    let d = 0;
    for (let c = 0; c < chainCount; c++) {
      const target = (u0 + c / chainCount) * sum;
      while (acc + w[d] < target && d < draws - 1) {
        acc += w[d];
        d++;
      }
      this.chains.push(this.buildChain(owners[d], logLs[d]));
    }
    if (this.fixed) return;
    for (const chain of this.chains) {
      for (let i = 0; i < this.opts.burnIn; i++) this.propose(chain);
    }
  }

  private buildChain(owner: Int8Array, logL: Float64Array): Chain {
    const base = this.root.base;
    const world = cloneFast(base);
    world.owner.set(owner);
    const cards = Array.from(this.cap, (c) => new Int8Array(Math.max(1, c)));
    const fill = new Int8Array(this.cap.length);
    const pos = new Int8Array(N_CARDS).fill(-1);
    const unseen = this.root.unseen;
    for (let i = 0; i < unseen.length; i++) {
      const card = unseen[i];
      const seat = owner[card];
      const slot = seat === OUT ? this.poolSlot : this.slotOfSeat[seat];
      if (slot < 0) throw new Error(`deal-sampler: card ${card} has no slot (owner ${seat})`);
      pos[card] = fill[slot];
      cards[slot][fill[slot]++] = card;
    }
    for (let slot = 0; slot < this.cap.length; slot++) {
      if (fill[slot] !== this.cap[slot]) {
        throw new Error(`deal-sampler: slot ${slot} holds ${fill[slot]} of ${this.cap[slot]}`);
      }
    }
    return { world, cards, pos, logL: Float64Array.from(logL) };
  }

  /** One Metropolis step on `chain`. */
  private propose(chain: Chain): void {
    const rng = this.rng;
    const S = this.slotSeat.length;
    const opts = this.opts;
    this.stats.proposals++;
    const longest = Math.min(Math.max(2, opts.cycleMax), S);
    const k = longest === 2 || rng() < opts.pairProb ? 2 : 3 + Math.floor(rng() * (longest - 2));
    // k distinct slots (partial Fisher–Yates), one uniformly chosen card each.
    const order = this.order;
    for (let i = 0; i < S; i++) order[i] = i;
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (S - i));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    const slots = this.moveSlots;
    const cards = this.moveCards;
    for (let i = 0; i < k; i++) {
      const slot = order[i];
      slots[i] = slot;
      cards[i] = chain.cards[slot][Math.floor(rng() * this.cap[slot])];
    }
    // Card i moves to slot i+1; a void there rejects the whole move.
    for (let i = 0; i < k; i++) {
      const seat = this.slotSeat[slots[(i + 1) % k]];
      if (seat >= 0 && !allowed(this.root, seat, cards[i])) {
        this.stats.voidRejects++;
        return;
      }
    }
    const owner = chain.world.owner;
    for (let i = 0; i < k; i++) {
      const seat = this.slotSeat[slots[(i + 1) % k]];
      owner[cards[i]] = seat < 0 ? OUT : seat;
    }
    let delta = 0;
    if (this.model) {
      for (let i = 0; i < k; i++) {
        const seat = this.slotSeat[slots[i]];
        if (seat < 0) continue;
        const l = this.seatLogL(chain.world, seat);
        this.newL[i] = l;
        delta += l - chain.logL[seat];
      }
    }
    if (delta < 0 && rng() >= Math.exp(delta)) {
      // Reject: put every card back.
      for (let i = 0; i < k; i++) {
        const seat = this.slotSeat[slots[i]];
        owner[cards[i]] = seat < 0 ? OUT : seat;
      }
      return;
    }
    this.stats.accepted++;
    for (let i = 0; i < k; i++) {
      const seat = this.slotSeat[slots[i]];
      if (seat >= 0 && this.model) chain.logL[seat] = this.newL[i];
      this.oldPos[i] = chain.pos[cards[i]];
    }
    // Slot i+1 gave card i+1 and receives card i: reuse the vacated position.
    for (let i = 0; i < k; i++) {
      const to = slots[(i + 1) % k];
      const p = this.oldPos[(i + 1) % k];
      chain.cards[to][p] = cards[i];
      chain.pos[cards[i]] = p;
    }
  }
}
