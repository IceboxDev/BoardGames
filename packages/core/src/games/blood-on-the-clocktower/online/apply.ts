// The online game's one reducer: `applyOnline(game, seat, action, now)`.
//
// Pure — `now` comes from the machine, randomness from `game.rngState`. It
// refuses with a reason instead of throwing, so the server's validator can ask
// "would this apply?" before the machine applies it for real.
//
// The rules of who may do what are the TOWN's rules, judged on what the town
// knows: a nomination checks public life and today's public nominations, a
// raised hand checks public ghost votes. The Storyteller's truth (who is
// really the Butler, who died an hour ago in the dark) is never consulted for
// a player's move, because a refusal would leak it.

import { rngFrom } from "../../../lib/rng.ts";
import { applyCompanionAction } from "../actions.ts";
import {
  apparentCharacter,
  beginNight,
  dawn,
  endDay,
  endGame,
  executeAboutToDie,
  exileTraveller,
  exileVotesRequired,
  isTraveller,
  nightQueue,
  nightStepId,
  recordInfoGiven,
} from "../companion.ts";
import { describeInfo, type InfoPayload } from "../info.ts";
import type { CompanionPlayer, CompanionState } from "../schema.ts";
import { recordVote, voteOrder } from "../voting.ts";
import { choiceProblem, wakePrompt, wakersOf } from "../wake-prompts.ts";
import type { OnlineAction, PlayerAction, StorytellerAction } from "./actions.ts";
import { STORYTELLER_KINDS } from "./actions.ts";
import * as setupStage from "./setup-stage.ts";
import {
  type BotcOnline,
  CHAT_LIMIT,
  EMPTY_DAY,
  HISTORY_LIMIT,
  type OnlineChoice,
  type RequestKind,
  type RoomSeat,
  type TimelineEntry,
  type UndoEntry,
  type Vote,
} from "./state.ts";

export const STORYTELLER: RoomSeat = 0;

export type Applied = { ok: true; game: BotcOnline } | { ok: false; reason: string };

const ok = (game: BotcOnline): Applied => ({ ok: true, game });
const no = (reason: string): Applied => ({ ok: false, reason });

/** Storyteller actions that must be made against the state the screen showed. */
const REV_CHECKED = new Set([
  "setup-order",
  "setup-traveller",
  "setup-edition",
  "setup-reroll",
  "setup-swap-token",
  "setup-stand-in",
  "setup-demon-skill",
  "deal",
  "reveal-characters",
  "begin-night",
  "grimoire",
  "wake",
  "send-info",
  "show-character",
  "dawn",
  "confirm-vote",
  "execute",
  "end-day",
  "act-for",
  "undo",
  "redo",
  "end-game",
]);

// ── Lookups ──────────────────────────────────────────────────────────────

/** The chair of the person in `roomSeat`, if they sit in the circle. */
export function chairOf(game: BotcOnline, roomSeat: RoomSeat): number | undefined {
  return game.companion?.players.find((p) => p.roomSeat === roomSeat)?.seat;
}

/** The room seat of the person in `chair`. */
export function roomSeatOf(game: BotcOnline, chair: number): RoomSeat | undefined {
  return game.companion?.players[chair]?.roomSeat;
}

export function playerOf(game: BotcOnline, roomSeat: RoomSeat): CompanionPlayer | undefined {
  return game.companion?.players.find((p) => p.roomSeat === roomSeat);
}

export function nameOf(game: BotcOnline, roomSeat: RoomSeat): string {
  return game.names[roomSeat] ?? `Player ${roomSeat}`;
}

/** Players' room seats in circle order (the deal's order before it). */
export function circle(game: BotcOnline): RoomSeat[] {
  if (game.companion) {
    return game.companion.players.flatMap((p) => (p.roomSeat !== undefined ? [p.roomSeat] : []));
  }
  return game.setup?.order ?? [];
}

/** "Night 2", "Day 3", "Setup". */
export function whenLabel(game: BotcOnline): string {
  const phase = game.companion?.phase;
  if (!phase || phase.kind === "reveal") return "Setup";
  if (phase.kind === "night") return `Night ${phase.night}`;
  if (phase.kind === "day") return `Day ${phase.day}`;
  return "Game over";
}

function phaseKind(game: BotcOnline): "setup" | "reveal" | "night" | "day" | "ended" {
  if (!game.companion) return "setup";
  return game.companion.phase.kind;
}

/** A Traveller with this character is in town and alive — their presence is public. */
function travellerActive(game: BotcOnline, character: string): boolean {
  return (
    game.companion?.players.some(
      (p) => p.character === character && p.alive && !p.left && isTraveller(p),
    ) ?? false
  );
}

// ── Writers ──────────────────────────────────────────────────────────────

function nextId(game: BotcOnline): [number, BotcOnline] {
  return [game.nextId, { ...game, nextId: game.nextId + 1 }];
}

function publish(
  game: BotcOnline,
  kind: TimelineEntry["kind"],
  text: string,
  now: number,
  byStoryteller: boolean,
): BotcOnline {
  const [id, next] = nextId(game);
  return { ...next, timeline: [...next.timeline, { id, at: now, kind, text, byStoryteller }] };
}

function deliver(game: BotcOnline, to: RoomSeat, payload: InfoPayload, now: number): BotcOnline {
  const [id, next] = nextId(game);
  const inbox = next.inbox.map((list, seat) =>
    seat === to ? [...list, { id, at: now, when: whenLabel(next), payload, read: false }] : list,
  );
  let shown = next.shown;
  if (payload.kind === "you-are") {
    const before = shown[to];
    shown = shown.map((s, seat) =>
      seat === to
        ? {
            character: payload.character,
            ...(payload.alignment
              ? { alignment: payload.alignment }
              : before?.alignment
                ? { alignment: before.alignment }
                : {}),
            acknowledged: false,
          }
        : s,
    );
  }
  return { ...next, inbox, shown };
}

/** Whether the town may see the truth of who lives right now (never at night). */
function lifeIsVisible(game: BotcOnline): boolean {
  const kind = phaseKind(game);
  return kind === "day" || kind === "ended";
}

/**
 * Bring the town's view of who lives up to the truth and say what changed.
 * Only by day: at night deaths wait for dawn, whatever the Grimoire says.
 */
function syncLife(game: BotcOnline, now: number, framing: "dawn" | "day"): BotcOnline {
  if (!game.companion || !lifeIsVisible(game)) return game;
  const died: string[] = [];
  const revived: string[] = [];
  const publicLife = [...game.publicLife];
  for (const p of game.companion.players) {
    if (p.roomSeat === undefined) continue;
    const alive = p.alive && !p.left;
    if (publicLife[p.roomSeat] === alive) continue;
    publicLife[p.roomSeat] = alive;
    if (p.left) continue;
    (alive ? revived : died).push(nameOf(game, p.roomSeat));
  }
  let next: BotcOnline = { ...game, publicLife };
  if (framing === "dawn") {
    next = publish(
      next,
      "death",
      died.length === 0 ? "Nobody died in the night." : `${listNames(died)} died in the night.`,
      now,
      true,
    );
  } else if (died.length > 0) {
    next = publish(
      next,
      "death",
      `${listNames(died)} ${died.length === 1 ? "dies" : "die"}.`,
      now,
      true,
    );
  }
  if (revived.length > 0) {
    next = publish(
      next,
      "life",
      `${listNames(revived)} ${revived.length === 1 ? "is" : "are"} alive again.`,
      now,
      true,
    );
  }
  return next;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Take a snapshot for the Storyteller's undo before a step that changes the truth. */
function remember(game: BotcOnline, label: string): BotcOnline {
  const entry: UndoEntry = {
    label,
    stage: game.stage,
    companion: game.companion,
    day: game.day,
    publicLife: game.publicLife,
    wake: game.wake,
    timelineMark: game.nextId,
  };
  return { ...game, past: [...game.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

function restore(game: BotcOnline, entry: UndoEntry): BotcOnline {
  return {
    ...game,
    stage: entry.stage,
    companion: entry.companion,
    day: entry.day,
    publicLife: entry.publicLife,
    wake: entry.wake,
  };
}

function snapshotOf(game: BotcOnline, label: string): UndoEntry {
  return {
    label,
    stage: game.stage,
    companion: game.companion,
    day: game.day,
    publicLife: game.publicLife,
    wake: game.wake,
    timelineMark: game.nextId,
  };
}

/** After any change to the truth: a game the Grimoire ended is over for everyone. */
function settle(game: BotcOnline, now: number): BotcOnline {
  const phase = game.companion?.phase;
  if (phase?.kind !== "ended" || game.stage === "over") return game;
  const next = syncLife({ ...game, stage: "over", wake: null }, now, "day");
  return publish(
    next,
    "end",
    `${phase.winner === "good" ? "Good" : "Evil"} wins — ${phase.reason}`,
    now,
    true,
  );
}

interface TruthOptions {
  /** A public line that leads what the change makes known ("Ben is executed."). */
  readonly preface?: { kind: TimelineEntry["kind"]; text: string };
  /** "dawn": the night's deaths are announced together, even when there are none. */
  readonly framing?: "dawn" | "day";
  /** Applied to the state after the change, inside the same undo step. */
  readonly alsoSet?: (game: BotcOnline) => BotcOnline;
}

/**
 * Apply a Grimoire change as one undo step, then let the town see what it
 * can: a lead line, the deaths the day makes known, a game the Grimoire ended.
 */
function changeTruth(
  game: BotcOnline,
  label: string,
  now: number,
  change: (state: CompanionState) => CompanionState,
  opts: TruthOptions = {},
): Applied {
  if (!game.companion) return no("Deal the characters first");
  let companion: CompanionState;
  try {
    companion = change(game.companion);
  } catch (err) {
    return no(err instanceof Error ? err.message : "That didn't work");
  }
  if (companion === game.companion && !opts.preface) return ok(game);
  let next: BotcOnline = { ...remember(game, label), companion };
  if (opts.alsoSet) next = opts.alsoSet(next);
  if (opts.preface) next = publish(next, opts.preface.kind, opts.preface.text, now, true);
  return ok(settle(syncLife(next, now, opts.framing ?? "day"), now));
}

function rolled<T>(game: BotcOnline, fn: (rng: () => number) => T): [T, BotcOnline] {
  const carrier = { rngState: game.rngState };
  const value = fn(rngFrom(carrier));
  return [value, { ...game, rngState: carrier.rngState }];
}

// ── Votes ────────────────────────────────────────────────────────────────

/** Whether `roomSeat` may raise a hand in `vote`, judged on public facts only. */
export function handProblem(game: BotcOnline, vote: Vote, roomSeat: RoomSeat): string | null {
  const at = vote.order.indexOf(roomSeat);
  if (at === -1) return "You aren't in this vote";
  if (at < vote.locked) return "The clock has passed you";
  if (vote.status === "done") return "The vote is over";
  const p = playerOf(game, roomSeat);
  if (!p || p.left) return "You aren't in this vote";
  if (vote.kind === "exile") return null;
  const alive = game.publicLife[roomSeat] ?? false;
  if (travellerActive(game, "voudon")) {
    return !alive || p.character === "voudon"
      ? null
      : "While the Voudon lives, only the dead and the Voudon vote";
  }
  if (!alive) return p.ghostVote ? null : "You have used your ghost vote";
  if (p.character === "beggar" && isTraveller(p) && (p.beggarTokens ?? 0) === 0) {
    return "The Beggar needs a vote token to vote";
  }
  return null;
}

/** Move the clock hand on for every voter whose time is up. */
export function tickVote(game: BotcOnline, now: number): BotcOnline {
  const vote = game.day.vote;
  if (!vote || vote.status !== "running" || vote.nextTickAt === null) return game;
  let locked = vote.locked;
  let nextTickAt: number | null = vote.nextTickAt;
  while (nextTickAt !== null && now >= nextTickAt && locked < vote.order.length) {
    locked += 1;
    nextTickAt = locked >= vote.order.length ? null : nextTickAt + game.config.voteClockMs;
  }
  if (locked === vote.locked) return game;
  const done = locked >= vote.order.length;
  return {
    ...game,
    day: {
      ...game.day,
      vote: {
        ...vote,
        locked,
        nextTickAt: done ? null : nextTickAt,
        status: done ? "done" : "running",
      },
    },
  };
}

/** A seat's connection changed; the vote waits for a Storyteller who dropped. */
export function setConnected(game: BotcOnline, seat: RoomSeat, connected: boolean): BotcOnline {
  if (game.connected[seat] === connected) return game;
  let next: BotcOnline = {
    ...game,
    connected: game.connected.map((c, i) => (i === seat ? connected : c)),
  };
  const vote = next.day.vote;
  if (seat === STORYTELLER && !connected && vote?.status === "running") {
    next = { ...next, day: { ...next.day, vote: { ...vote, status: "paused", nextTickAt: null } } };
  }
  return next;
}

// ── Players ──────────────────────────────────────────────────────────────

function applyPlayer(
  game: BotcOnline,
  seat: RoomSeat,
  a: PlayerAction,
  now: number,
  bySt: boolean,
): Applied {
  const kind = phaseKind(game);
  const isSt = seat === STORYTELLER;
  switch (a.kind) {
    case "ack-character": {
      const shown = game.shown[seat];
      if (!shown) return no("You haven't been shown a character yet");
      if (shown.acknowledged) return ok(game);
      return ok({
        ...game,
        shown: game.shown.map((s, i) => (i === seat && s ? { ...s, acknowledged: true } : s)),
      });
    }

    case "dismiss-info": {
      const list = game.inbox[seat] ?? [];
      if (!list.some((d) => d.id === a.id)) return no("No such message");
      return ok({
        ...game,
        inbox: game.inbox.map((l, i) =>
          i === seat ? l.map((d) => (d.id === a.id ? { ...d, read: true } : d)) : l,
        ),
      });
    }

    case "chat": {
      if (!isSt && game.stage !== "over") {
        if (!game.chatSettings.publicOpen) return no("The Storyteller has closed the town square");
        if (kind === "night" && !game.config.publicChatAtNight) return no("The town is asleep");
      }
      const [id, next] = nextId(game);
      return ok({
        ...next,
        chat: [...next.chat, { id, at: now, from: seat, text: a.text }].slice(-CHAT_LIMIT),
      });
    }

    case "whisper": {
      if (a.to === seat) return no("You can't whisper to yourself");
      if (a.to < 0 || a.to >= game.names.length) return no("No such player");
      const toSt = a.to === STORYTELLER;
      if (!isSt && !toSt && !bySt && game.stage !== "over") {
        if (!game.config.whispers) return no("Whispers are off in this game");
        if (!game.chatSettings.whispersOpen) return no("The Storyteller has closed whispers");
        if (kind === "night") return no("The town is asleep");
        if (travellerActive(game, "matron")) {
          const ring = circle(game);
          const i = ring.indexOf(seat);
          const n = ring.length;
          const neighbours = i === -1 ? [] : [ring[(i + 1) % n], ring[(i - 1 + n) % n]];
          if (!neighbours.includes(a.to))
            return no("The Matron: you may only whisper to your neighbours");
        }
      }
      const [id, next] = nextId(game);
      return ok({
        ...next,
        whispers: [...next.whispers, { id, at: now, from: seat, to: a.to, text: a.text }].slice(
          -CHAT_LIMIT,
        ),
      });
    }

    case "night-choice": {
      const wake = game.wake;
      const state = game.companion;
      if (!wake || !state || wake.stepId !== a.stepId || !wake.seats.includes(seat)) {
        return no("You aren't awake for that");
      }
      const step = nightQueue(state).find((s) => nightStepId(s) === a.stepId);
      const chair = chairOf(game, seat);
      if (!step || chair === undefined) return no("That step is over");
      const chairs: number[] = [];
      for (const rs of a.choice.seats) {
        const c = chairOf(game, rs);
        if (c === undefined) return no("No such player");
        chairs.push(c);
      }
      const problem = choiceProblem(state, chair, wakePrompt(state, step), {
        seats: chairs,
        ...(a.choice.character ? { character: a.choice.character } : {}),
      });
      if (problem) return no(problem);
      const choice: OnlineChoice = {
        seats: [...a.choice.seats],
        ...(a.choice.character ? { character: a.choice.character } : {}),
      };
      return ok({
        ...game,
        wake: { ...wake, choices: { ...wake.choices, [String(seat)]: choice } },
      });
    }

    case "nominate": {
      if (kind !== "day") return no("Nominations happen by day");
      if (!game.day.nominationsOpen && !bySt) return no("Nominations aren't open");
      if (game.day.vote && game.day.vote.status !== "done")
        return no("Finish the current vote first");
      if (isSt && !bySt) return no("Nominate on a player's behalf (Act for)");
      const state = game.companion;
      const nominee = playerOf(game, a.nominee);
      if (!state || !nominee || nominee.left) return no("No such player");
      if (game.day.nominees.includes(a.nominee))
        return no("They have already been nominated today");
      const exile = isTraveller(nominee);
      if (!exile) {
        if (!(game.publicLife[seat] ?? false)) return no("The dead can't nominate");
        if (game.day.nominators.includes(seat)) return no("You have already nominated today");
        if (travellerActive(game, "bishop") && !bySt)
          return no("The Bishop: only the Storyteller nominates");
      }
      const order = voteOrder(state, nominee.seat).flatMap((c) => {
        const rs = roomSeatOf(game, c);
        return rs === undefined ? [] : [rs];
      });
      const vote: Vote = {
        nominator: seat,
        nominee: a.nominee,
        kind: exile ? "exile" : "execution",
        order,
        hands: order.map(() => false),
        locked: 0,
        status: "open",
        nextTickAt: null,
      };
      const next: BotcOnline = {
        ...game,
        day: {
          ...game.day,
          nominators: exile ? game.day.nominators : [...game.day.nominators, seat],
          nominees: [...game.day.nominees, a.nominee],
          vote,
        },
      };
      const text = exile
        ? `${nameOf(game, seat)} calls for ${nameOf(game, a.nominee)}'s exile.`
        : `${nameOf(game, seat)} nominates ${nameOf(game, a.nominee)}.`;
      return ok(publish(next, "nomination", text, now, bySt));
    }

    case "hand": {
      const vote = game.day.vote;
      if (!vote) return no("There's no vote");
      if (a.up) {
        const problem = handProblem(game, vote, seat);
        if (problem) return no(problem);
      } else {
        const at = vote.order.indexOf(seat);
        if (at === -1) return no("You aren't in this vote");
        if (at < vote.locked || vote.status === "done") return no("The clock has passed you");
      }
      const at = vote.order.indexOf(seat);
      return ok({
        ...game,
        day: {
          ...game.day,
          vote: { ...vote, hands: vote.hands.map((h, i) => (i === at ? a.up : h)) },
        },
      });
    }

    case "request": {
      if (game.stage !== "play") return no("Nothing to claim right now");
      if (isSt && !bySt) return no("Requests come from players");
      for (const t of a.targets) if (!playerOf(game, t)) return no("No such player");
      const [id, next] = nextId(game);
      const targets = a.targets.map((t) => nameOf(game, t));
      const what = REQUEST_WORDS[a.request];
      const text = `${nameOf(game, seat)} ${what}${targets.length ? `: ${listNames(targets)}` : ""}${a.text ? ` — “${a.text}”` : ""}`;
      return ok(
        publish(
          {
            ...next,
            requests: [
              ...next.requests,
              {
                id,
                at: now,
                from: seat,
                kind: a.request,
                targets: [...a.targets],
                ...(a.text ? { text: a.text } : {}),
                status: "open",
              },
            ],
          },
          "claim",
          text,
          now,
          false,
        ),
      );
    }
  }
}

const REQUEST_WORDS: Record<RequestKind, string> = {
  slayer: "claims the Slayer and shoots",
  gunslinger: "uses the Gunslinger on",
  "beggar-give": "gives a vote token to",
  judge: "uses the Judge",
  "matron-swap": "uses the Matron to swap",
  moonchild: "chooses with the Moonchild's curse",
  other: "asks the Storyteller",
};

// ── The Storyteller ──────────────────────────────────────────────────────

function applyStoryteller(game: BotcOnline, a: StorytellerAction, now: number): Applied {
  const kind = phaseKind(game);
  const edition = game.config.edition;

  const setupEdit = (
    fn: (
      setup: NonNullable<BotcOnline["setup"]>,
      rng: () => number,
    ) => NonNullable<BotcOnline["setup"]> | string,
  ): Applied => {
    if (game.stage !== "setup" || !game.setup) return no("The characters have been dealt");
    const setup = game.setup;
    const [result, next] = rolled(game, (rng) => fn(setup, rng));
    return typeof result === "string" ? no(result) : ok({ ...next, setup: result });
  };

  switch (a.kind) {
    case "setup-order":
      return setupEdit((s) => setupStage.reorder(s, a.order));
    case "setup-traveller":
      return setupEdit((s, rng) =>
        setupStage.setTraveller(s, a.roomSeat, a.traveller, edition, rng),
      );
    case "setup-edition": {
      if (game.stage !== "setup" || !game.setup) return no("The characters have been dealt");
      const next = { ...game, config: { ...game.config, edition: a.edition } };
      const setup = {
        ...game.setup,
        travellers: game.setup.travellers.map((t) => ({ ...t, character: null })),
      };
      const [bag, rolledNext] = rolled(next, (rng) => setupStage.freshBag(setup, a.edition, rng));
      return ok({ ...rolledNext, setup: { ...setup, bag } });
    }
    case "setup-reroll":
      return setupEdit((s, rng) => setupStage.reroll(s, edition, rng));
    case "setup-swap-token":
      return setupEdit((s, rng) => setupStage.swapToken(s, a.from, a.to, rng));
    case "setup-stand-in":
      return setupEdit((s, rng) => setupStage.swapStandIn(s, a.character, rng));
    case "setup-demon-skill":
      return setupEdit((s, rng) => setupStage.setDemonSkill(s, a.skill, rng));

    case "deal": {
      if (game.stage !== "setup" || !game.setup) return no("The characters have been dealt");
      const setup = game.setup;
      const [companion, next] = rolled(game, (rng) =>
        setupStage.deal(
          setup,
          game.names,
          {
            storyteller: nameOf(game, STORYTELLER),
            gameId: `online-${game.seed}`,
            startedAt: new Date(now).toISOString(),
            edition,
          },
          rng,
        ),
      );
      if (typeof companion === "string") return no(companion);
      const publicLife = game.names.map((_, seat) => seat !== STORYTELLER);
      return ok(
        publish(
          { ...next, stage: "reveal", setup: null, companion, publicLife },
          "seating",
          `${companion.players.length} players take their seats.`,
          now,
          true,
        ),
      );
    }

    case "reveal-characters": {
      const state = game.companion;
      if (game.stage !== "reveal" || !state) return no("Deal the characters first");
      if (game.shown.some(Boolean)) return no("The characters have already been shown");
      let next = game;
      for (const p of state.players) {
        if (p.roomSeat === undefined) continue;
        next = deliver(
          next,
          p.roomSeat,
          {
            kind: "you-are",
            character: apparentCharacter(p),
            ...(p.alignment ? { alignment: p.alignment } : {}),
          },
          now,
        );
      }
      return ok(publish(next, "phase", "Each player looks at their character.", now, true));
    }

    case "begin-night": {
      if (game.stage !== "reveal") return no("The first night has already begun");
      if (!game.shown.some(Boolean)) return no("Show the players their characters first");
      return changeTruth(game, "Begin the first night", now, beginNight, {
        alsoSet: (g) => ({ ...g, stage: "play" }),
        preface: { kind: "phase", text: "Night 1 falls. The town sleeps." },
      });
    }

    case "grimoire":
      if (game.stage === "setup") return no("Deal the characters first");
      return changeTruth(game, a.label ?? `Grimoire: ${a.action.type}`, now, (s) =>
        applyCompanionAction(s, a.action),
      );

    case "wake": {
      const state = game.companion;
      if (kind !== "night" || !state) return no("Players wake at night");
      const step = nightQueue(state).find((s) => nightStepId(s) === a.stepId);
      if (!step) return no("That step isn't on tonight's sheet");
      const seats = wakersOf(state, step).flatMap((c) => {
        const rs = roomSeatOf(game, c);
        return rs === undefined ? [] : [rs];
      });
      if (seats.length === 0) return no("Nobody wakes for that step");
      return ok({ ...game, wake: { stepId: a.stepId, seats, choices: {}, at: now } });
    }

    case "sleep":
      return ok({ ...game, wake: null });

    case "send-info": {
      if (game.stage === "setup") return no("Deal the characters first");
      const to = [...new Set(a.to)];
      if (to.some((rs) => rs === STORYTELLER || rs >= game.names.length))
        return no("Send it to players");
      let next = game;
      for (const rs of to) next = deliver(next, rs, a.payload, now);
      if (a.record && next.companion) {
        const told = describeInfo(a.payload, (rs) => nameOf(game, rs));
        let companion = next.companion;
        for (const rs of to) {
          const chair = chairOf(game, rs);
          if (chair !== undefined) companion = recordInfoGiven(companion, chair, told, a.truth);
        }
        if (companion !== next.companion) {
          next = {
            ...remember(next, `Told ${listNames(to.map((rs) => nameOf(game, rs)))}`),
            companion,
          };
        }
      }
      return ok(next);
    }

    case "show-character": {
      const p = playerOf(game, a.to);
      if (!p) return no("No such player");
      return ok(
        deliver(
          game,
          a.to,
          {
            kind: "you-are",
            character: apparentCharacter(p),
            ...(p.alignment ? { alignment: p.alignment } : {}),
          },
          now,
        ),
      );
    }

    case "dawn": {
      const phase = game.companion?.phase;
      if (phase?.kind !== "night") return no("It isn't night");
      return changeTruth(game, "Dawn", now, dawn, {
        alsoSet: (g) => ({ ...g, wake: null, day: EMPTY_DAY }),
        preface: { kind: "phase", text: `Day ${phase.night} dawns.` },
        framing: "dawn",
      });
    }

    case "nominations":
      if (kind !== "day") return no("Nominations happen by day");
      return ok(
        publish(
          { ...game, day: { ...game.day, nominationsOpen: a.open } },
          "phase",
          a.open ? "Nominations are open." : "Nominations are closed.",
          now,
          true,
        ),
      );

    case "start-vote": {
      const vote = game.day.vote;
      if (!vote || vote.status !== "open") return no("There's no vote waiting to start");
      return ok({
        ...game,
        day: {
          ...game.day,
          vote: { ...vote, status: "running", nextTickAt: now + game.config.voteClockMs },
        },
      });
    }
    case "pause-vote": {
      const vote = game.day.vote;
      if (vote?.status !== "running") return no("The clock isn't running");
      return ok({
        ...game,
        day: { ...game.day, vote: { ...vote, status: "paused", nextTickAt: null } },
      });
    }
    case "resume-vote": {
      const vote = game.day.vote;
      if (vote?.status !== "paused") return no("The clock isn't paused");
      return ok({
        ...game,
        day: {
          ...game.day,
          vote: { ...vote, status: "running", nextTickAt: now + game.config.voteClockMs },
        },
      });
    }
    case "cancel-vote": {
      if (!game.day.vote) return no("There's no vote");
      return ok(
        publish(
          { ...game, day: { ...game.day, vote: null } },
          "vote",
          "The Storyteller set the vote aside.",
          now,
          true,
        ),
      );
    }

    case "confirm-vote": {
      const vote = game.day.vote;
      const state = game.companion;
      if (!vote || !state) return no("There's no vote");
      if (vote.status !== "done") return no("Let the clock go all the way round first");
      if (vote.result) return no("This vote is already counted");
      const voters = vote.order.filter((_, i) => vote.hands[i]);
      const nominator = chairOf(game, vote.nominator);
      const nominee = chairOf(game, vote.nominee);
      if (nominator === undefined || nominee === undefined) return no("No such player");
      const voterChairs = voters.flatMap((rs) => {
        const c = chairOf(game, rs);
        return c === undefined ? [] : [c];
      });
      const nomineeName = nameOf(game, vote.nominee);

      if (vote.kind === "exile") {
        const required = exileVotesRequired(state);
        const passes = voters.length >= required;
        const counted: Vote = {
          ...vote,
          result: { votes: voters.length, required, outcome: passes ? "exiled" : "not enough" },
        };
        const text = `${voters.length} of ${required} votes to exile ${nomineeName} — ${passes ? "exiled" : "not enough"}.`;
        return changeTruth(
          game,
          `Count the exile vote on ${nomineeName}`,
          now,
          (s) => (passes ? exileTraveller(s, nominee) : s),
          {
            alsoSet: (g) => ({ ...g, day: { ...g.day, vote: counted } }),
            preface: { kind: "vote", text },
          },
        );
      }

      const r = changeTruth(game, `Count the vote on ${nomineeName}`, now, (s) =>
        recordVote(s, nominator, nominee, voterChairs),
      );
      if (!r.ok) return r;
      const booked = r.game.companion?.day.nominations.at(-1);
      if (!booked) return no("The vote wasn't counted");
      const outcome =
        booked.result === "about-to-die"
          ? `${nomineeName} is about to die`
          : booked.result === "tied"
            ? "tied — nobody is about to die"
            : "not enough";
      const counted: Vote = {
        ...vote,
        result: { votes: booked.votes, required: booked.required, outcome },
      };
      return ok(
        publish(
          { ...r.game, day: { ...r.game.day, vote: counted } },
          "vote",
          `${booked.votes} vote${booked.votes === 1 ? "" : "s"} on ${nomineeName} (${booked.required} needed): ${outcome}.`,
          now,
          true,
        ),
      );
    }

    case "execute": {
      const state = game.companion;
      if (kind !== "day" || !state) return no("Executions happen by day");
      const target = state.day.aboutToDie;
      if (!target) return no("Nobody is about to die");
      const rs = roomSeatOf(game, target.seat);
      const name = rs !== undefined ? nameOf(game, rs) : "?";
      return changeTruth(game, `Execute ${name}`, now, executeAboutToDie, {
        preface: { kind: "execution", text: `${name} is executed.` },
      });
    }

    case "end-day": {
      if (kind !== "day") return no("It isn't day");
      const r = changeTruth(game, "End the day", now, endDay, {
        alsoSet: (g) => ({ ...g, day: EMPTY_DAY }),
      });
      if (!r.ok) return r;
      const phase = r.game.companion?.phase;
      return phase?.kind === "night"
        ? ok(publish(r.game, "phase", `Night ${phase.night} falls. The town sleeps.`, now, true))
        : r;
    }

    case "announce":
      return ok(publish(game, "announce", a.text, now, true));

    case "chat-settings":
      return ok({
        ...game,
        chatSettings: { publicOpen: a.publicOpen, whispersOpen: a.whispersOpen },
      });

    case "resolve-request": {
      const req = game.requests.find((r) => r.id === a.id);
      if (!req) return no("No such request");
      if (req.status !== "open") return no("That request is already settled");
      const next: BotcOnline = {
        ...game,
        requests: game.requests.map((r) => (r.id === a.id ? { ...r, status: a.status } : r)),
      };
      return ok(a.note ? publish(next, "claim", a.note, now, true) : next);
    }

    case "act-for": {
      if (a.roomSeat === STORYTELLER || a.roomSeat >= game.names.length)
        return no("Act for a player");
      return applyPlayer(game, a.roomSeat, a.action, now, true);
    }

    case "undo": {
      const entry = game.past.at(-1);
      if (!entry) return no("Nothing to undo");
      const restored = restore(game, entry);
      return ok({
        ...restored,
        past: game.past.slice(0, -1),
        future: [...game.future, snapshotOf(game, entry.label)],
        timeline: game.timeline.map((t) =>
          t.byStoryteller && t.id >= entry.timelineMark ? { ...t, retracted: true } : t,
        ),
      });
    }

    case "redo": {
      const entry = game.future.at(-1);
      if (!entry) return no("Nothing to redo");
      return ok({
        ...restore(game, entry),
        future: game.future.slice(0, -1),
        past: [...game.past, snapshotOf(game, entry.label)].slice(-HISTORY_LIMIT),
      });
    }

    case "end-game": {
      if (!game.companion) return no("Deal the characters first");
      if (game.stage === "over") return no("The game is over");
      return changeTruth(game, "End the game", now, (s) => endGame(s, a.winner, a.reason));
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

/**
 * The parts of the state a Storyteller's `rev` guards: the truth and the
 * stage. Waking, sleeping and talking don't move it, so one click may send
 * "sleep" and then "next step" without the second being refused.
 */
function structureChanged(a: BotcOnline, b: BotcOnline): boolean {
  return (
    a.stage !== b.stage ||
    a.setup !== b.setup ||
    a.companion !== b.companion ||
    a.day.vote?.nominee !== b.day.vote?.nominee
  );
}

/** Apply one action from `seat`. Never throws for a bad action — it refuses with a reason. */
export function applyOnline(
  game: BotcOnline,
  seat: RoomSeat,
  action: OnlineAction,
  now: number,
): Applied {
  if (seat < 0 || seat >= game.names.length) return no("No such seat");
  if (
    game.stage === "over" &&
    action.kind !== "chat" &&
    action.kind !== "whisper" &&
    action.kind !== "dismiss-info"
  ) {
    return no("The game is over");
  }
  const isStAction = STORYTELLER_KINDS.has(action.kind);
  if (isStAction && seat !== STORYTELLER) return no("Only the Storyteller can do that");
  if (isStAction && "rev" in action && REV_CHECKED.has(action.kind) && action.rev !== game.rev) {
    return no("The Grimoire changed — try again");
  }

  let result: Applied;
  try {
    result = isStAction
      ? applyStoryteller(game, action as StorytellerAction, now)
      : applyPlayer(game, seat, action as PlayerAction, now, false);
  } catch (err) {
    return no(err instanceof Error ? err.message : "That didn't work");
  }
  if (!result.ok) return result;
  let next = result.game;
  if (next === game) return result;
  if (structureChanged(game, next)) next = { ...next, rev: game.rev + 1 };
  next = { ...next, log: [...next.log, { seat, at: now, action }] };
  return ok(next);
}
