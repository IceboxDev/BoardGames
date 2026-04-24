import type { Action, GearCard, ParksPlayerView } from "@boardgames/core/games/parks/types";
import {
  GEAR_BLIND_COST,
  GEAR_COSTS,
  GEAR_DESCRIPTIONS,
  GEAR_LABELS,
  GEAR_TRIGGER_ICONS,
  GEAR_TRIGGER_LABELS,
} from "@boardgames/core/games/parks/types";

interface GearMarketDisplayProps {
  view: ParksPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  onAction: (action: Action) => void;
}

function GearCardTile({
  card,
  cost,
  affordable,
  onClick,
}: {
  card: GearCard;
  cost: number;
  affordable: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick && affordable;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      title={`${GEAR_LABELS[card.kind]} · ${GEAR_TRIGGER_LABELS[card.trigger]} — ${GEAR_DESCRIPTIONS[card.kind]}`}
      className={`flex min-w-[110px] max-w-[130px] flex-col gap-1 rounded-md border bg-stone-900/60 p-1.5 text-left transition disabled:cursor-default ${
        interactive
          ? "cursor-pointer border-amber-500/60 ring-1 ring-amber-400/30 hover:bg-stone-800"
          : affordable
            ? "border-stone-700/60"
            : "border-stone-700/60 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="flex items-center gap-1 text-[11px] font-bold leading-tight text-white">
          <span>{GEAR_LABELS[card.kind]}</span>
          <span
            className="rounded bg-stone-800 px-1 text-[10px]"
            title={GEAR_TRIGGER_LABELS[card.trigger]}
          >
            {GEAR_TRIGGER_ICONS[card.trigger]}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 rounded bg-yellow-900/40 px-1 py-0.5 text-[10px] font-bold text-yellow-300">
          <span>{cost}</span>
          <span>{"\u2600\uFE0F"}</span>
        </span>
      </div>
      <p className="text-[9px] leading-snug text-stone-300">{GEAR_DESCRIPTIONS[card.kind]}</p>
    </button>
  );
}

export default function GearMarketDisplay({
  view,
  legalActions,
  isMyTurn,
  onAction,
}: GearMarketDisplayProps) {
  const buyDisplayActions = isMyTurn
    ? legalActions.filter(
        (a): a is Action & { type: "buy-gear"; source: "display"; index: number } =>
          a.type === "buy-gear" && a.source === "display",
      )
    : [];
  const buyBlindAction = isMyTurn
    ? legalActions.find(
        (a): a is Action & { type: "buy-gear"; source: "deck-blind" } =>
          a.type === "buy-gear" && a.source === "deck-blind",
      )
    : undefined;

  const buyableIndices = new Set(buyDisplayActions.map((a) => a.index));
  const canBuyDisplay = buyDisplayActions.length > 0;
  const canBuyBlind = !!buyBlindAction;
  const inShop = canBuyDisplay || canBuyBlind;

  return (
    <div className="flex h-full flex-col rounded-lg bg-stone-900/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Trading Post
        </span>
        {inShop && (
          <span className="text-[9px] text-emerald-400" title="Buy a gear card">
            {"\u2713"} Buy gear
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {view.gearMarketVisible.map((card, idx) => {
          const cost = GEAR_COSTS[card.kind];
          const affordable = buyableIndices.has(idx);
          const action = buyDisplayActions.find((a) => a.index === idx);
          return (
            <GearCardTile
              key={card.id}
              card={card}
              cost={cost}
              affordable={affordable}
              onClick={action ? () => onAction(action) : undefined}
            />
          );
        })}
        {view.gearDeckCount > 0 && (
          <button
            type="button"
            disabled={!canBuyBlind}
            onClick={canBuyBlind && buyBlindAction ? () => onAction(buyBlindAction) : undefined}
            title={`Buy face-down (${GEAR_BLIND_COST} Sun) — ${view.gearDeckCount} left`}
            className={`flex min-w-[80px] flex-col items-center justify-center gap-0.5 rounded-md border p-1.5 text-center transition disabled:cursor-default ${
              canBuyBlind
                ? "cursor-pointer border-amber-400 bg-stone-800 ring-1 ring-amber-400/40 hover:bg-stone-700"
                : "border-stone-700/60 bg-stone-800/60"
            }`}
          >
            <div className="text-lg">{"\uD83C\uDCA0"}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-stone-300">
              Blind
            </div>
            <div className="flex items-center gap-0.5 text-[9px] text-amber-300">
              <span>{GEAR_BLIND_COST}</span>
              <span>{"\u2600\uFE0F"}</span>
            </div>
            <div className="text-[9px] text-stone-500">{view.gearDeckCount}</div>
          </button>
        )}
        {view.gearMarketVisible.length === 0 && view.gearDeckCount === 0 && (
          <span className="text-[10px] italic text-stone-500">empty</span>
        )}
      </div>
    </div>
  );
}
