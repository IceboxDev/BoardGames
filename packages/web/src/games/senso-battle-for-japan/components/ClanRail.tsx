import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_SHORT } from "@boardgames/core/games/senso-battle-for-japan/types";
import { MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { CLAN_FILL, CLAN_INK, EMPEROR_GOLD } from "../colors";
import { seatLabel } from "../logic/seat-labels";

interface Props {
  view: SensoPlayerView;
  names: readonly (string | null)[];
  activeSeat: number;
}

const PHASE_LABEL: Record<SensoPlayerView["phase"], string> = {
  trick: "Conflicts",
  "trick-settle": "Conflicts",
  rewards: "Rewards",
  bonus: "Bonus cube",
  "game-over": "Final",
};

/** Seven pips per seat with the 1 / 3 / 5 / 7 reward thresholds ringed. */
export function TrickPips({ won }: { won: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${won} conflicts won`}>
      {Array.from({ length: 7 }, (_, i) => {
        const n = i + 1;
        const filled = n <= won;
        const threshold = n % 2 === 1;
        return (
          <span
            key={n}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              filled ? "bg-amber-400" : "bg-fill-strong",
              threshold && !filled && "ring-1 ring-amber-400/50",
            )}
          />
        );
      })}
      {won > 7 && <span className="text-4xs text-fg-muted">+{won - 7}</span>}
    </div>
  );
}

export default function ClanRail({ view, names, activeSeat }: Props) {
  return (
    <div className="flex h-full flex-col gap-2 px-2 py-2">
      <div className="flex items-center justify-between px-1">
        <MicroLabel>Round {view.round}/8</MicroLabel>
        <MicroLabel>{PHASE_LABEL[view.phase]}</MicroLabel>
      </div>

      <div className="flex flex-col gap-1.5">
        {view.players.map((p) => {
          const isActive = p.index === activeSeat;
          const cubesLeft = p.clan === null ? null : view.supply[p.clan];
          const handCount = p.index === view.me ? view.hand.length : p.handCount;
          return (
            <div
              key={p.index}
              className={cn(
                "flex items-center gap-2 rounded-card-lg px-2 py-1.5 text-xs transition-colors",
                isActive
                  ? "bg-accent-500/15 text-fg-strong ring-1 ring-accent-500"
                  : "bg-surface-800/60 text-fg-secondary",
              )}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui-md text-2xs font-bold"
                style={{
                  background: p.clan === null ? EMPEROR_GOLD : CLAN_FILL[p.clan],
                  color: p.clan === null ? "#2b2200" : CLAN_INK[p.clan],
                }}
              >
                {p.clan === null ? "帝" : CLAN_SHORT[p.clan]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate font-medium">
                  <span className="truncate">{seatLabel(view, p.index, names)}</span>
                  {p.index === view.firstPlayer && (
                    <span className="text-3xs text-amber-300" title="First Player">
                      ☆
                    </span>
                  )}
                </div>
                <TrickPips won={p.tricksWon} />
              </div>
              <div className="flex shrink-0 flex-col items-end leading-tight">
                <span className="text-sm font-bold tabular-nums text-fg-strong">
                  {view.scores[p.index]}
                </span>
                <span className="text-3xs tabular-nums text-fg-muted">
                  {handCount} cards · {cubesLeft ?? "—"} cubes
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {view.phase === "rewards" && view.affected.length > 0 && (
        <p className="px-1 text-3xs text-fg-muted">
          ◆ on the map = locked this phase (another seat acted there)
        </p>
      )}

      {view.phase === "rewards" && view.rewardQueue.length > 0 && (
        <div className="flex items-center gap-1.5 px-1">
          <MicroLabel>Order</MicroLabel>
          {view.rewardQueue.map((slot, i) => {
            const clan = view.players[slot.player]?.clan ?? null;
            return (
              <span
                key={slot.player}
                title={`${seatLabel(view, slot.player, names)} — tier ${slot.tier}`}
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-4xs font-bold",
                  i === 0 ? "ring-2 ring-amber-400" : "opacity-60",
                )}
                style={{
                  background: clan === null ? EMPEROR_GOLD : CLAN_FILL[clan],
                  color: clan === null ? "#2b2200" : CLAN_INK[clan],
                }}
              >
                {slot.tier}
                {slot.picksLeft === 2 ? "×2" : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
