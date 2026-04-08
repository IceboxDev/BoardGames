import { and, assign, fromCallback, not, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import {
  buildFullDeck,
  isValidSet as checkValidSet,
  findAllSets,
  setKey,
  shuffle,
  tableHasSet,
} from "./deck";
import type { PlayerId, PvpGameResult, PvpPlayerRecordEntry, PvpPlayerState } from "./pvp-types";
import type { DealEntry, PerSetRecord, SetCardData } from "./types";

const DEAL_INTERVAL_MS = 600;
export const SELECTION_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface PvpGameContext {
  deck: SetCardData[];
  slots: (SetCardData | null)[];
  players: [PvpPlayerState, PvpPlayerState];
  activePlayer: PlayerId | null;
  selected: Set<number>;
  selectionDeadline: number;
  message: string;
  gameStartTime: number;
  setTimers: Record<string, number>;
  setCallTime: number;
  dealQueue: DealEntry[];
  calledDuringDeal: boolean;
  cardsDealtWhenCalled: number;
  resolveDelayMs: number;
  gameResult: PvpGameResult | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type PvpGameEvent =
  | { type: "START" }
  | { type: "DEAL_NEXT" }
  | { type: "CALL_SET"; playerIndex: PlayerId }
  | { type: "SELECT_CARD"; cardId: number; playerIndex: PlayerId }
  | { type: "SELECTION_TIMEOUT" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function visibleCards(slots: (SetCardData | null)[]): SetCardData[] {
  return slots.filter((s): s is SetCardData => s !== null);
}

function computeUpdatedTimers(
  slots: (SetCardData | null)[],
  current: Record<string, number>,
): Record<string, number> {
  const visible = visibleCards(slots);
  if (visible.length < 3) return current;

  const allSets = findAllSets(visible);
  const currentKeys = new Set(allSets.map(([a, b, c]) => setKey(a.id, b.id, c.id)));

  const now = Date.now();
  const timers: Record<string, number> = {};

  for (const key of currentKeys) {
    timers[key] = current[key] ?? now;
  }

  return timers;
}

function isGameOverCheck(ctx: PvpGameContext): boolean {
  const visible = visibleCards(ctx.slots);
  return ctx.deck.length === 0 && visible.length > 0 && !tableHasSet(visible);
}

function emptyPlayerState(): PvpPlayerState {
  return { score: 0, penalties: 0, perSetRecords: [], streakEvents: [] };
}

function buildPlayerRecord(p: PvpPlayerState): PvpPlayerRecordEntry {
  const findTimes = p.perSetRecords.map((r) => r.totalFindTimeMs);
  return {
    setsFound: p.score,
    penalties: p.penalties,
    netScore: p.score - p.penalties,
    avgFindTimeMs:
      findTimes.length > 0
        ? Math.round(findTimes.reduce((a, b) => a + b, 0) / findTimes.length)
        : 0,
    fastestSetMs: findTimes.length > 0 ? Math.round(Math.min(...findTimes)) : 0,
    perSetDetails: p.perSetRecords,
  };
}

const INITIAL_CONTEXT: PvpGameContext = {
  deck: [],
  slots: [],
  players: [emptyPlayerState(), emptyPlayerState()],
  activePlayer: null,
  selected: new Set(),
  selectionDeadline: 0,
  message: "",
  gameStartTime: 0,
  setTimers: {},
  setCallTime: 0,
  dealQueue: [],
  calledDuringDeal: false,
  cardsDealtWhenCalled: 0,
  resolveDelayMs: 300,
  gameResult: null,
};

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const setPvpMachine = setup({
  types: {} as {
    context: PvpGameContext;
    events: PvpGameEvent;
  },

  delays: {
    resolveDelay: ({ context }) => context.resolveDelayMs,
    selectionTimeout: () => SELECTION_TIMEOUT_MS,
  },

  actors: {
    dealingInterval: fromCallback<PvpGameEvent>(({ sendBack }) => {
      const id = setInterval(() => {
        sendBack({ type: "DEAL_NEXT" });
      }, DEAL_INTERVAL_MS);
      return () => clearInterval(id);
    }),
  },

  guards: {
    queueNotEmpty: ({ context }) => context.dealQueue.length > 0,
    isGameOver: ({ context }) => isGameOverCheck(context),
    enoughVisibleCards: ({ context }) => visibleCards(context.slots).length >= 3,

    isThirdCard: ({ context, event }) => {
      if (event.type !== "SELECT_CARD") return false;
      if (context.selected.has(event.cardId)) return false;
      return context.selected.size === 2;
    },

    isValidSet: ({ context, event }) => {
      if (event.type !== "SELECT_CARD") return false;
      const ids = [...context.selected, event.cardId];
      if (ids.length !== 3) return false;
      const cards = ids.map(
        (id) => context.slots.find((s) => s !== null && s.id === id) as SetCardData,
      );
      return checkValidSet(cards[0], cards[1], cards[2]);
    },

    hasPendingQueue: ({ context }) => context.dealQueue.length > 0,
    noDelayNeeded: ({ context }) => context.dealQueue.length === 0 && !isGameOverCheck(context),
  },

  actions: {
    initializePvpGame: assign(() => {
      const d = shuffle(buildFullDeck());
      const initialCards = d.slice(0, 12);
      const remainingDeck = d.slice(12);
      const dealQueue: DealEntry[] = initialCards.map((card, i) => ({
        slotIndex: i,
        card,
      }));

      return {
        deck: remainingDeck,
        slots: Array(12).fill(null) as (SetCardData | null)[],
        players: [emptyPlayerState(), emptyPlayerState()] as [PvpPlayerState, PvpPlayerState],
        activePlayer: null,
        selected: new Set<number>(),
        selectionDeadline: 0,
        message: "",
        gameStartTime: Date.now(),
        setTimers: {} as Record<string, number>,
        setCallTime: 0,
        dealQueue,
        calledDuringDeal: false,
        cardsDealtWhenCalled: 0,
        resolveDelayMs: 300,
        gameResult: null,
      };
    }),

    dealOneCard: assign(({ context }) => {
      const [next, ...rest] = context.dealQueue;
      const slots = [...context.slots];
      slots[next.slotIndex] = next.card;
      return { slots, dealQueue: rest };
    }),

    updateSetTimers: assign(({ context }) => ({
      setTimers: computeUpdatedTimers(context.slots, context.setTimers),
    })),

    captureCallForPlayer: assign(({ context, event }) => {
      if (event.type !== "CALL_SET") return {};
      const visible = visibleCards(context.slots);
      return {
        activePlayer: event.playerIndex as PlayerId,
        setCallTime: Date.now(),
        selectionDeadline: Date.now() + SELECTION_TIMEOUT_MS,
        calledDuringDeal: false,
        cardsDealtWhenCalled: visible.length,
        selected: new Set<number>(),
        message: "",
      };
    }),

    markCalledDuringDeal: assign({ calledDuringDeal: true }),

    resolveValidPvpSet: assign(({ context, event }) => {
      if (event.type !== "SELECT_CARD" || context.activePlayer === null) return {};

      const ids = [...context.selected, event.cardId];
      const now = Date.now();
      const pid = context.activePlayer;

      const timerKey = setKey(ids[0], ids[1], ids[2]);
      const visibilityTime = context.setTimers[timerKey] ?? context.gameStartTime;
      const reactionTimeMs = Math.max(0, context.setCallTime - visibilityTime);
      const selectionTimeMs = now - context.setCallTime;

      const visible = visibleCards(context.slots);
      const record: PerSetRecord = {
        reactionTimeMs,
        selectionTimeMs,
        totalFindTimeMs: reactionTimeMs + selectionTimeMs,
        boardSize: visible.length,
        calledDuringDeal: context.calledDuringDeal,
        cardsDealtWhenCalled: context.cardsDealtWhenCalled,
      };

      // Update the calling player's state
      const newPlayers = [...context.players] as [PvpPlayerState, PvpPlayerState];
      newPlayers[pid] = {
        ...newPlayers[pid],
        score: newPlayers[pid].score + 1,
        perSetRecords: [...newPlayers[pid].perSetRecords, record],
        streakEvents: [...newPlayers[pid].streakEvents, true],
      };

      // Remove set timer keys that involve removed cards
      const removedIdSet = new Set(ids);
      const newTimers: Record<string, number> = {};
      for (const [tk, tv] of Object.entries(context.setTimers)) {
        if (!tk.split("-").some((x) => removedIdSet.has(Number(x)))) {
          newTimers[tk] = tv;
        }
      }

      // Replace cards on the board
      const removeIndices = ids.map((cid) =>
        context.slots.findIndex((s) => s !== null && s.id === cid),
      );
      const nonNullCount = visible.length;
      const remainingQueue = [...context.dealQueue];

      let newSlots: (SetCardData | null)[];
      let newDeck = context.deck;
      let dealQueue: DealEntry[] = [];
      let resolveDelayMs = 300;

      if (nonNullCount <= 12 && context.deck.length >= 3) {
        const newCards = context.deck.slice(0, 3);
        newDeck = context.deck.slice(3);
        newSlots = [...context.slots];
        for (const idx of removeIndices) {
          newSlots[idx] = null;
        }
        const replacementQueue: DealEntry[] = removeIndices.map((idx, i) => ({
          slotIndex: idx,
          card: newCards[i],
        }));
        dealQueue = [...remainingQueue, ...replacementQueue];
        resolveDelayMs = 300;
      } else {
        newSlots = context.slots
          .map((s) => (s && removedIdSet.has(s.id) ? null : s))
          .filter((s): s is SetCardData => s !== null);

        if (newDeck.length === 0 && !tableHasSet(newSlots as SetCardData[])) {
          resolveDelayMs = 500;
          dealQueue = [];
        } else if (remainingQueue.length > 0) {
          dealQueue = remainingQueue;
          resolveDelayMs = 300;
        } else {
          dealQueue = [];
          resolveDelayMs = 0;
        }
      }

      return {
        selected: new Set<number>(),
        activePlayer: null,
        selectionDeadline: 0,
        message: `Player ${pid + 1} found a SET!`,
        players: newPlayers,
        setTimers: newTimers,
        slots: newSlots,
        deck: newDeck,
        dealQueue,
        resolveDelayMs,
      };
    }),

    resolveInvalidPvpSet: assign(({ context }) => {
      if (context.activePlayer === null) return {};
      const pid = context.activePlayer;
      const newPlayers = [...context.players] as [PvpPlayerState, PvpPlayerState];
      newPlayers[pid] = {
        ...newPlayers[pid],
        penalties: newPlayers[pid].penalties + 1,
        streakEvents: [...newPlayers[pid].streakEvents, false],
      };

      return {
        selected: new Set<number>(),
        activePlayer: null,
        selectionDeadline: 0,
        message: `Player ${pid + 1}: not a valid SET!`,
        players: newPlayers,
        resolveDelayMs: 300,
      };
    }),

    penalizeTimeout: assign(({ context }) => {
      if (context.activePlayer === null) return {};
      const pid = context.activePlayer;
      const newPlayers = [...context.players] as [PvpPlayerState, PvpPlayerState];
      newPlayers[pid] = {
        ...newPlayers[pid],
        penalties: newPlayers[pid].penalties + 1,
        streakEvents: [...newPlayers[pid].streakEvents, false],
      };

      return {
        selected: new Set<number>(),
        activePlayer: null,
        selectionDeadline: 0,
        message: `Player ${pid + 1}: time's up!`,
        players: newPlayers,
        resolveDelayMs: 300,
      };
    }),

    toggleCardSelection: assign(({ context, event }) => {
      if (event.type !== "SELECT_CARD") return {};
      const newSelected = new Set(context.selected);
      if (newSelected.has(event.cardId)) {
        newSelected.delete(event.cardId);
        return { selected: newSelected, message: "" };
      }
      newSelected.add(event.cardId);
      return { selected: newSelected };
    }),

    finalizePvpGame: assign(({ context }) => {
      const durationMs = Date.now() - context.gameStartTime;
      const p0 = buildPlayerRecord(context.players[0]);
      const p1 = buildPlayerRecord(context.players[1]);

      let winner: 0 | 1 | "draw";
      if (p0.netScore > p1.netScore) winner = 0;
      else if (p1.netScore > p0.netScore) winner = 1;
      else winner = "draw";

      return {
        gameResult: {
          players: [p0, p1] as [PvpPlayerRecordEntry, PvpPlayerRecordEntry],
          winner,
          durationMs,
          scoreA: p0.netScore,
          scoreB: p1.netScore,
        },
      };
    }),
  },
}).createMachine({
  id: "setPvp",
  initial: "idle",
  context: INITIAL_CONTEXT,

  states: {
    idle: {
      on: {
        START: {
          target: "#setPvp.dealing.active",
          actions: "initializePvpGame",
        },
      },
    },

    dealing: {
      initial: "active",
      on: {
        START: {
          target: "#setPvp.dealing.active",
          actions: "initializePvpGame",
        },
      },
      states: {
        awaitingDeal: {
          always: [
            {
              guard: "noDelayNeeded",
              target: "#setPvp.playing",
            },
          ],
          after: {
            resolveDelay: [
              {
                guard: "isGameOver",
                target: "#setPvp.gameOver",
                actions: "finalizePvpGame",
              },
              {
                target: "active",
              },
            ],
          },
          on: {
            START: {
              target: "#setPvp.dealing.active",
              actions: "initializePvpGame",
            },
          },
        },

        active: {
          invoke: {
            src: "dealingInterval",
          },
          on: {
            DEAL_NEXT: [
              {
                guard: "queueNotEmpty",
                actions: ["dealOneCard", "updateSetTimers"],
              },
              {
                guard: "isGameOver",
                target: "#setPvp.gameOver",
                actions: "finalizePvpGame",
              },
              {
                target: "#setPvp.playing",
              },
            ],
            CALL_SET: {
              guard: "enoughVisibleCards",
              target: "#setPvp.selecting",
              actions: ["captureCallForPlayer", "markCalledDuringDeal"],
            },
          },
        },
      },
    },

    playing: {
      always: [
        {
          guard: "isGameOver",
          target: "#setPvp.gameOver",
          actions: "finalizePvpGame",
        },
      ],
      on: {
        CALL_SET: {
          target: "#setPvp.selecting",
          actions: "captureCallForPlayer",
        },
        START: {
          target: "#setPvp.dealing.active",
          actions: "initializePvpGame",
        },
      },
    },

    selecting: {
      after: {
        selectionTimeout: {
          target: "#setPvp.playing",
          actions: "penalizeTimeout",
        },
      },
      on: {
        SELECT_CARD: [
          {
            guard: and(["isThirdCard", "isValidSet"]),
            target: "#setPvp.dealing.awaitingDeal",
            actions: "resolveValidPvpSet",
          },
          {
            guard: and(["isThirdCard", not("isValidSet"), "hasPendingQueue"]),
            target: "#setPvp.dealing.awaitingDeal",
            actions: "resolveInvalidPvpSet",
          },
          {
            guard: and(["isThirdCard", not("isValidSet")]),
            target: "#setPvp.playing",
            actions: "resolveInvalidPvpSet",
          },
          {
            actions: "toggleCardSelection",
          },
        ],
        START: {
          target: "#setPvp.dealing.active",
          actions: "initializePvpGame",
        },
      },
    },

    gameOver: {
      on: {
        START: {
          target: "#setPvp.dealing.active",
          actions: "initializePvpGame",
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

export interface SetPvpPlayerView {
  slots: (SetCardData | null)[];
  selected: Set<number>;
  players: [PvpPlayerState, PvpPlayerState];
  activePlayer: PlayerId | null;
  selectionDeadline: number;
  deckRemaining: number;
  message: string;
  gameResult: PvpGameResult | null;
}

// ---------------------------------------------------------------------------
// Spec export
// ---------------------------------------------------------------------------

export const setPvpSpec: GameMachineSpec<
  typeof setPvpMachine,
  SetPvpPlayerView,
  PvpGameEvent,
  PvpGameResult | null
> = {
  machine: setPvpMachine,

  getPlayerView(snapshot, _player) {
    const ctx = snapshot.context;
    return {
      slots: ctx.slots,
      selected: ctx.selected,
      players: ctx.players,
      activePlayer: ctx.activePlayer,
      selectionDeadline: ctx.selectionDeadline,
      deckRemaining: ctx.deck.length,
      message: ctx.message,
      gameResult: ctx.gameResult,
    };
  },

  getLegalActions(snapshot, player) {
    const events: PvpGameEvent[] = [];
    const ctx = snapshot.context;

    if (snapshot.matches({ dealing: "active" }) || snapshot.matches("playing")) {
      events.push({ type: "CALL_SET", playerIndex: player as PlayerId });
    }

    if (snapshot.matches("selecting") && ctx.activePlayer === player) {
      const visible = visibleCards(ctx.slots);
      for (const card of visible) {
        events.push({ type: "SELECT_CARD", cardId: card.id, playerIndex: player as PlayerId });
      }
    }

    return events;
  },

  getActivePlayer(snapshot) {
    // -1 = simultaneous (both can CALL_SET)
    return snapshot.context.activePlayer ?? -1;
  },

  getResult(snapshot) {
    return snapshot.context.gameResult;
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot) {
    const r = snapshot.context.gameResult;
    if (!r) return null;
    return { scoreA: r.scoreA, scoreB: r.scoreB };
  },
};
