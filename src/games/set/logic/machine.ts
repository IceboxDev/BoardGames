import { and, assign, fromCallback, not, setup } from "xstate";
import {
  buildFullDeck,
  isValidSet as checkValidSet,
  findAllSets,
  setKey,
  shuffle,
  tableHasSet,
} from "./deck";
import { computeGameMetrics } from "./metrics";
import { saveGameRecord } from "./persistence";
import type { DealEntry, GameRecord, PerSetRecord, SetCardData } from "./types";

const DEAL_INTERVAL_MS = 600;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface GameContext {
  deck: SetCardData[];
  slots: (SetCardData | null)[];
  selected: Set<number>;
  score: number;
  penalties: number;
  message: string;
  perSetRecords: PerSetRecord[];
  plusThreeCount: number;
  streakEvents: boolean[];
  hintCount: number;
  hintedCardId: number | null;
  gameRecord: GameRecord | null;
  gameStartTime: number;
  setTimers: Record<string, number>;
  setCallTime: number;
  dealQueue: DealEntry[];
  calledDuringDeal: boolean;
  cardsDealtWhenCalled: number;
  resolveDelayMs: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "START_GAME" }
  | { type: "DEAL_NEXT" }
  | { type: "CALL_SET" }
  | { type: "SELECT_CARD"; cardId: number }
  | { type: "PLUS_THREE" }
  | { type: "USE_HINT" };

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

function computeLongestStreak(events: boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const correct of events) {
    if (correct) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

function isGameOverCheck(ctx: GameContext): boolean {
  const visible = visibleCards(ctx.slots);
  return ctx.deck.length === 0 && visible.length > 0 && !tableHasSet(visible);
}

const INITIAL_CONTEXT: GameContext = {
  deck: [],
  slots: [],
  selected: new Set(),
  score: 0,
  penalties: 0,
  message: "",
  perSetRecords: [],
  plusThreeCount: 0,
  streakEvents: [],
  hintCount: 0,
  hintedCardId: null,
  gameRecord: null,
  gameStartTime: 0,
  setTimers: {},
  setCallTime: 0,
  dealQueue: [],
  calledDuringDeal: false,
  cardsDealtWhenCalled: 0,
  resolveDelayMs: 300,
};

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const setGameMachine = setup({
  types: {} as {
    context: GameContext;
    events: GameEvent;
  },

  delays: {
    resolveDelay: ({ context }) => context.resolveDelayMs,
  },

  actors: {
    dealingInterval: fromCallback<GameEvent>(({ sendBack }) => {
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
      const cards = ids.map((id) => context.slots.find((s) => s !== null && s.id === id)!);
      return checkValidSet(cards[0], cards[1], cards[2]);
    },

    hasPendingQueue: ({ context }) => context.dealQueue.length > 0,

    deckHasCards: ({ context }) => context.deck.length >= 3,

    noSetOnTable: ({ context }) => {
      const visible = visibleCards(context.slots);
      return !tableHasSet(visible);
    },

    setOnTable: ({ context }) => {
      const visible = visibleCards(context.slots);
      return tableHasSet(visible);
    },

    noDelayNeeded: ({ context }) => context.dealQueue.length === 0 && !isGameOverCheck(context),
  },

  actions: {
    initializeGame: assign(() => {
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
        selected: new Set<number>(),
        score: 0,
        penalties: 0,
        message: "",
        perSetRecords: [] as PerSetRecord[],
        plusThreeCount: 0,
        streakEvents: [] as boolean[],
        hintCount: 0,
        hintedCardId: null,
        gameRecord: null,
        gameStartTime: Date.now(),
        setTimers: {} as Record<string, number>,
        setCallTime: 0,
        dealQueue,
        calledDuringDeal: false,
        cardsDealtWhenCalled: 0,
        resolveDelayMs: 300,
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

    captureCallMetadata: assign(({ context }) => {
      const visible = visibleCards(context.slots);
      return {
        setCallTime: Date.now(),
        calledDuringDeal: false,
        cardsDealtWhenCalled: visible.length,
        selected: new Set<number>(),
        message: "",
        hintedCardId: null,
      };
    }),

    markCalledDuringDeal: assign({ calledDuringDeal: true }),

    resolveValidSet: assign(({ context, event }) => {
      if (event.type !== "SELECT_CARD") return {};

      const ids = [...context.selected, event.cardId];
      const now = Date.now();

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

      const newRecords = [...context.perSetRecords, record];
      const newStreak = [...context.streakEvents, true];

      const removedIdSet = new Set(ids);
      const newTimers: Record<string, number> = {};
      for (const [tk, tv] of Object.entries(context.setTimers)) {
        if (!tk.split("-").some((x) => removedIdSet.has(Number(x)))) {
          newTimers[tk] = tv;
        }
      }

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
        score: context.score + 1,
        message: "Valid SET!",
        perSetRecords: newRecords,
        streakEvents: newStreak,
        setTimers: newTimers,
        slots: newSlots,
        deck: newDeck,
        dealQueue,
        resolveDelayMs,
      };
    }),

    resolveInvalidSet: assign(({ context }) => ({
      selected: new Set<number>(),
      penalties: context.penalties + 1,
      message: "Not a valid SET — penalty!",
      streakEvents: [...context.streakEvents, false],
      resolveDelayMs: 300,
    })),

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

    prepareExtraCards: assign(({ context }) => {
      const newCards = context.deck.slice(0, 3);
      const newDeck = context.deck.slice(3);
      const currentLen = context.slots.length;

      const newSlots: (SetCardData | null)[] = [...context.slots, null, null, null];
      const dealQueue: DealEntry[] = newCards.map((card, i) => ({
        slotIndex: currentLen + i,
        card,
      }));

      return {
        deck: newDeck,
        slots: newSlots,
        dealQueue,
        plusThreeCount: context.plusThreeCount + 1,
        hintedCardId: null,
      };
    }),

    penalizeBadPlusThree: assign(({ context }) => ({
      penalties: context.penalties + 1,
      message: "A SET is still available — penalty!",
      streakEvents: [...context.streakEvents, false],
    })),

    showEmptyDeckMessage: assign({
      message: "No more cards in the deck!",
    }),

    applyHint: assign(({ context }) => {
      const visible = visibleCards(context.slots);
      const sets = findAllSets(visible);
      if (sets.length === 0) return {};
      return {
        hintedCardId: sets[0][0].id,
        penalties: context.penalties + 3,
        hintCount: context.hintCount + 1,
        message: "Hint used — 3 penalties!",
        streakEvents: [...context.streakEvents, false],
      };
    }),

    finalizeGame: assign(({ context }) => {
      const record = computeGameMetrics(
        context.perSetRecords,
        context.gameStartTime,
        Date.now(),
        context.penalties,
        context.plusThreeCount,
        context.deck.length,
        context.hintCount,
      );
      record.longestStreak = computeLongestStreak(context.streakEvents);
      return { gameRecord: record };
    }),

    persistGame: ({ context }) => {
      if (context.gameRecord) {
        saveGameRecord(context.gameRecord);
      }
    },
  },
}).createMachine({
  id: "setGame",
  initial: "idle",
  context: INITIAL_CONTEXT,

  states: {
    idle: {
      on: {
        START_GAME: {
          target: "#setGame.dealing.active",
          actions: "initializeGame",
        },
      },
    },

    dealing: {
      initial: "active",
      on: {
        START_GAME: {
          target: "#setGame.dealing.active",
          actions: "initializeGame",
        },
      },
      states: {
        awaitingDeal: {
          always: [
            {
              guard: "noDelayNeeded",
              target: "#setGame.playing",
            },
          ],
          after: {
            resolveDelay: [
              {
                guard: "isGameOver",
                target: "#setGame.gameOver",
                actions: ["finalizeGame", "persistGame"],
              },
              {
                target: "active",
              },
            ],
          },
          on: {
            START_GAME: {
              target: "#setGame.dealing.active",
              actions: "initializeGame",
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
                target: "#setGame.gameOver",
                actions: ["finalizeGame", "persistGame"],
              },
              {
                target: "#setGame.playing",
              },
            ],
            CALL_SET: {
              guard: "enoughVisibleCards",
              target: "#setGame.selecting",
              actions: ["captureCallMetadata", "markCalledDuringDeal"],
            },
          },
        },
      },
    },

    playing: {
      always: [
        {
          guard: "isGameOver",
          target: "#setGame.gameOver",
          actions: ["finalizeGame", "persistGame"],
        },
      ],
      on: {
        CALL_SET: {
          target: "#setGame.selecting",
          actions: "captureCallMetadata",
        },
        PLUS_THREE: [
          {
            guard: not("deckHasCards"),
            actions: "showEmptyDeckMessage",
          },
          {
            guard: "setOnTable",
            actions: "penalizeBadPlusThree",
          },
          {
            target: "#setGame.dealing.active",
            actions: ["prepareExtraCards", "updateSetTimers"],
          },
        ],
        USE_HINT: {
          actions: "applyHint",
        },
        START_GAME: {
          target: "#setGame.dealing.active",
          actions: "initializeGame",
        },
      },
    },

    selecting: {
      on: {
        SELECT_CARD: [
          {
            guard: and(["isThirdCard", "isValidSet"]),
            target: "#setGame.dealing.awaitingDeal",
            actions: "resolveValidSet",
          },
          {
            guard: and(["isThirdCard", not("isValidSet"), "hasPendingQueue"]),
            target: "#setGame.dealing.awaitingDeal",
            actions: "resolveInvalidSet",
          },
          {
            guard: and(["isThirdCard", not("isValidSet")]),
            target: "#setGame.playing",
            actions: "resolveInvalidSet",
          },
          {
            actions: "toggleCardSelection",
          },
        ],
        START_GAME: {
          target: "#setGame.dealing.active",
          actions: "initializeGame",
        },
      },
    },

    gameOver: {
      on: {
        START_GAME: {
          target: "#setGame.dealing.active",
          actions: "initializeGame",
        },
      },
    },
  },
});
