/**
 * The bar under the board. Buttons only: flip, walk the line (⏮ ◀ ▶ ⏭, and
 * ← / → on the keyboard — the only thing the arrow keys do here; F flips), and — when the move just played
 * isn't your tree's — make it yours, or hand a position back to the engine.
 */
import { useEffect } from "react";
import { Button, Surface } from "../../../../components/ui";

interface Props {
  readonly ply: number;
  readonly length: number;
  readonly onGoTo: (ply: number) => void;
  readonly onStep: (delta: -1 | 1) => void;
  readonly onFlip: () => void;
  /** "Make {san} my move", when the last move was yours and not the tree's. */
  readonly makeMine: { san: string; run: () => void } | null;
  /** "Engine's best here", when you chose this position's move yourself. */
  readonly engineBest: (() => void) | null;
  readonly busy: boolean;
}

export function TrainerActions({
  ply,
  length,
  onGoTo,
  onStep,
  onFlip,
  makeMine,
  engineBest,
  busy,
}: Props) {
  // ← and → step one move back and forward — the arrow keys do nothing else
  // here (no focus moving, no scrolling). Typing in a field is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]"))
        return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.startsWith("Arrow")) {
        // Caught before anything focused sees it.
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowLeft") onStep(-1);
        if (e.key === "ArrowRight") onStep(1);
      } else if (e.key === "f" || e.key === "F") {
        onFlip();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onStep, onFlip]);

  return (
    <Surface
      variant="raised"
      padding="sm"
      className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 whitespace-nowrap lg:grid lg:grid-cols-[1fr_auto_1fr]"
    >
      <div className="flex items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onFlip} title="Turn the board around (F)">
          ⇅ Flip
        </Button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onGoTo(0)}
          disabled={ply === 0}
          title="Start"
        >
          ⏮
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onGoTo(ply - 1)}
          disabled={ply === 0}
          title="Back (←)"
        >
          ◀
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onGoTo(ply + 1)}
          disabled={ply >= length}
          title="Forward (→)"
        >
          ▶
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onGoTo(length)}
          disabled={ply >= length}
          title="End of the line"
        >
          ⏭
        </Button>
      </div>
      <div className="flex items-center justify-end gap-2">
        {engineBest && (
          <Button
            size="xs"
            variant="secondary"
            onClick={engineBest}
            disabled={busy}
            title="Let the engine choose your move here again; the tree regrows from here"
          >
            ↺ Engine's best here
          </Button>
        )}
        {makeMine && (
          <Button
            size="xs"
            variant="tinted"
            tone="amber"
            onClick={makeMine.run}
            disabled={busy}
            title="Play this move here in your repertoire; the tree regrows from here"
          >
            ★ Make {makeMine.san} my move
          </Button>
        )}
      </div>
    </Surface>
  );
}
