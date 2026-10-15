import type { CardId } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import { type ReactNode, useMemo } from "react";
import { MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { neighbourOf, seatStatus, stageAges } from "../../logic/table";
import type { DraftInteraction } from "../../logic/useDraftInteraction";
import { StatusDot } from "../CityNavigator";
import CitySummary from "../city/CitySummary";
import Tableau from "../city/Tableau";
import WonderBoard from "../city/WonderBoard";
import SevenIcon, { CoinToken } from "../SevenIcon";

/**
 * A city, large: who it is and where it stands, its wonder board, and its
 * cards in colour columns beside its numbers. Every seat has one (it is all
 * public); only yours answers the card in your hand — the next wonder stage
 * glows if it can take it, and the card shows where it would go.
 */
export default function CityView({
  ix,
  seat,
  names,
}: {
  ix: DraftInteraction;
  seat: number;
  names: readonly string[];
}) {
  const { view, myIndex } = ix;
  const p = view.players[seat];
  const mine = seat === myIndex;
  const side = neighbourOf(myIndex, seat, view.playerCount);
  const status = seatStatus(view, seat);

  const fresh = useMemo(
    () =>
      new Set<CardId>(
        view.lastRevealed
          .filter((r) => r.playerIndex === seat && r.action === "play-card")
          .map((r) => r.cardId),
      ),
    [view.lastRevealed, seat],
  );

  if (!p) return <p className="text-sm text-fg-muted">Nobody sits there.</p>;

  const stages = getWonderDef(p.wonderId).sides[p.side].stages.length;
  const sel = mine ? ix.current : null;
  const stageLive = Boolean(sel && sel.wonder.length > 0 && ix.selectable);
  const ghost =
    mine && ix.selected && ix.current && ix.current.play.length > 0 ? ix.selected : null;
  const victories = p.militaryTokens.filter((t) => t > 0).reduce((a, b) => a + b, 0);
  const defeats = p.militaryTokens.filter((t) => t < 0).length;

  // Yours needs no label; another city says whose it is and where it sits.
  const owner = (
    <span className="flex min-w-0 items-center gap-1.5">
      {!mine && <span className="truncate font-semibold text-fg-strong">{names[seat]}</span>}
      <StatusDot status={status} />
      {side && (
        <span className="shrink-0 text-4xs font-semibold uppercase tracking-label text-fg-strong/60">
          {side === "left" ? "◂ your left" : "your right ▸"}
        </span>
      )}
      {!mine && <span className="shrink-0 text-fg-strong/50">· {p.handCount} in hand</span>}
    </span>
  );

  const conflicts = victories - defeats;
  // Four matched cells: icon and number at one size, centred over a label.
  const stats = (
    <div className="grid shrink-0 grid-cols-4 rounded-card-lg bg-surface-950/80 py-1.5 shadow-lg ring-1 ring-black/50 backdrop-blur-md">
      <Stat
        label="VP now"
        value={p.score.total}
        icon={<SevenIcon name="laurel" className="h-5 w-5" />}
      />
      <Stat label="Coins" value={p.coins} icon={<CoinToken className="h-5 w-5" />} />
      <Stat
        label="Shields"
        value={p.shields}
        icon={<SevenIcon name="shield" className="h-5 w-5" />}
      />
      <Stat
        label="Conflicts"
        value={conflicts > 0 ? `+${conflicts}` : conflicts < 0 ? `−${-conflicts}` : "0"}
        icon={<SevenIcon name={conflicts < 0 ? "defeat" : "victory"} className="h-5 w-5" />}
        title={`Military tokens: ${victories} VP won, ${defeats} defeat${defeats === 1 ? "" : "s"}`}
        tone={conflicts > 0 ? "text-emerald-300" : conflicts < 0 ? "text-rose-300" : undefined}
      />
    </div>
  );

  return (
    <div className="flex shrink-0 flex-col gap-2 lg:min-h-0 lg:flex-1 lg:shrink">
      <div className="flex flex-col gap-2 lg:h-[19rem] lg:shrink-0 lg:flex-row">
        <WonderBoard
          player={p}
          className="min-h-[19rem] lg:h-full lg:min-w-0 lg:flex-1"
          owner={owner}
          stats={stats}
          buildable={stageLive}
          blockedReason={
            mine && ix.selected && !stageLive
              ? p.stagesBuilt >= stages
                ? "Every stage is built"
                : "This card can't pay for the next stage"
              : undefined
          }
          onBuild={mine ? ix.wonder : undefined}
          pawns={view.playerEdifice?.[seat]?.participation}
          stageAges={stageAges(view.actionLog, seat)}
        />
        <CitySummary
          view={view}
          seat={seat}
          names={names}
          className="lg:h-full lg:w-[30rem] lg:shrink-0"
        />
      </div>

      {/* Phones scroll the seven columns sideways; wide screens fit them. */}
      <div className="flex h-[30rem] shrink-0 flex-col overflow-x-auto rounded-card-xl bg-surface-950/45 px-3 py-2 shadow-inner ring-1 ring-black/50 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-visible">
        <Tableau
          key={seat}
          tableau={p.tableau}
          fresh={fresh}
          ghost={ghost}
          className="min-h-0 min-w-[46rem] flex-1 lg:min-w-0"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  title,
  tone,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  title?: string;
  tone?: string;
}) {
  return (
    <div className="flex w-[4.25rem] flex-col items-center gap-0.5" title={title}>
      <span
        className={cn(
          "flex h-6 items-center justify-center gap-1 text-lg font-bold leading-none tabular-nums",
          tone ?? "text-fg-strong",
        )}
      >
        {icon}
        {value}
      </span>
      <MicroLabel>{label}</MicroLabel>
    </div>
  );
}
