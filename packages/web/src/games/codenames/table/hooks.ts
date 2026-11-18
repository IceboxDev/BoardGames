import { useEffect, useRef, useState } from "react";

// The live table's shared state and keys: the cards a clue-giver taps while
// writing a clue, and the board's Enter / Esc.

/**
 * The cards a clue-giver taps while writing a clue — what it means. Kept per
 * live turn: a new `turnKey` (turn or phase) starts clean.
 */
export function useClueTargets(turnKey: string) {
  const [chosenFor, setChosenFor] = useState<{ turn: string; cards: number[] }>({
    turn: turnKey,
    cards: [],
  });
  const chosen = chosenFor.turn === turnKey ? chosenFor.cards : [];
  const toggle = (card: number) =>
    setChosenFor({
      turn: turnKey,
      cards: chosen.includes(card) ? chosen.filter((c) => c !== card) : [...chosen, card],
    });
  return { chosen, toggle };
}

/** Typing somewhere (chat, the clue): board keys stay out of the way. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * The board's keys, ignored while typing. `onEnter` returns whether it acted
 * (then the key's default is stopped). A focused button keeps its own Enter
 * unless it is a word card (`data-word-card`), whose Enter would otherwise
 * only repeat the tap.
 */
export function useTableKeys(keys: { onEscape?: () => void; onEnter?: () => boolean }) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.key === "Escape") {
        latest.current.onEscape?.();
        return;
      }
      if (e.key !== "Enter" || !latest.current.onEnter) return;
      const control = e.target instanceof HTMLElement ? e.target.closest("button") : null;
      if (control && control.dataset.wordCard === undefined) return;
      if (latest.current.onEnter()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
