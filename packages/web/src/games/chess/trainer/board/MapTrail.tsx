import { ChevronLeftIcon, ChevronRightIcon } from "../../../../components/icons";
import { Button, IconButton } from "../../../../components/ui";

/**
 * Where the map is, at the header's right: a back arrow, the level above (also
 * a way back) and the level shown. One control for every way up, the small
 * folders' block included.
 */
export function MapTrail({
  parent,
  current,
  onUp,
}: {
  parent: string | null;
  current: string;
  onUp: () => void;
}) {
  return (
    <nav aria-label="Map level" className="flex min-w-0 items-center gap-1 text-sm">
      {parent !== null && (
        <>
          <IconButton
            icon={<ChevronLeftIcon className="size-4" />}
            aria-label={`Back to ${parent}`}
            variant="ghost"
            size="sm"
            onClick={onUp}
          />
          <Button variant="ghost" size="sm" onClick={onUp} className="min-w-0 text-fg-muted">
            <span className="truncate">{parent}</span>
          </Button>
          <ChevronRightIcon className="size-3 shrink-0 text-fg-disabled" />
        </>
      )}
      <span className="truncate px-1 font-bold text-fg-strong">{current}</span>
    </nav>
  );
}
