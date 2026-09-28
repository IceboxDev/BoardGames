import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import type {
  HungerPlayerView,
  HungerResult,
  SeatBreakdown,
} from "@boardgames/core/games/the-hunger/types";
import {
  type GameOverAction,
  GameOverLayout,
  GameOverStats,
  StatItem,
} from "../../../components/game-over";
import { MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { artUrl, vampireArt } from "../logic/art";
import { seatLabel, vampireColor, vampireName } from "../logic/labels";
import CardLine from "./CardLine";
import VampireAvatar from "./VampireAvatar";

interface Props {
  view: HungerPlayerView;
  result: HungerResult;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
}

const FATE = {
  castle: "Castle",
  cemetery: "Cemetery −5",
  mountains: "Mountains",
  ashes: "Ashes",
} as const;

export default function GameOverScreen({ view, result, names, actions }: Props) {
  const mine = view.me >= 0;
  const iWon = mine && result.winners.includes(view.me);
  const winnerLabel = result.winner === null ? null : seatLabel(view, result.winner, names);
  const order = [...result.placements.keys()].sort(
    (a, b) => result.placements[a] - result.placements[b] || a - b,
  );
  const my = mine ? result.breakdown[view.me] : undefined;

  const champion = result.winners.length > 0 ? view.players[result.winners[0]] : undefined;
  const championArt = champion ? vampireArt(champion.vampire, "full") : undefined;

  return (
    // The results run long (a detail card per Vampire), so the screen scrolls itself.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <GameOverLayout
        headline={iWon ? "You Win!" : winnerLabel ? `${winnerLabel} wins` : "A shared crown"}
        headlineColor={iWon ? "win" : mine ? "lose" : "neutral"}
        subtitle={
          my?.fate === "ashes"
            ? "The sun found you before you found home."
            : "The sun rises on the Castle."
        }
        actions={actions}
      >
        <div className="space-y-6">
          {artUrl("sunrise-backdrop") && (
            <div className="relative aspect-video w-full overflow-hidden rounded-card-xl shadow-2xl">
              <img
                src={artUrl("sunrise-backdrop")}
                alt="Dawn breaks over the Castle"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* The winner, standing in the first light. */}
              {champion && championArt && (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface-950/80 to-transparent" />
                  <img
                    src={championArt}
                    alt={vampireName(champion.vampire)}
                    draggable={false}
                    className="absolute bottom-0 left-[8%] h-[92%] w-auto object-contain drop-shadow-2xl"
                  />
                  <div className="absolute bottom-4 right-5 flex flex-col items-end text-right">
                    <span className="text-3xs font-semibold uppercase tracking-eyebrow text-amber-200">
                      {result.winners.length > 1 ? "Shared crown" : "Lord of the night"}
                    </span>
                    <span className="font-card text-2xl font-semibold text-fg-strong drop-shadow-lg">
                      {seatLabel(view, champion.index, names)}
                    </span>
                    <span className="font-card text-sm tabular-nums text-fg-secondary">
                      {result.breakdown[champion.index]?.total} VP
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
          {my && (
            <GameOverStats columns={4}>
              <StatItem label="Your score" value={my.total} highlight={iWon} />
              <StatItem label="During the night" value={my.duringPlay} />
              <StatItem label="Missions" value={my.publicMissions + my.personalMissions} />
              <StatItem label="Rank" value={`#${result.placements[view.me]}`} />
            </GameOverStats>
          )}
          <Surface variant="panel" padding="lg">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-label text-fg-muted">
                  <th className="w-12 pb-3 text-center font-medium">#</th>
                  <th className="pb-3 text-left font-medium">Vampire</th>
                  <th className="pb-3 text-center font-medium">Night</th>
                  <th className="pb-3 text-center font-medium">Cards</th>
                  <th className="pb-3 text-center font-medium">Missions</th>
                  <th className="pb-3 text-center font-medium">Sunrise</th>
                  <th className="pb-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.map((seat) => {
                  const b = result.breakdown[seat];
                  const p = view.players[seat];
                  const winner = result.winners.includes(seat);
                  return (
                    <tr
                      key={seat}
                      className={cn(
                        seat === view.me ? "font-semibold text-fg-strong" : "text-fg-secondary",
                        winner && "text-amber-300",
                        b.fate === "ashes" && "opacity-60",
                      )}
                    >
                      <td className="border-t border-line-soft py-3 align-middle">
                        <span
                          className={cn(
                            "mx-auto flex h-7 w-7 items-center justify-center rounded-full font-card text-sm font-semibold tabular-nums",
                            result.placements[seat] === 1
                              ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/60"
                              : "bg-fill text-fg-secondary ring-1 ring-line",
                          )}
                        >
                          {result.placements[seat]}
                        </span>
                      </td>
                      <td className="border-t border-line-soft py-3 pl-2 align-middle">
                        <span className="flex items-center gap-3">
                          {p && (
                            <VampireAvatar
                              vampire={p.vampire}
                              dim={b.fate === "ashes"}
                              className="h-9 w-9 text-xs"
                            />
                          )}
                          <span className="flex items-center gap-1.5">
                            {seatLabel(view, seat, names)}
                            {winner && (
                              <span role="img" aria-label="winner">
                                👑
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="border-t border-line-soft py-3 text-center align-middle tabular-nums">
                        {b.duringPlay}
                      </td>
                      <td className="border-t border-line-soft py-3 text-center align-middle tabular-nums">
                        +{b.cardBonuses}
                      </td>
                      <td className="border-t border-line-soft py-3 text-center align-middle tabular-nums">
                        +{b.publicMissions + b.personalMissions}
                      </td>
                      <td className="border-t border-line-soft py-3 text-center align-middle">
                        {FATE[b.fate]}
                        {b.sunrise < 0 && b.fate !== "cemetery" ? ` ${b.sunrise}` : ""}
                      </td>
                      <td className="border-t border-line-soft py-3 text-right align-middle font-card text-base font-semibold tabular-nums">
                        {b.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fg-muted">
              Burned Vampires keep their points for the glory of it, but rank below every survivor.
            </p>
          </Surface>

          {/* Where the end-of-game points came from, Vampire by Vampire. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {order.map((seat) => (
              <SeatDetail
                key={seat}
                name={seatLabel(view, seat, names)}
                color={view.players[seat] ? vampireColor(view.players[seat].vampire) : undefined}
                breakdown={result.breakdown[seat]}
              />
            ))}
          </div>
        </div>
      </GameOverLayout>
    </div>
  );
}

function SeatDetail({
  name,
  color,
  breakdown,
}: {
  name: string;
  color?: string;
  breakdown: SeatBreakdown;
}) {
  const b = breakdown;
  return (
    <Surface variant="tile" padding="md" className="flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-semibold text-fg-strong">{name}</span>
        <span className="ml-auto font-bold tabular-nums text-fg-strong">{b.total} VP</span>
      </div>
      <Line label="During the night" vp={b.duringPlay} />
      <section className="flex flex-col gap-0.5">
        <MicroLabel>Missions · +{b.publicMissions + b.personalMissions}</MicroLabel>
        {b.missions.length === 0 && <span className="text-fg-muted">None</span>}
        {b.missions.map((m) => {
          const def = missionDef(m.id);
          return (
            <Line
              key={`${m.public ? "public" : "own"}-${m.id}`}
              label={def.name}
              note={m.used ? "used" : m.public ? "public" : def.instant ? "unused" : undefined}
              title={def.text}
              vp={m.vp}
              muted={m.vp === 0}
            />
          );
        })}
      </section>
      {b.cards.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <MicroLabel>End-of-the-Game cards · +{b.cardBonuses}</MicroLabel>
          {b.cards.map((c) => (
            <div key={c.card} className="flex items-center gap-2">
              <CardLine card={c.card} className="flex-1" />
              <span className="w-10 text-right font-bold tabular-nums">+{c.vp}</span>
            </div>
          ))}
        </section>
      )}
      <Line
        label={
          b.fate === "castle"
            ? "Sunrise · safe in the Castle"
            : b.fate === "cemetery"
              ? "Sunrise · a Cemetery vault"
              : b.fate === "mountains"
                ? "Sunrise · sheltered in the Mountains"
                : "Sunrise · burned to ashes"
        }
        vp={b.sunrise}
        muted={b.sunrise === 0}
      />
    </Surface>
  );
}

function Line({
  label,
  vp,
  note,
  title,
  muted = false,
}: {
  label: string;
  vp: number;
  note?: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2" title={title}>
      <span className={cn("min-w-0 flex-1 truncate", muted ? "text-fg-muted" : "text-fg-primary")}>
        {label}
        {note && <span className="ml-1 text-3xs text-fg-muted">({note})</span>}
      </span>
      <span className={cn("w-10 text-right tabular-nums", muted ? "text-fg-muted" : "font-bold")}>
        {vp > 0 ? `+${vp}` : vp}
      </span>
    </div>
  );
}
