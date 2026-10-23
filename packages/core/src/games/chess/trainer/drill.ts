/**
 * The opening drill: learning your own moves with spaced repetition.
 *
 * A card is a position where it is your move in a colour's tree and the tree
 * has settled what you play (`status: "done"` with its one move). The card's
 * id is the node's key (the position key), so a card follows the tree: when a
 * rebuild changes your move there, the card asks for the new one. Positions
 * still waiting for the analysis farm (`awaiting-eval`) are not cards yet;
 * they count as pending, learnable once their analysis lands.
 *
 * What a card's schedule means (the shared `trainers/srs.ts` states):
 *   no row yet               new (ready to learn)
 *   learning / relearning    learning
 *   review                   learnt
 * A card is due when its due date is today or earlier, but reviews come by
 * FOLDER: when one card in a folder (the deepest folder owning it) is due,
 * every card you've already met there is dealt with it, shuffled, so you
 * tell that folder's lines apart instead of recalling one position alone.
 */
import {
  buildDailyQueue,
  type QueueTier,
  type SrsState,
  seededShuffle,
} from "../../../trainers/srs.ts";
import type { RepertoireTree } from "./tree.ts";

export interface DrillCard {
  /** The node's key: the card id. */
  readonly key: string;
  readonly fen: string;
  /** Your move here. */
  readonly uci: string;
  readonly san: string;
  /** Games that reached the position following the tree: how much it matters. */
  readonly following: number;
  readonly ply: number;
}

/** Every learnable position of yours in `tree`. */
export function drillCards(tree: RepertoireTree): DrillCard[] {
  const out: DrillCard[] = [];
  for (const [key, node] of Object.entries(tree.nodes)) {
    const move = node.moves[0];
    if (node.side !== "user" || node.status !== "done" || !move) continue;
    out.push({
      key,
      fen: node.fen,
      uci: move.uci,
      san: move.san,
      following: node.following,
      ply: node.ply,
    });
  }
  return out;
}

/** Your positions still waiting for the analysis farm. */
export function pendingKeys(tree: RepertoireTree): string[] {
  return Object.entries(tree.nodes)
    .filter(([, n]) => n.side === "user" && n.status === "awaiting-eval")
    .map(([key]) => key);
}

export type CardStage = "new" | "learning" | "learnt";

export function stageOf(state: SrsState | undefined): CardStage {
  if (!state) return "new";
  return state.state === "review" ? "learnt" : "learning";
}

export interface Learning {
  learnt: number;
  learning: number;
  fresh: number;
  /** Moves to review today: every met card of a folder that has one due. */
  due: number;
  /** Moves you answered today. */
  practisedToday: number;
  /** Your positions the farm is analysing (in its folders): learnable once done. */
  pending: number;
  /** Of `pending`, the ones on your game lines (not a line end's extension). */
  pendingLines: number;
  /** Your positions outside the farm's folders: never analysed, so not learnable. */
  unasked: number;
  /**
   * Folders here (this one or below) with games of yours that the tree hasn't
   * grown into yet: the way in waits at a position the farm hasn't settled.
   */
  unreached: number;
}

export const emptyLearning = (): Learning => ({
  learnt: 0,
  learning: 0,
  fresh: 0,
  due: 0,
  practisedToday: 0,
  pending: 0,
  pendingLines: 0,
  unasked: 0,
  unreached: 0,
});

/**
 * Every one of your moves on your game lines is analysed: nothing here waits
 * for the farm except, perhaps, extensions past your games.
 */
export const analysedUpToDate = (l: Learning): boolean =>
  learnable(l) > 0 && l.pendingLines === 0 && l.unasked === 0 && l.unreached === 0;

/**
 * Everything here is analysed, the extensions past your games included: no
 * position of yours waits for the farm or lies outside it.
 */
export const analysedComplete = (l: Learning): boolean => analysedUpToDate(l) && l.pending === 0;

/** All your learnable moves in a summary: learnt + learning + fresh. */
export const learnable = (l: Learning): number => l.learnt + l.learning + l.fresh;

/**
 * Learning per folder, each folder including its subfolders. `ownerOf` maps
 * a position key to the deepest folder that owns it (positions outside every
 * folder count only for the total); `parentOf` walks a folder up to its root.
 */
export function learningByFolder(input: {
  readonly cards: readonly DrillCard[];
  readonly pending: readonly string[];
  /** Whether a pending position is a line end's extension (it doesn't hold a folder back). */
  readonly isExtension?: (key: string) => boolean;
  readonly unasked?: readonly string[];
  /** Folders the tree hasn't grown into yet (see `Learning.unreached`). */
  readonly unreached?: readonly string[];
  readonly states: ReadonlyMap<string, SrsState>;
  readonly today: string;
  /** Whether a review's timestamp falls on `today` (in the member's time zone). */
  readonly isToday?: (iso: string) => boolean;
  readonly ownerOf: (key: string) => string | undefined;
  readonly parentOf: (folderId: string) => string | undefined;
}): { byFolder: Map<string, Learning>; total: Learning } {
  const due = dueGroups(input.cards, input.states, input.today, input.ownerOf);
  const byFolder = new Map<string, Learning>();
  const total = emptyLearning();
  const add = (key: string, apply: (l: Learning) => void) => {
    apply(total);
    for (let id = input.ownerOf(key); id; id = input.parentOf(id)) {
      let l = byFolder.get(id);
      if (!l) {
        l = emptyLearning();
        byFolder.set(id, l);
      }
      apply(l);
    }
  };
  for (const card of input.cards) {
    const state = input.states.get(card.key);
    const stage = stageOf(state);
    const review = state !== undefined && due.has(groupOf(card.key, input.ownerOf));
    const today = !!state?.lastReviewedAt && !!input.isToday?.(state.lastReviewedAt);
    add(card.key, (l) => {
      if (stage === "learnt") l.learnt++;
      else if (stage === "learning") l.learning++;
      else l.fresh++;
      if (review) l.due++;
      if (today) l.practisedToday++;
    });
  }
  for (const key of input.pending) {
    const line = !input.isExtension?.(key);
    add(key, (l) => {
      l.pending++;
      if (line) l.pendingLines++;
    });
  }
  for (const key of input.unasked ?? []) add(key, (l) => l.unasked++);
  for (const folderId of input.unreached ?? []) {
    for (let id: string | undefined = folderId; id; id = input.parentOf(id)) {
      const l = byFolder.get(id) ?? emptyLearning();
      l.unreached++;
      byFolder.set(id, l);
    }
  }
  return { byFolder, total };
}

const groupOf = (key: string, ownerOf: (key: string) => string | undefined) => ownerOf(key) ?? "";

/** The folders (by `groupOf`) with a met card due today. */
function dueGroups(
  cards: readonly DrillCard[],
  states: ReadonlyMap<string, SrsState>,
  today: string,
  ownerOf: (key: string) => string | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const c of cards) {
    const s = states.get(c.key);
    if (s && s.dueDate <= today) out.add(groupOf(c.key, ownerOf));
  }
  return out;
}

export interface DrillQueueItem {
  readonly questionId: string;
  /** "neighbour": a met card not due itself, dealt because its folder is. */
  readonly tier: QueueTier | "neighbour";
}

/**
 * A session's cards. First the due folders, the most overdue first, each one
 * whole: every card you've met there, shuffled (a card due itself is
 * "learning" or "review", the rest "neighbour"). Whole folders are taken
 * while they fit `limit` (the first always). Then up to `newBudget` new
 * cards, a folder at a time, the most played positions first. Only `cards`
 * (one folder's, or all) are dealt.
 */
export function drillQueue(input: {
  readonly cards: readonly DrillCard[];
  readonly states: ReadonlyMap<string, SrsState>;
  readonly today: string;
  readonly newBudget: number;
  readonly limit: number;
  /** The deepest folder owning a position: the unit reviews come in. */
  readonly ownerOf?: (key: string) => string | undefined;
  /** Seeds each folder's shuffle (a reload deals the same order). */
  readonly seed?: number;
  /**
   * Study the folder whole (a session of one folder): every card you've met
   * there is dealt, due or not, besides every new one; nothing is cut.
   */
  readonly whole?: boolean;
}): DrillQueueItem[] {
  const ownerOf = input.ownerOf ?? (() => undefined);
  const due = input.whole
    ? new Set(
        input.cards.filter((c) => input.states.has(c.key)).map((c) => groupOf(c.key, ownerOf)),
      )
    : dueGroups(input.cards, input.states, input.today, ownerOf);
  const limit = input.whole ? Number.POSITIVE_INFINITY : input.limit;
  const groups = new Map<string, { first: string; items: DrillQueueItem[] }>();
  for (const c of input.cards) {
    const s = input.states.get(c.key);
    const g = groupOf(c.key, ownerOf);
    if (!s || !due.has(g)) continue;
    const isDue = s.dueDate <= input.today;
    const tier = !isDue ? "neighbour" : s.state === "review" ? "review" : "learning";
    const group = groups.get(g) ?? { first: s.dueDate, items: [] };
    if (isDue && s.dueDate < group.first) group.first = s.dueDate;
    group.items.push({ questionId: c.key, tier });
    groups.set(g, group);
  }
  const reviews: DrillQueueItem[] = [];
  const ordered = [...groups.entries()].sort(
    ([a, x], [b, y]) => x.first.localeCompare(y.first) || a.localeCompare(b),
  );
  for (const [g, { items }] of ordered) {
    if (reviews.length > 0 && reviews.length + items.length > limit) continue;
    const sorted = [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
    reviews.push(...seededShuffle(sorted, (input.seed ?? 1) + hash(g)));
  }
  // New moves a folder at a time (the folder of the most played first), cut at the budget.
  const byPlay = [...input.cards].sort(
    (a, b) => b.following - a.following || a.ply - b.ply || a.key.localeCompare(b.key),
  );
  const folderRank = new Map<string, number>();
  for (const c of byPlay) {
    const g = groupOf(c.key, ownerOf);
    if (!folderRank.has(g)) folderRank.set(g, folderRank.size);
  }
  const rank = (key: string) => folderRank.get(groupOf(key, ownerOf)) ?? 0;
  const newOrder = byPlay.map((c) => c.key).sort((a, b) => rank(a) - rank(b));
  const fresh = buildDailyQueue({
    due: [],
    seenIds: new Set(input.states.keys()),
    newOrder,
    newRemaining: input.whole ? Number.POSITIVE_INFINITY : input.newBudget,
    limit: Math.max(0, limit - reviews.length),
    includeLeeches: true,
    articleOf: (id) => id,
  });
  return [...reviews, ...fresh];
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Your shakiest cards: the most lapses first. */
export function weakestCards(
  cards: readonly DrillCard[],
  states: ReadonlyMap<string, SrsState>,
  limit: number,
): { card: DrillCard; lapses: number }[] {
  return cards
    .flatMap((card) => {
      const lapses = states.get(card.key)?.lapses ?? 0;
      return lapses > 0 ? [{ card, lapses }] : [];
    })
    .sort((a, b) => b.lapses - a.lapses || b.card.following - a.card.following)
    .slice(0, limit);
}
