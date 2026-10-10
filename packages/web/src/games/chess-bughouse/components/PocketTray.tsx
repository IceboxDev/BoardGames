import type { Color, Pockets, PocketType } from "@boardgames/core/games/chess/engine/types";
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { PIECE_URL } from "../../chess/components/board/pieces";
import { POCKET_ORDER } from "../../chess/logic/moves";

interface Props {
  pockets: Pockets | null;
  color: Color;
  /** The picked piece's drop key (`"N@"`), or `null`. */
  picked: string | null;
  /** Set when these pieces can be dropped now; omitted for a read-only pocket. */
  onPick?: (key: string | null) => void;
  /** Drop keys with at least one legal drop right now. */
  droppable?: ReadonlySet<string>;
}

const key = (type: PocketType) => `${type.toUpperCase()}@`;

/** The pieces in hand. Click one, then a square, to drop it. */
export function PocketTray({ pockets, color, picked, onPick, droppable }: Props) {
  const pocket = pockets?.[color];
  const any = pocket ? POCKET_ORDER.some((t) => pocket[t] > 0) : false;
  return (
    <div className="flex h-8 items-center gap-1">
      <span className="sr-only">{color === "w" ? "White" : "Black"} pieces in hand:</span>
      {!any && <span className="text-xs text-fg-disabled">No pieces in hand</span>}
      {pocket &&
        POCKET_ORDER.filter((t) => pocket[t] > 0).map((t) => {
          const piece = (color === "w" ? t.toUpperCase() : t) as keyof typeof PIECE_URL;
          const active = !!onPick && (droppable?.has(key(t)) ?? false);
          const content = (
            <>
              <img src={PIECE_URL[piece]} alt="" className="size-7" />
              {pocket[t] > 1 && (
                <span className="text-xs font-bold text-fg-strong">×{pocket[t]}</span>
              )}
            </>
          );
          return active ? (
            <Button
              key={t}
              variant="plain"
              size="xs"
              onClick={() => onPick?.(picked === key(t) ? null : key(t))}
              aria-pressed={picked === key(t)}
              title={`Drop a ${t === "p" ? "pawn" : t === "n" ? "knight" : t === "b" ? "bishop" : t === "r" ? "rook" : "queen"}`}
              className={cn(
                "flex items-center gap-0.5 rounded-ui-md px-1 hover:bg-fill",
                picked === key(t) && "bg-fill-strong ring-1 ring-accent-400",
              )}
            >
              {content}
            </Button>
          ) : (
            <span key={t} className="flex items-center gap-0.5 px-1 opacity-80">
              {content}
            </span>
          );
        })}
    </div>
  );
}
