import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { beginNight, createGame } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { setupFromDraws } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useCallback, useState } from "react";
import BagScreen from "./BagScreen";
import CompanionGame from "./CompanionGame";
import { type BagDraft, loadBagDraft, loadGame, saveBagDraft, saveGame } from "./persistence";
import SetupScreen from "./SetupScreen";

export type UpdateState = (fn: (state: CompanionState) => CompanionState) => void;

/**
 * Storyteller companion root. Three stages, phone always in the ST's hands:
 *   1. SetupScreen  — roster (+ who is the Storyteller), roll the bag
 *   2. BagScreen    — physical tokens go in the bag, players draw, ST records
 *   3. CompanionGame — grimoire, night wizard, day tracker
 * Both the running game and a half-recorded bag draft persist to
 * localStorage, so the DM's phone can lock or refresh without losing state.
 */
export default function Companion() {
  const [state, setState] = useState<CompanionState | null>(() => loadGame());
  const [draft, setDraft] = useState<BagDraft | null>(() => loadBagDraft());

  const update = useCallback<UpdateState>((fn) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveGame(next);
      return next;
    });
  }, []);

  const changeDraft = useCallback((next: BagDraft | null) => {
    saveBagDraft(next);
    setDraft(next);
  }, []);

  const beginFromDraft = useCallback(
    (d: BagDraft) => {
      const draws = d.draws.filter((x): x is CharacterId => x !== null);
      if (draws.length !== d.names.length) return;
      const game = beginNight(createGame(setupFromDraws(d.names, d.bag, draws)));
      saveGame(game);
      changeDraft(null);
      setState(game);
    },
    [changeDraft],
  );

  const abandon = useCallback(() => {
    saveGame(null);
    saveBagDraft(null);
    setDraft(null);
    setState(null);
  }, []);

  if (state && state.phase.kind !== "reveal") {
    return <CompanionGame state={state} update={update} onAbandon={abandon} />;
  }
  if (draft) {
    return (
      <BagScreen
        draft={draft}
        onChange={changeDraft}
        onCancel={() => changeDraft(null)}
        onBegin={() => beginFromDraft(draft)}
      />
    );
  }
  return <SetupScreen onDeal={(d) => changeDraft(d)} />;
}
