import type {
  Action,
  Canteen,
  GearCard,
  Park,
  ParksPlayerView,
  ResourceType,
  WaterGapIndex,
} from "@boardgames/core/games/parks/types";
import {
  CANTEEN_BOARD_WATER_GAPS,
  CANTEEN_LABELS,
  GEAR_DESCRIPTIONS,
  GEAR_LABELS,
  GEAR_TRIGGER_ICONS,
  GEAR_TRIGGER_LABELS,
  PASSION_DESCRIPTIONS,
  PASSION_LABELS,
  RESOURCE_COLORS,
  RESOURCE_EMOJI,
  RESOURCE_LABELS,
  WATER_GAP_TO_ROW,
} from "@boardgames/core/games/parks/types";

interface PlayerAreaProps {
  player: ParksPlayerView["players"][number];
  isMe: boolean;
  isActive: boolean;
  selectedCanteenId: number | null;
  onSelectCanteen?: (canteenId: number) => void;
  canUseCanteens: boolean;
  /** This player currently holds the Shutterbug token. */
  hasShutterbug?: boolean;
  /** This player currently holds the First-Player Token. */
  hasFirstPlayerToken?: boolean;
  /** Legal actions filtered for the active player; only used when isMe. */
  legalActions?: Action[];
  onAction?: (action: Action) => void;
}

function ResourcePill({ r, count }: { r: ResourceType; count: number }) {
  return (
    <div
      className={`flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold text-white ${count === 0 ? "opacity-30" : ""}`}
      style={{ backgroundColor: `${RESOURCE_COLORS[r]}33` }}
      title={`${count} × ${RESOURCE_LABELS[r]}`}
    >
      <span>{RESOURCE_EMOJI[r]}</span>
      <span className="tabular-nums">{count}</span>
    </div>
  );
}

function MiniParkBadge({
  park,
  reserved,
  affordable,
  onClick,
}: {
  park: Park;
  reserved?: boolean;
  affordable?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!(reserved && affordable && onClick);
  const className = `inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-stone-200 ring-1 ${
    interactive
      ? "cursor-pointer bg-amber-800/60 ring-emerald-400/60 hover:bg-amber-700/70"
      : reserved
        ? "bg-amber-950/50 ring-amber-600/60"
        : "bg-stone-800 ring-stone-600"
  }`;
  const title = `${reserved ? "Reserved · " : ""}${park.name} (${park.pt} PT)${interactive ? " — click to buy" : ""}`;
  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className} title={title}>
        <span className="mr-0.5 text-amber-400">{"\uD83D\uDD16"}</span>
        {park.name} <span className="text-yellow-300">{park.pt}</span>
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {reserved && <span className="mr-0.5 text-amber-400">{"\uD83D\uDD16"}</span>}
      {park.name} <span className="text-yellow-300">{park.pt}</span>
    </span>
  );
}

function GearChip({
  gear,
  used,
  activatable,
  onClick,
}: {
  gear: GearCard;
  used: boolean;
  activatable: boolean;
  onClick?: () => void;
}) {
  const baseClasses =
    "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition disabled:cursor-default";
  const stateClasses = used
    ? "border-stone-700 bg-stone-800/60 text-stone-500 line-through"
    : activatable
      ? "cursor-pointer border-amber-400 bg-amber-700/40 text-amber-50 ring-1 ring-emerald-400/40 hover:bg-amber-600/50"
      : "border-stone-700 bg-stone-900/60 text-stone-300";
  return (
    <button
      type="button"
      onClick={activatable ? onClick : undefined}
      disabled={!activatable}
      className={`${baseClasses} ${stateClasses}`}
      title={`${GEAR_LABELS[gear.kind]} · ${GEAR_TRIGGER_LABELS[gear.trigger]} — ${GEAR_DESCRIPTIONS[gear.kind]}`}
    >
      <span>{"\uD83C\uDF92"}</span>
      <span className="leading-tight">{GEAR_LABELS[gear.kind]}</span>
      <span className="rounded bg-stone-800 px-0.5 text-[9px]">
        {GEAR_TRIGGER_ICONS[gear.trigger]}
      </span>
    </button>
  );
}

function CanteenSlot({
  canteen,
  activated,
  selectable,
  selected,
  onClick,
}: {
  canteen: Canteen | null;
  activated: boolean;
  selectable: boolean;
  selected: boolean;
  onClick?: () => void;
}) {
  if (!canteen) {
    return (
      <div className="flex h-9 w-16 items-center justify-center rounded-md border border-dashed border-stone-700 bg-stone-900/30 text-[9px] italic text-stone-600">
        empty
      </div>
    );
  }
  const baseClasses =
    "flex h-9 w-16 items-center justify-center rounded-md border px-1 text-center text-[10px] font-semibold transition disabled:cursor-default";
  const stateClasses = canteen.used
    ? "border-stone-700 bg-stone-800/60 text-stone-500 line-through"
    : selected
      ? "border-emerald-300 bg-emerald-700 text-white ring-2 ring-emerald-300"
      : selectable
        ? "border-violet-400/60 bg-violet-700/60 text-violet-50 hover:bg-violet-600 cursor-pointer"
        : activated
          ? "border-violet-500/60 bg-violet-900/60 text-violet-100"
          : "border-stone-700 bg-stone-900/40 text-stone-400";
  return (
    <button
      type="button"
      onClick={selectable ? onClick : undefined}
      disabled={!selectable}
      className={`${baseClasses} ${stateClasses}`}
      title={CANTEEN_LABELS[canteen.effect]}
    >
      <span className="leading-tight">{CANTEEN_LABELS[canteen.effect]}</span>
    </button>
  );
}

function WaterGap({ filled }: { filled: boolean }) {
  const stateClasses = filled
    ? "border-sky-300/60 bg-sky-600 text-white"
    : "border-stone-700 bg-stone-900/30 text-stone-700";
  return (
    <div
      className={`flex h-9 w-6 items-center justify-center rounded-md border text-sm ${stateClasses}`}
      title={filled ? "Water token placed" : "Empty gap"}
    >
      {filled ? "\uD83D\uDCA7" : "\u00B7"}
    </div>
  );
}

function CanteenBoard({
  player,
  selectedCanteenId,
  onSelectCanteen,
  canUseCanteens,
  isMe,
}: {
  player: ParksPlayerView["players"][number];
  selectedCanteenId: number | null;
  onSelectCanteen?: (canteenId: number) => void;
  canUseCanteens: boolean;
  isMe: boolean;
}) {
  // Build slot → canteen map
  const bySlot = new Map<number, Canteen>();
  for (const c of player.canteens) bySlot.set(c.slot, c);

  const rowActivated = (row: 0 | 1 | 2) => {
    for (let g = 0; g < CANTEEN_BOARD_WATER_GAPS; g++) {
      if (player.waterTokens[g] && WATER_GAP_TO_ROW[g as WaterGapIndex] === row) return true;
    }
    return false;
  };

  // Layout: row r has slots [2r, 2r+1] separated by gap r.
  const renderRow = (row: 0 | 1 | 2) => {
    const slot0 = row * 2;
    const slot1 = row * 2 + 1;
    const gap = row as WaterGapIndex;
    const activated = rowActivated(row);
    const c0 = bySlot.get(slot0) ?? null;
    const c1 = bySlot.get(slot1) ?? null;

    const slotProps = (c: Canteen | null) => ({
      canteen: c,
      activated,
      selectable: !!(isMe && c && canUseCanteens && !c.used && activated),
      selected: !!c && selectedCanteenId === c.id,
      onClick: c ? () => onSelectCanteen?.(c.id) : undefined,
    });

    return (
      <div
        key={row}
        className={`flex items-center gap-1 rounded-md p-1 ${activated ? "bg-violet-900/30 ring-1 ring-violet-500/40" : ""}`}
      >
        <CanteenSlot {...slotProps(c0)} />
        <WaterGap filled={!!player.waterTokens[gap]} />
        <CanteenSlot {...slotProps(c1)} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {renderRow(0)}
      {renderRow(1)}
      {renderRow(2)}
    </div>
  );
}

export default function PlayerArea({
  player,
  isMe,
  isActive,
  selectedCanteenId,
  onSelectCanteen,
  canUseCanteens,
  hasShutterbug,
  hasFirstPlayerToken,
  legalActions,
  onAction,
}: PlayerAreaProps) {
  const accent = isMe ? "border-cyan-500/40 bg-cyan-950/20" : "border-amber-500/40 bg-amber-950/20";
  const activeRing = isActive ? "ring-2 ring-emerald-400/60" : "";

  const activateActionByGearId = new Map<number, Action & { type: "activate-gear" }>();
  const buyReservedActionByParkId = new Map<number, Action & { type: "buy-park-reserved" }>();
  if (isMe && legalActions) {
    for (const a of legalActions) {
      if (a.type === "activate-gear") activateActionByGearId.set(a.gearId, a);
      else if (a.type === "buy-park-reserved") buyReservedActionByParkId.set(a.parkId, a);
    }
  }

  const allParks = [
    ...player.parks.map((p) => ({ park: p, reserved: false })),
    ...player.reservedParks.map((p) => ({ park: p, reserved: true })),
  ];

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-1 overflow-y-auto rounded-lg border p-1.5 ${accent} ${activeRing}`}
    >
      {/* Top row: identity + counters + resources + campfire + passion */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-xs font-bold ${isMe ? "text-cyan-300" : "text-amber-300"}`}>
          {isMe ? "You" : "Opponent"}
        </span>
        {isActive && (
          <span className="rounded-full bg-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
            Turn
          </span>
        )}
        <div className="flex flex-wrap gap-1">
          {(["M", "F", "S", "W", "A"] as ResourceType[]).map((r) => (
            <ResourcePill key={r} r={r} count={player.resources[r]} />
          ))}
        </div>
        <span
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
            player.campfireLit
              ? "border-orange-400/60 bg-orange-700/30 text-orange-100"
              : "border-stone-700/60 bg-stone-900/40 text-stone-500"
          }`}
          title={
            player.campfireLit
              ? "Campfire lit — you can move onto an occupied tile (extinguishes after)"
              : "Campfire out — relit at season start, by Flint & Tinder, or by Sleeping Bag"
          }
        >
          <span>{player.campfireLit ? "\uD83D\uDD25" : "\uD83D\uDCA8"}</span>
          <span>{player.campfireLit ? "Lit" : "Out"}</span>
        </span>
        {hasShutterbug && (
          <span
            className="flex items-center gap-1 rounded-full border border-fuchsia-400/60 bg-fuchsia-700/40 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-100"
            title="Shutterbug — your Photo actions take 2 photos instead of 1 (still costs 1 resource)"
          >
            <span>{"🐛"}</span>
            <span>Shutterbug</span>
          </span>
        )}
        {hasFirstPlayerToken && (
          <span
            className="flex items-center gap-1 rounded-full border border-yellow-400/60 bg-yellow-700/40 px-1.5 py-0.5 text-[10px] font-bold text-yellow-100"
            title="First-Player Token — you go first next season; +1 PT at game end"
          >
            <span>{"🥇"}</span>
            <span>First Player</span>
          </span>
        )}
        <span
          className="ml-auto rounded bg-stone-900/60 px-1.5 py-0.5 text-[10px] text-stone-300"
          title={player.passion ? PASSION_DESCRIPTIONS[player.passion] : "Picking passion…"}
        >
          <span className="font-semibold text-violet-300">Passion:</span>{" "}
          {player.passion ? (
            PASSION_LABELS[player.passion]
          ) : (
            <span className="italic text-stone-500">picking…</span>
          )}
        </span>
        <span className="text-[10px] text-gray-500">
          P {player.parks.length} {"\u00b7"} Ph {player.photoCount} {"\u00b7"} G{" "}
          {player.gear.length}
        </span>
      </div>

      {/* Gear tray */}
      {player.gear.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-stone-900/30 p-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300">Gear</span>
          {player.gear.map((g) => {
            const used = player.usedGearThisTurn.includes(g.id);
            const action = activateActionByGearId.get(g.id);
            const activatable = !!action && isMe;
            return (
              <GearChip
                key={g.id}
                gear={g}
                used={used}
                activatable={activatable}
                onClick={action && onAction ? () => onAction(action) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Bottom row: canteen board + parks list side by side */}
      <div className="flex items-start gap-2">
        <CanteenBoard
          player={player}
          selectedCanteenId={selectedCanteenId}
          onSelectCanteen={onSelectCanteen}
          canUseCanteens={canUseCanteens}
          isMe={isMe}
        />
        {allParks.length > 0 && (
          <div className="flex flex-1 flex-wrap content-start gap-1">
            {allParks.map(({ park, reserved }) => {
              const buyAction = reserved ? buyReservedActionByParkId.get(park.id) : undefined;
              return (
                <MiniParkBadge
                  key={`${reserved ? "r" : "p"}-${park.id}`}
                  park={park}
                  reserved={reserved}
                  affordable={!!buyAction}
                  onClick={buyAction && onAction ? () => onAction(buyAction) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
