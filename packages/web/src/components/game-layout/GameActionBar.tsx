import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Surface } from "../ui";

/**
 * The bar a game passes as `GameScreen`'s `actionBar`: buttons only, the
 * move's buttons centred, side controls (undo, sound, resign) at the edges.
 * The centre column stays centred on the bar whatever the sides hold.
 */
export function GameActionBar({
  start,
  children,
  end,
  className,
}: {
  /** Left edge: settings-like toggles, undo. */
  start?: ReactNode;
  /** The centred buttons: what you can do right now. */
  children?: ReactNode;
  /** Right edge: resign, leave. */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <Surface
      variant="raised"
      padding="sm"
      data-testid="game-action-bar"
      className={cn(
        "grid min-h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-start gap-1">{start}</div>
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      <div className="flex min-w-0 items-center justify-end gap-2">{end}</div>
    </Surface>
  );
}
