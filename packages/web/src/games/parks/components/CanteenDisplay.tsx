import type { Action, CanteenEffect, ParksPlayerView } from "@boardgames/core/games/parks/types";
import { CANTEEN_LABELS } from "@boardgames/core/games/parks/types";

interface CanteenDisplayProps {
  view: ParksPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  onAction: (action: Action) => void;
}

const CANTEEN_ICONS: Record<CanteenEffect, string> = {
  "2W": "\uD83D\uDCA7", // water drop
  "2S": "\u2600\uFE0F", // sun
  "1M": "\u26F0\uFE0F", // mountain
  "1F": "\uD83C\uDF32", // tree
  "exchange-A": "\uD83D\uDD04", // refresh
  photo: "\uD83D\uDCF8", // camera
  "park-action": "\uD83C\uDFDE\uFE0F", // park
};

const CANTEEN_BADGE: Record<CanteenEffect, string> = {
  "2W": "×2",
  "2S": "×2",
  "1M": "",
  "1F": "",
  "exchange-A": "",
  photo: "",
  "park-action": "",
};

export default function CanteenDisplay({
  view,
  legalActions,
  isMyTurn,
  onAction,
}: CanteenDisplayProps) {
  const isDrawing = isMyTurn && view.phase === "awaiting-canteen-draw";
  const canDrawPile = isDrawing && view.canteenPoolCount > 0;

  const drawDisplayAction = (idx: number) =>
    isDrawing
      ? legalActions.find(
          (a) => a.type === "draw-canteen" && a.source === "display" && a.displayIndex === idx,
        )
      : undefined;

  const drawPileAction = isDrawing
    ? legalActions.find((a) => a.type === "draw-canteen" && a.source === "pile")
    : undefined;

  return (
    <div className="flex h-full flex-col rounded-lg bg-stone-900/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
          Canteens
        </span>
        {isDrawing && (
          <span className="text-[9px] text-emerald-400" title="Pick a canteen to take">
            {"\u2713"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-wrap items-start gap-1">
        {view.canteenDisplay.map((c, i) => {
          const action = drawDisplayAction(i);
          const clickable = !!action;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: display index drives the action target
              key={`${c}-${i}`}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onAction(action) : undefined}
              title={CANTEEN_LABELS[c]}
              className={`relative flex h-10 w-10 items-center justify-center rounded-md border text-lg transition disabled:cursor-default ${
                clickable
                  ? "cursor-pointer border-violet-400 bg-violet-700/60 hover:bg-violet-600 ring-1 ring-emerald-400/40"
                  : "border-violet-700/40 bg-violet-950/40"
              }`}
            >
              <span>{CANTEEN_ICONS[c]}</span>
              {CANTEEN_BADGE[c] && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded bg-stone-900/90 px-0.5 text-[8px] font-bold text-violet-200">
                  {CANTEEN_BADGE[c]}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!canDrawPile}
          onClick={canDrawPile && drawPileAction ? () => onAction(drawPileAction) : undefined}
          title={`Draw blind from pile (${view.canteenPoolCount} left)`}
          className={`relative flex h-10 w-10 items-center justify-center rounded-md border text-lg transition disabled:cursor-default ${
            canDrawPile
              ? "cursor-pointer border-violet-400 bg-stone-800 hover:bg-stone-700 ring-1 ring-emerald-400/40"
              : "border-stone-700/60 bg-stone-900/40"
          }`}
        >
          <span>{"\uD83C\uDCA0"}</span>
          <span className="absolute -bottom-0.5 -right-0.5 rounded bg-stone-900/90 px-0.5 text-[8px] font-bold text-stone-300">
            {view.canteenPoolCount}
          </span>
        </button>
        {view.canteenDisplay.length === 0 && view.canteenPoolCount === 0 && (
          <span className="text-[10px] italic text-stone-500">empty</span>
        )}
      </div>
    </div>
  );
}
