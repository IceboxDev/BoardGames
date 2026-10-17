// Stand-in bots for the online game, so one person can play it alone: as
// the Storyteller with a bot town, or as a player with a bot Storyteller
// and bot neighbours. They are deliberately dumb — scripted, seeded and
// fair — and a real AI replaces them later behind the same seam:
//
//   nextBotPlan(game, bots) → what the next bot does, and when
//   runBotPlan(game, plan)  → the game after it (through `applyOnline`)
//
// A bot PLAYER decides from its own `playerView` only, so it can't know
// anything its seat doesn't. The bot STORYTELLER reads the whole game, as a
// Storyteller does. Both move through the same actions a person sends.

import { CHARACTERS, type CharacterId, sheetOrderOf } from "../characters.ts";
import { currentNightStep, nightStepId, winPrompts } from "../companion.ts";
import { slayerShot } from "../decisions.ts";
import { type InfoPayload, suggestedInfo } from "../info.ts";
import { STORYTELLER_SEAT } from "../manifest.ts";
import type { CompanionState } from "../schema.ts";
import { type WakeChoice, wakePrompt, wakersOf } from "../wake-prompts.ts";
import {
  type OnlineAction,
  type PlayerAction,
  STORYTELLER_KINDS,
  StorytellerActionSchema,
  type StorytellerMove,
} from "./actions.ts";
import { applyOnline, chairOf, nameOf, roomSeatOf } from "./apply.ts";
import { resolutionsFor } from "./resolutions.ts";
import type { BotcOnline, DayTimerKind, RoomSeat } from "./state.ts";
import { type PlayerView, playerView } from "./view.ts";

/** Bot town names, by room seat. */
export const BOT_NAMES = [
  "Storyteller",
  "Ada",
  "Basil",
  "Clara",
  "Dorian",
  "Edith",
  "Felix",
  "Greta",
  "Hugo",
  "Iris",
  "Jasper",
  "Kit",
  "Lena",
  "Milo",
  "Nell",
  "Otto",
  "Pip",
  "Quinn",
  "Rosa",
  "Silas",
  "Tess",
] as const;

// How long a bot "takes", in ms after the last thing that happened.
const READ_MS = 900;
const THINK_MS = 1600;
const HAND_MS = 250;
const ST_MS = 1300;
/** After "Night N falls": the town has a moment before anyone is woken. */
const NIGHTFALL_MS = 3500;
/** The night's last beat before the town wakes. */
const DAWN_MS = 2500;
/** After dawn, before the discussion timer starts (the deaths sink in). */
const MORNING_MS = 3000;

// The bot Storyteller runs the day on timers everyone sees; it moves on when
// one runs out, or sooner once every person in the town says they're ready.
const DISCUSSION_S = 60;
const NOMINATIONS_S = 60;
/** Nominations stay open this much longer after each vote. */
const MORE_NOMINATIONS_S = 30;
/** A nomination's accusation and defence, before the clock starts. */
const DEFENCE_S = 10;
/** Between the last vote and nightfall. */
const DUSK_S = 6;

export type BotMove = PlayerAction | StorytellerMove;

/** One bot's next beat: the actions it sends, in order, once `at` comes. */
export interface BotPlan {
  readonly seat: RoomSeat;
  readonly actions: readonly BotMove[];
  /** Epoch ms. */
  readonly at: number;
  /** Breaks ties between plans due at once (lower goes first). */
  readonly priority?: number;
}

/** A stable roll in [0, 1) for one bot decision: the same game and question, the same answer. */
function roll(seed: number, ...parts: (string | number)[]): number {
  let h = seed ^ 0x9e3779b9;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** A seeded pick-n from `from`. */
function pickSome<T>(from: readonly T[], n: number, seed: number, salt: string): T[] {
  return [...from]
    .map((x, i) => ({ x, k: roll(seed, salt, i) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((e) => e.x);
}

function lastActionAt(game: BotcOnline): number {
  return game.log.at(-1)?.at ?? 0;
}

const plan = (seat: RoomSeat, actions: BotMove[], at: number, priority = 0): BotPlan => ({
  seat,
  actions,
  at,
  priority,
});

// ── Bot players ─────────────────────────────────────────────────────────

/** What the seat's own view says about its team: am I evil, and who are my fellows. */
function knowledgeOf(view: PlayerView): { evil: boolean; fellows: Set<RoomSeat> } {
  const shown = view.me.shown;
  const type = shown ? CHARACTERS[shown.character].type : undefined;
  const evil = shown?.alignment === "evil" || type === "minion" || type === "demon";
  const fellows = new Set<RoomSeat>();
  for (const d of view.me.inbox) {
    if (d.payload.kind !== "evil-team") continue;
    if (d.payload.demon !== undefined) fellows.add(d.payload.demon);
    for (const m of d.payload.minions) fellows.add(m);
  }
  fellows.delete(view.you);
  return { evil, fellows };
}

/** The day's dawn on the timeline (when the town woke), or `null` before the first. */
function dawnAt(view: { timeline: readonly { kind: string; text: string; at: number }[] }) {
  for (let i = view.timeline.length - 1; i >= 0; i--) {
    const t = view.timeline[i];
    if (t?.kind === "phase" && t.text.startsWith("Day ")) return t.at;
  }
  return null;
}

function nightChoice(view: PlayerView, seed: number): PlayerAction | null {
  const wake = view.me.wake;
  if (!wake || wake.choice) return null;
  const prompt = wake.prompt;
  const { evil, fellows } = knowledgeOf(view);
  const salt = `${wake.stepId}:${view.phase.kind === "night" ? view.phase.number : 0}`;
  const script = sheetOrderOf(view.edition).filter((c) => CHARACTERS[c].type !== "traveller");
  const someCharacter = () =>
    script[Math.floor(roll(seed, view.you, salt, "character") * script.length)];

  const pickPlayers = (min: number, max: number, ok: (seat: RoomSeat) => boolean) => {
    const open = view.town.filter((t) => !t.left && ok(t.seat));
    const pool = open.map((t) => t.seat);
    // Point at the living and away from yourself; evil bots spare their own
    // while there is anyone else (an Imp with only Minions left kills one).
    const living = open.filter((t) => t.alive && t.seat !== view.you).map((t) => t.seat);
    const strangers = living.filter((seat) => !(evil && fellows.has(seat)));
    const enough = (list: RoomSeat[]) => list.length >= Math.max(1, min);
    const from = enough(strangers) ? strangers : enough(living) ? living : pool;
    const n = Math.min(max, from.length);
    return n < min ? null : pickSome(from, n, seed, `${view.you}:${salt}`);
  };

  switch (prompt.kind) {
    case "info":
      return null;
    case "players": {
      const seats = pickPlayers(prompt.min, prompt.max, (s) => {
        const t = view.town.find((x) => x.seat === s);
        if (!t) return false;
        if (!prompt.allowSelf && s === view.you) return false;
        if (prompt.excluded.includes(s)) return false;
        if (prompt.filter === "alive" && !t.alive) return false;
        if (prompt.filter === "dead" && t.alive) return false;
        return true;
      });
      return seats ? { kind: "night-choice", stepId: wake.stepId, choice: { seats } } : null;
    }
    case "character": {
      const character = someCharacter();
      return character
        ? { kind: "night-choice", stepId: wake.stepId, choice: { seats: [], character } }
        : null;
    }
    case "player-and-character": {
      const seats = pickPlayers(1, 1, (s) => s !== view.you);
      const character = someCharacter();
      return seats && character
        ? { kind: "night-choice", stepId: wake.stepId, choice: { seats, character } }
        : null;
    }
  }
}

/** A line for the town square: the character this bot says it is. */
function claimLine(view: PlayerView, seed: number): string | null {
  const shown = view.me.shown;
  if (!shown) return null;
  const { evil } = knowledgeOf(view);
  let claim: CharacterId = shown.character;
  if (evil) {
    // Bluff: the Demon's bluffs when it has them, else any Townsfolk.
    const bluffs = view.me.inbox.flatMap((d) =>
      d.payload.kind === "evil-team" ? (d.payload.bluffs ?? []) : [],
    );
    const townsfolk = sheetOrderOf(view.edition).filter((c) => CHARACTERS[c].type === "townsfolk");
    const pool = bluffs.length > 0 ? bluffs : townsfolk;
    claim = pool[Math.floor(roll(seed, view.you, "bluff") * pool.length)] ?? claim;
  }
  const lines = [
    `I'm the ${CHARACTERS[claim].name}.`,
    `For what it's worth, I'm the ${CHARACTERS[claim].name}.`,
    `${CHARACTERS[claim].name} here. Nothing useful yet.`,
  ];
  const night = view.phase.kind === "day" ? view.phase.number : 0;
  return lines[Math.floor(roll(seed, view.you, "line", night) * lines.length)] ?? null;
}

function playerPlan(game: BotcOnline, seat: RoomSeat, last: number): BotPlan | null {
  const view = playerView(game, seat);
  if (view.stage === "over") return null;
  const seed = game.seed;
  const me = view.town.find((t) => t.seat === seat);

  const unread = view.me.inbox.find((d) => !d.read);
  if (unread) return plan(seat, [{ kind: "dismiss-info", id: unread.id }], last + READ_MS);
  if (view.me.shown && !view.me.shown.acknowledged) {
    return plan(seat, [{ kind: "ack-character" }], last + READ_MS);
  }

  const choice = nightChoice(view, seed);
  if (choice) return plan(seat, [choice], last + THINK_MS);

  if (view.phase.kind !== "day" || !me || me.left) return null;
  const day = view.phase.number;
  const { evil, fellows } = knowledgeOf(view);

  const vote = view.day.vote;
  if (vote && vote.status !== "done") {
    const at = vote.order.indexOf(seat);
    if (at < vote.locked || at === -1 || vote.hands[at]) return null;
    if (!me.alive && !me.ghostVote && vote.kind === "execution") return null;
    // Evil bots shield their own and pile onto the good; the dead save their one vote.
    const lean = evil ? (fellows.has(vote.nominee) ? 0.05 : 0.7) : 0.45;
    const chance = me.alive || vote.kind === "exile" ? lean : lean * 0.3;
    if (vote.nominee === seat || roll(seed, seat, "hand", day, vote.nominee) >= chance) return null;
    // A hand goes up as the clock hand comes round to it, so the town sees
    // the vote happen voter by voter.
    if (vote.status !== "running" || at !== vote.locked || vote.nextTickAt === null) return null;
    const lift = 400 + Math.floor(roll(seed, seat, "lift", day, vote.nominee) * 600);
    return plan(
      seat,
      [{ kind: "hand", up: true }],
      Math.max(last + HAND_MS, vote.nextTickAt - lift),
      at,
    );
  }

  // Say who you are, once a day, during the discussion.
  const dawn = dawnAt(view);
  const timer = view.day.timer ?? null;
  if (
    dawn !== null &&
    me.alive &&
    view.chatSettings.publicOpen &&
    !view.day.nominationsOpen &&
    roll(seed, seat, "talk", day) < 0.6 &&
    !view.chat.some((m) => m.from === seat && m.at >= dawn)
  ) {
    const text = claimLine(view, seed);
    if (text && timer?.kind === "discussion") {
      const span = Math.max(0, timer.endsAt - timer.startedAt - 8000);
      const at = timer.startedAt + 3000 + Math.floor(roll(seed, seat, "talk-at", day) * span);
      return plan(seat, [{ kind: "chat", text }], Math.max(at, last + READ_MS));
    }
  }

  // Maybe nominate someone while the nominations timer runs and the floor is clear.
  const settled = !vote || vote.result !== undefined;
  if (
    view.day.nominationsOpen &&
    timer?.kind === "nominations" &&
    settled &&
    me.alive &&
    !view.day.nominators.includes(seat) &&
    roll(seed, seat, "nominate", day) < 0.35
  ) {
    const pool = view.town
      .filter(
        (t) =>
          t.seat !== seat &&
          t.alive &&
          !t.left &&
          !t.traveller &&
          !view.day.nominees.includes(t.seat) &&
          !(evil && fellows.has(t.seat)),
      )
      .map((t) => t.seat);
    const [nominee] = pickSome(pool, 1, seed, `nominee:${seat}:${day}`);
    if (nominee !== undefined) {
      // Somewhere in the timer's window, never in its last seconds.
      const span = Math.max(0, timer.endsAt - timer.startedAt - 12_000);
      const offset = roll(seed, seat, "nominate-at", day, view.day.nominees.length) * span;
      const at = Math.max(last + 2500, timer.startedAt + 6000 + Math.floor(offset));
      if (at < timer.endsAt - 3000) return plan(seat, [{ kind: "nominate", nominee }], at);
    }
  }
  return null;
}

// ── The bot Storyteller ─────────────────────────────────────────────────

/** A drunk or poisoned player is told something a little off; everyone else the truth. */
function shade(payload: InfoPayload, voided: boolean): InfoPayload {
  if (!voided) return payload;
  if (payload.kind === "number") return { ...payload, value: payload.value + 1 };
  if (payload.kind === "yes-no") return { ...payload, value: !payload.value };
  return payload;
}

function stepSeed(seed: number, night: number, id: string): () => number {
  let n = 0;
  return () => roll(seed, "info", night, id, n++);
}

/** The night, one step a beat: wake, wait for an answer, apply it, tell them, move on. */
function nightBeat(game: BotcOnline, state: CompanionState): BotMove[] | null {
  const step = currentNightStep(state);
  if (!step) return null;
  if (step.kind === "dawn") return [{ kind: "dawn" }];
  const next: BotMove = {
    kind: "grimoire",
    action: { type: "moveNightCursor", delta: 1 },
    label: "Move the night on",
  };
  const id = nightStepId(step);
  const wakers = wakersOf(state, step).flatMap((c) => {
    const rs = roomSeatOf(game, c);
    return rs === undefined ? [] : [rs];
  });
  // Nobody to wake (a Storyteller-only step): leave it be.
  if (wakers.length === 0) return [next];
  if (game.wake?.stepId !== id) return [{ kind: "wake", stepId: id }];

  const asks = step.kind === "wake" && wakePrompt(state, step).kind !== "info";
  const answer = Object.values(game.wake.choices)[0];
  if (asks && !answer) return null; // their move
  const choice: WakeChoice | undefined = answer
    ? {
        seats: answer.seats.flatMap((rs) => {
          const c = chairOf(game, rs);
          return c === undefined ? [] : [c];
        }),
        ...(answer.character ? { character: answer.character } : {}),
      }
    : undefined;

  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const actions: BotMove[] = [];
  const [resolution] = resolutionsFor(state, step, choice);
  if (resolution)
    actions.push({ kind: "grimoire", action: resolution.action, label: resolution.label });
  const told = suggestedInfo(state, step, {
    ...(choice ? { choice } : {}),
    seatId: (c) => roomSeatOf(game, c) ?? c,
    rng: stepSeed(game.seed, night, id),
  });
  if (told) {
    actions.push({
      kind: "send-info",
      to: wakers,
      payload: shade(told.payload, told.voided),
      record: true,
    });
  }
  actions.push({ kind: "sleep" }, next);
  return actions;
}

/** The Storyteller's ruling on a claim: only a real, sober Slayer's shot does anything. */
function ruleOn(game: BotcOnline, state: CompanionState): BotMove[] | null {
  const req = game.requests.find((r) => r.status === "open");
  if (!req) return null;
  const shooter = chairOf(game, req.from);
  const target = req.targets[0] !== undefined ? chairOf(game, req.targets[0]) : undefined;
  if (req.kind === "slayer" && shooter !== undefined && target !== undefined) {
    const dies = slayerShot(state, shooter, target).kind === "dies";
    return [
      { kind: "grimoire", action: { type: "recordSlayerShot", shooter, target, dies } },
      {
        kind: "resolve-request",
        id: req.id,
        status: "resolved",
        note: dies ? `${nameOf(game, req.targets[0] ?? 0)} dies.` : "Nothing happens.",
      },
    ];
  }
  return [{ kind: "resolve-request", id: req.id, status: "dismissed", note: "Nothing happens." }];
}

/** The game's end when the Grimoire says it's decided (the Scarlet Woman steps up instead). */
function judge(state: CompanionState): BotMove[] | null {
  const [prompt] = winPrompts(state);
  if (!prompt) return null;
  switch (prompt.kind) {
    case "good-wins":
      return [{ kind: "end-game", winner: "good", reason: prompt.reason }];
    case "evil-wins":
      return [{ kind: "end-game", winner: "evil", reason: prompt.reason }];
    case "scarlet-woman": {
      const demon = state.players.find((p) => !p.alive && CHARACTERS[p.character].type === "demon");
      return [
        {
          kind: "grimoire",
          action: {
            type: "changeCharacter",
            seat: prompt.seat,
            character: demon?.character ?? "imp",
          },
          label: "The Scarlet Woman becomes the Demon",
        },
      ];
    }
    // A stand-in can't run the Mastermind's extra day: the Demon is dead, good wins.
    case "mastermind":
      return [{ kind: "end-game", winner: "good", reason: "the Demon is dead" }];
  }
}

/** When the current night fell (its "Night N falls." line), or `null`. */
function nightfallAt(game: BotcOnline): number | null {
  for (let i = game.timeline.length - 1; i >= 0; i--) {
    const t = game.timeline[i];
    if (t?.kind === "phase" && t.text.startsWith("Night ")) return t.at;
  }
  return null;
}

/** Every person playing in the town has said they're ready (never true with nobody to ask). */
function everyoneReady(game: BotcOnline, bots: readonly RoomSeat[]): boolean {
  const people = (game.companion?.players ?? []).flatMap((p) =>
    p.roomSeat === undefined || p.left || bots.includes(p.roomSeat) ? [] : [p.roomSeat],
  );
  const ready = game.day.ready ?? [];
  return people.length > 0 && people.every((s) => ready.includes(s));
}

const startTimer = (timer: DayTimerKind, seconds: number): BotMove => ({
  kind: "timer",
  timer,
  seconds,
});

/** The day, on timers: discussion → nominations (each with its defence and vote) → dusk. */
function dayPlan(
  game: BotcOnline,
  state: CompanionState,
  last: number,
  bots: readonly RoomSeat[],
  beat: (actions: BotMove[] | null, at?: number) => BotPlan | null,
): BotPlan | null {
  const ruling = ruleOn(game, state);
  if (ruling) return beat(ruling);
  const end = judge(state);
  if (end) return beat(end);

  const day = game.day;
  const timer = day.timer ?? null;
  const ready = everyoneReady(game, bots);
  /** When a timer's part of the day is over: it ran out, or everyone is ready. */
  const after = (t: { endsAt: number }) =>
    ready ? last + ST_MS : Math.max(last + ST_MS, t.endsAt);

  const vote = day.vote;
  if (vote?.status === "open") {
    if (timer?.kind !== "defence") return beat([startTimer("defence", DEFENCE_S)], last + 600);
    return beat([{ kind: "start-vote" }], after(timer));
  }
  if (vote?.status === "paused") return beat([{ kind: "resume-vote" }]);
  if (vote?.status === "running") return null;
  if (vote?.status === "done" && !vote.result) {
    return beat([{ kind: "confirm-vote" }, startTimer("nominations", MORE_NOMINATIONS_S)]);
  }

  if (timer?.kind === "dusk") return beat([{ kind: "end-day" }], after(timer));
  if (!day.nominationsOpen) {
    if (timer?.kind === "discussion") {
      return beat(
        [{ kind: "nominations", open: true }, startTimer("nominations", NOMINATIONS_S)],
        after(timer),
      );
    }
    return beat([startTimer("discussion", DISCUSSION_S)], last + MORNING_MS);
  }
  if (timer?.kind !== "nominations") return beat([startTimer("nominations", NOMINATIONS_S)]);
  // Nominations are over: close them, execute whoever is on the block, then dusk.
  const executeFirst = state.day.aboutToDie && state.day.executed === undefined;
  return beat(
    [
      { kind: "nominations", open: false },
      ...(executeFirst
        ? [{ kind: "execute" } as const]
        : [{ kind: "announce", text: "Nobody is executed today." } as const]),
      startTimer("dusk", DUSK_S),
    ],
    after(timer),
  );
}

function storytellerPlan(
  game: BotcOnline,
  last: number,
  bots: readonly RoomSeat[],
): BotPlan | null {
  const st = STORYTELLER_SEAT;
  const beat = (actions: BotMove[] | null, at = last + ST_MS) =>
    actions ? plan(st, actions, at, -1) : null;
  switch (game.stage) {
    case "over":
      return null;
    case "setup":
      return game.setup?.bag ? beat([{ kind: "deal" }]) : null;
    case "reveal": {
      if (!game.shown.some(Boolean)) return beat([{ kind: "reveal-characters" }]);
      const seen = (game.companion?.players ?? []).every(
        (p) => p.roomSeat === undefined || game.shown[p.roomSeat]?.acknowledged,
      );
      return seen ? beat([{ kind: "begin-night" }]) : null;
    }
    case "play":
      break;
  }
  const state = game.companion;
  if (!state) return null;
  if (state.phase.kind === "night") {
    const actions = nightBeat(game, state);
    if (!actions) return null;
    const fell = nightfallAt(game) ?? last;
    const hold = actions[0]?.kind === "dawn" ? last + DAWN_MS : fell + NIGHTFALL_MS;
    return beat(actions, Math.max(last + ST_MS, hold));
  }
  if (state.phase.kind !== "day") return null;
  return dayPlan(game, state, last, bots, beat);
}

// ── The seam ────────────────────────────────────────────────────────────

/**
 * The next thing a bot does, and when — the earliest of every bot's plan.
 * `skip` holds seats whose plan was just refused, until the game moves on.
 */
export function nextBotPlan(
  game: BotcOnline,
  bots: readonly RoomSeat[],
  skip: ReadonlySet<RoomSeat> = new Set(),
): BotPlan | null {
  if (game.stage === "over" || bots.length === 0) return null;
  const last = lastActionAt(game);
  let best: BotPlan | null = null;
  for (const seat of bots) {
    if (skip.has(seat)) continue;
    const p =
      seat === STORYTELLER_SEAT ? storytellerPlan(game, last, bots) : playerPlan(game, seat, last);
    if (!p) continue;
    if (!best || p.at < best.at || (p.at === best.at && (p.priority ?? 0) < (best.priority ?? 0))) {
      best = p;
    }
  }
  return best;
}

function isStorytellerMove(move: BotMove): move is StorytellerMove {
  return STORYTELLER_KINDS.has(move.kind);
}

/** Stamp a Storyteller move with the revision it is made against. */
function toAction(game: BotcOnline, move: BotMove): OnlineAction | null {
  if (!isStorytellerMove(move)) return move;
  const parsed = StorytellerActionSchema.safeParse({ ...move, rev: game.rev });
  return parsed.success ? parsed.data : null;
}

/**
 * Play `plan`'s actions in order through `applyOnline`. Returns the game after
 * them, and whether the first was refused (the caller then skips that bot
 * until something else happens).
 */
export function runBotPlan(
  game: BotcOnline,
  botPlan: BotPlan,
  now: number,
): { game: BotcOnline; refused: string | null } {
  let next = game;
  for (const move of botPlan.actions) {
    const action = toAction(next, move);
    const result = action
      ? applyOnline(next, botPlan.seat, action, now)
      : { ok: false as const, reason: "malformed bot action" };
    if (!result.ok) {
      return { game: next, refused: next === game ? result.reason : null };
    }
    next = result.game;
  }
  return { game: next, refused: null };
}
