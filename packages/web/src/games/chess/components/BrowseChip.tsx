import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";

/**
 * Over the live board while you look back through the moves: where you are,
 * and the way back to now. It floats over the board's top edge and takes no
 * layout space; a move arriving meanwhile turns it to "New move".
 */
export function BrowseChip({
  ply,
  total,
  fresh,
  onLive,
}: {
  ply: number;
  total: number;
  /** A move arrived while browsing. */
  fresh: boolean;
  onLive: () => void;
}) {
  return (
    <Button
      variant="plain"
      size="xs"
      onClick={onLive}
      className={cn(
        "absolute inset-x-0 top-2 z-raised mx-auto w-fit rounded-full bg-surface-900/90 px-3 py-1 text-xs font-semibold shadow-lg ring-1 backdrop-blur",
        fresh ? "text-accent-300 ring-accent-400/50" : "text-fg-primary ring-line-strong",
      )}
    >
      {fresh
        ? "New move"
        : ply === 0
          ? "Start position"
          : `Move ${Math.ceil(ply / 2)} of ${Math.ceil(total / 2)}`}
      <span className="text-fg-muted"> · </span>
      Back to live ›
    </Button>
  );
}
