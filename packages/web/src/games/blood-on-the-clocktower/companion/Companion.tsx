import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useCallback, useState } from "react";
import CompanionGame from "./CompanionGame";
import { loadGame, saveGame } from "./persistence";
import RevealScreen from "./RevealScreen";
import SetupScreen from "./SetupScreen";

export type UpdateState = (fn: (state: CompanionState) => CompanionState) => void;

/**
 * Storyteller companion root. Three stages:
 *   1. no saved game  → SetupScreen (roster + deal)
 *   2. reveal phase   → RevealScreen (pass the phone around)
 *   3. running game   → CompanionGame (grimoire, night wizard, day tracker)
 * The whole state persists to localStorage on every change, so the DM's phone
 * can lock or refresh mid-game without losing the night.
 */
export default function Companion() {
  const [state, setState] = useState<CompanionState | null>(() => loadGame());

  const update = useCallback<UpdateState>((fn) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveGame(next);
      return next;
    });
  }, []);

  const start = useCallback((initial: CompanionState) => {
    saveGame(initial);
    setState(initial);
  }, []);

  const abandon = useCallback(() => {
    saveGame(null);
    setState(null);
  }, []);

  if (!state) return <SetupScreen onStart={start} />;
  if (state.phase.kind === "reveal") {
    return <RevealScreen state={state} update={update} onAbandon={abandon} />;
  }
  return <CompanionGame state={state} update={update} onAbandon={abandon} />;
}
