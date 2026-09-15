import { beginNight, createGame } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { RecordedSeat } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { setupFromDraws } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import BagScreen from "./BagScreen";
import CompanionGame from "./CompanionGame";
import type { BagDraft } from "./persistence";
import SetupScreen from "./SetupScreen";
import { companionStore, historyControls, useCompanionStore } from "./store";

export type { UpdateState } from "./store";

/** Undo / Redo as the screens see them: the store's history plus its verbs. */
export type HistoryActions = ReturnType<typeof historyControls> & {
  undo: () => void;
  redo: () => void;
  /** Take back everything since the last night step — the "wrong dawn" fix. */
  backToNight: () => void;
};

const HISTORY_VERBS = {
  undo: () => companionStore.undo(),
  redo: () => companionStore.redo(),
  backToNight: () => companionStore.undoUntil((s) => s.phase.kind === "night"),
};

/**
 * Storyteller companion root. Three stages, phone always in the ST's hands:
 *   1. SetupScreen  — roster (+ who is the Storyteller), roll the bag
 *   2. BagScreen    — physical tokens go in the bag, players draw, ST records
 *   3. CompanionGame — grimoire, night wizard, day tracker
 * Both the running game and a half-recorded bag draft live in the companion
 * store, which persists them to localStorage — so the DM's phone can lock
 * or refresh (or open a second tab) without losing state.
 */
export default function Companion() {
  const snapshot = useCompanionStore();
  const { game, draft } = snapshot;

  if (game && game.phase.kind !== "reveal") {
    return (
      <CompanionGame
        state={game}
        update={companionStore.updateGame}
        history={{ ...historyControls(snapshot), ...HISTORY_VERBS }}
        onAbandon={companionStore.abandon}
      />
    );
  }
  if (draft) {
    return (
      <BagScreen
        draft={draft}
        onChange={companionStore.setDraft}
        onCancel={() => companionStore.setDraft(null)}
        onBegin={() => beginFromDraft(draft)}
      />
    );
  }
  return <SetupScreen onDeal={companionStore.setDraft} />;
}

/** Every seat recorded → deal the real game and start the first night. */
function beginFromDraft(d: BagDraft): void {
  const recorded: RecordedSeat[] = [];
  for (let i = 0; i < d.seats.length; i++) {
    const seat = d.seats[i];
    if (seat.traveller) {
      if (seat.traveller.character === null) return; // incomplete
      recorded.push({
        name: seat.name,
        traveller: { character: seat.traveller.character, alignment: seat.traveller.alignment },
      });
    } else {
      const token = d.draws[i];
      if (token === null) return; // incomplete
      recorded.push({ name: seat.name, token });
    }
  }
  const game = beginNight(
    createGame(setupFromDraws(recorded, d.bag), { storyteller: d.storyteller }),
  );
  companionStore.startGame(game);
}
