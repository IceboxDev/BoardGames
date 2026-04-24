import type { ParksPlayerView, SiteType } from "@boardgames/core/games/parks/types";
import {
  SITE_LABELS,
  START_POSITION,
  TRAIL_END_R1,
  TRAIL_END_R2,
  TRAIL_END_R3,
} from "@boardgames/core/games/parks/types";

interface TrailDisplayProps {
  view: ParksPlayerView;
  selectedHikerId: 0 | 1 | null;
  legalMoveTargets: Set<number>;
  onSelectMoveTarget: (pos: number) => void;
  myIndex: number;
}

const SITE_ICONS: Record<SiteType, string> = {
  parks: "🏞️",
  "gain-2W": "💧💧",
  "gain-2S": "☀️☀️",
  "gain-1M": "⛰️",
  "gain-1F": "🌲",
  "exchange-A": "🔄🦋",
  "canteen-or-photo": "🫙/📸",
  "trail-die": "🎲",
  shop: "🏪",
};

const SITE_BG: Record<SiteType, string> = {
  parks: "bg-amber-900/30 border-amber-500/40",
  "gain-2W": "bg-sky-900/30 border-sky-500/40",
  "gain-2S": "bg-yellow-900/30 border-yellow-500/40",
  "gain-1M": "bg-purple-900/30 border-purple-500/40",
  "gain-1F": "bg-emerald-900/30 border-emerald-500/40",
  "exchange-A": "bg-pink-900/30 border-pink-500/40",
  "canteen-or-photo": "bg-indigo-900/30 border-indigo-500/40",
  "trail-die": "bg-stone-800/50 border-stone-500/40",
  shop: "bg-orange-900/30 border-orange-500/40",
};

interface TrailEndRowMeta {
  position: number;
  label: string;
  icon: string;
  bg: string;
  bonusIcon: string;
  bonusLabel: string;
}

const TRAIL_END_META: TrailEndRowMeta[] = [
  {
    position: TRAIL_END_R1,
    label: "Park",
    icon: "🏞️",
    bg: "bg-amber-900/30",
    bonusIcon: "🥇",
    bonusLabel: "First-Player Token (+1 PT, sets next season's first turn)",
  },
  {
    position: TRAIL_END_R2,
    label: "Photo",
    icon: "📸",
    bg: "bg-violet-900/30",
    bonusIcon: "🦋",
    bonusLabel: "+1 Wildlife (first to land each season)",
  },
  {
    position: TRAIL_END_R3,
    label: "Shop",
    icon: "🏪",
    bg: "bg-orange-900/30",
    bonusIcon: "☀️",
    bonusLabel: "+1 Sun (first to land each season)",
  },
];

function HikerToken({
  playerIndex,
  hikerId,
  myIndex,
}: {
  playerIndex: number;
  hikerId: 0 | 1;
  myIndex: number;
}) {
  const isMe = playerIndex === myIndex;
  const color = isMe ? "bg-cyan-500 ring-cyan-300" : "bg-amber-500 ring-amber-300";
  return (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 text-[10px] font-bold text-white ${color}`}
      title={`${isMe ? "You" : "Opponent"} hiker ${hikerId + 1}`}
    >
      {hikerId + 1}
    </div>
  );
}

function TrailEndBox({
  view,
  selectedHikerId,
  legalMoveTargets,
  onSelectMoveTarget,
  myIndex,
  hikersAt,
}: TrailDisplayProps & { hikersAt: Map<number, { playerIndex: number; hikerId: 0 | 1 }[]> }) {
  return (
    <div
      className="flex min-h-[88px] min-w-0 flex-1 flex-col gap-0.5 rounded-lg border border-red-500/40 bg-red-950/20 p-0.5"
      title="Trail's End — pick a row"
    >
      {TRAIL_END_META.map((meta, idx) => {
        const rowIdx = idx as 0 | 1 | 2;
        const here = hikersAt.get(meta.position) ?? [];
        const isLegalTarget = selectedHikerId !== null && legalMoveTargets.has(meta.position);
        const occupier = view.trailEndRowFirstOccupier[rowIdx];
        const bonusClaimed = occupier !== null;
        const interactive = isLegalTarget
          ? "cursor-pointer hover:brightness-110 ring-1 ring-emerald-400 animate-pulse"
          : "";
        const tooltip = bonusClaimed
          ? `${meta.label} — bonus claimed by ${occupier === myIndex ? "you" : "opponent"}: ${meta.bonusLabel}`
          : `${meta.label} — first-occupier bonus: ${meta.bonusLabel}`;
        return (
          <button
            key={meta.position}
            type="button"
            onClick={isLegalTarget ? () => onSelectMoveTarget(meta.position) : undefined}
            disabled={!isLegalTarget}
            title={tooltip}
            className={`flex flex-1 items-center gap-1 rounded-md px-1 text-[10px] leading-none transition disabled:cursor-default ${meta.bg} ${interactive}`}
          >
            <span className="text-xs">{meta.icon}</span>
            <span className="font-semibold text-gray-100">{meta.label}</span>
            <span
              className={`text-[10px] ${bonusClaimed ? "text-stone-500 line-through" : "text-emerald-300"}`}
            >
              {meta.bonusIcon}
            </span>
            {here.length > 0 && (
              <span className="ml-auto flex shrink-0 gap-0.5">
                {here.map((h) => (
                  <HikerToken
                    key={`${h.playerIndex}-${h.hikerId}`}
                    playerIndex={h.playerIndex}
                    hikerId={h.hikerId}
                    myIndex={myIndex}
                  />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function TrailDisplay({
  view,
  selectedHikerId,
  legalMoveTargets,
  onSelectMoveTarget,
  myIndex,
}: TrailDisplayProps) {
  // Render order: START, sites[0..N-1], single Trail's End box (3 stacked rows).
  const sitePositions: number[] = [START_POSITION];
  for (let i = 0; i < view.trail.length; i++) sitePositions.push(i);

  // Per position, list hikers there
  const hikersAt = new Map<number, { playerIndex: number; hikerId: 0 | 1 }[]>();
  for (const p of view.players) {
    for (const h of p.hikers) {
      const list = hikersAt.get(h.position) ?? [];
      list.push({ playerIndex: p.index, hikerId: h.id });
      hikersAt.set(h.position, list);
    }
  }

  return (
    <div className="flex w-full items-stretch gap-1 py-2">
      {sitePositions.map((pos) => {
        const isStart = pos === START_POSITION;
        const isSite = !isStart;
        const site = isSite ? view.trail[pos] : null;
        const here = hikersAt.get(pos) ?? [];
        const isLegalTarget = selectedHikerId !== null && legalMoveTargets.has(pos);
        const weather = isSite ? view.weatherTokens[pos] : null;

        const baseClass = isSite && site ? SITE_BG[site] : "bg-gray-800/40 border-gray-600/40";

        const interactive = isLegalTarget
          ? "cursor-pointer hover:scale-105 ring-2 ring-emerald-400 animate-pulse"
          : "";

        const hasShutterbug = isSite && view.shutterbugTilePosition === pos;

        return (
          <button
            key={pos}
            type="button"
            onClick={isLegalTarget ? () => onSelectMoveTarget(pos) : undefined}
            disabled={!isLegalTarget}
            className={`relative flex min-h-[88px] min-w-0 flex-1 flex-col items-center justify-between rounded-lg border p-1 transition ${baseClass} ${interactive} disabled:cursor-default`}
          >
            {hasShutterbug && (
              <div
                className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-500 text-xs ring-2 ring-fuchsia-200/70"
                title={
                  view.shutterbugHolder === null
                    ? "Shutterbug — first hiker to land here takes the token (take 2 photos per Photo action)"
                    : `Shutterbug — currently held by ${view.shutterbugHolder === myIndex ? "you" : "opponent"}; landing here steals it`
                }
              >
                {"🐛"}
              </div>
            )}
            {weather && (
              <div
                className={`absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs ring-2 ${
                  weather === "S"
                    ? "bg-yellow-400/90 ring-yellow-200/60"
                    : "bg-sky-400/90 ring-sky-200/60"
                }`}
                title={`First-visit bonus: 1 ${weather === "S" ? "Sun" : "Water"}`}
              >
                {weather === "S" ? "☀️" : "💧"}
              </div>
            )}
            <div className="text-[9px] uppercase tracking-wider text-gray-400">
              {isStart ? "Start" : `#${pos + 1}`}
            </div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              {isSite && site ? (
                <>
                  <div className="text-xl">{SITE_ICONS[site]}</div>
                  <div className="mt-1 text-[8px] leading-tight text-gray-300">
                    {SITE_LABELS[site]}
                  </div>
                </>
              ) : (
                <div className="text-xl">{"\u{1F69B}"}</div>
              )}
            </div>
            {here.length > 0 && (
              <div className="mt-1 flex gap-0.5">
                {here.map((h) => (
                  <HikerToken
                    key={`${h.playerIndex}-${h.hikerId}`}
                    playerIndex={h.playerIndex}
                    hikerId={h.hikerId}
                    myIndex={myIndex}
                  />
                ))}
              </div>
            )}
          </button>
        );
      })}
      <TrailEndBox
        view={view}
        selectedHikerId={selectedHikerId}
        legalMoveTargets={legalMoveTargets}
        onSelectMoveTarget={onSelectMoveTarget}
        myIndex={myIndex}
        hikersAt={hikersAt}
      />
    </div>
  );
}
