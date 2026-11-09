import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui";

// A move that can't be taken back once it reaches the server (ending a
// Codenames turn spends a turn and hands the board over) gets a short grace
// window instead: the press arms it, the button turns into "Undo · N" for
// `delayMs`, and only then is the action sent. Esc (or Undo) cancels; Enter
// sends at once. Nothing reaches the other players before the window ends, so
// cancelling needs no rules and leaks nothing.

const TICK_MS = 250;

export interface PendingAction {
  /** True while the action waits out its grace window. */
  pending: boolean;
  /** Whole seconds left in the window (shown on the Undo button). */
  secondsLeft: number;
  arm: () => void;
  cancel: () => void;
  /** Send now instead of waiting. */
  commit: () => void;
}

export function usePendingAction({
  onCommit,
  enabled,
  delayMs = 5000,
}: {
  onCommit: () => void;
  /** When this turns false (the turn timed out, the game moved on) a pending action is dropped. */
  enabled: boolean;
  delayMs?: number;
}): PendingAction {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // The armed state also lives in a ref: a tick, Enter and a click can all
  // land before React re-renders, and the action must be sent exactly once.
  const armedRef = useRef(false);

  const cancel = useCallback(() => {
    armedRef.current = false;
    setDeadline(null);
  }, []);
  const commit = useCallback(() => {
    if (!armedRef.current) return;
    armedRef.current = false;
    setDeadline(null);
    commitRef.current();
  }, []);
  const arm = useCallback(() => {
    const t = Date.now();
    armedRef.current = true;
    setNow(t);
    setDeadline(t + delayMs);
  }, [delayMs]);

  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      if (t >= deadline) commit();
      else setNow(t);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [deadline, commit]);

  useEffect(() => {
    if (deadline === null) return;
    // Capture phase on window runs before a board's own key handlers, so Esc
    // cancels the pending action rather than putting down a picked card.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      else if (e.key === "Enter") commit();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deadline, cancel, commit]);

  const pending = deadline !== null;
  return {
    pending,
    secondsLeft: pending ? Math.max(1, Math.ceil((deadline - now) / 1000)) : 0,
    arm,
    cancel,
    commit,
  };
}

/** The button for a `usePendingAction`: its label at rest, "Undo · N" while armed. Fixed width, so the header doesn't move. */
export function UndoableActionButton({
  action,
  label,
  variant = "primary",
}: {
  action: PendingAction;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return action.pending ? (
    <Button
      size="sm"
      variant="secondary"
      onClick={action.cancel}
      title="Changed your mind? Undo (Esc) · send now (Enter)"
      className="min-w-24 tabular-nums"
    >
      Undo · {action.secondsLeft}
    </Button>
  ) : (
    <Button size="sm" variant={variant} onClick={action.arm} className="min-w-24">
      {label}
    </Button>
  );
}
