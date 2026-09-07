import type {
  SensoPlayerView,
  SensoResult,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_SHORT, factionLabel } from "@boardgames/core/games/senso-battle-for-japan/types";
import { GameOverLayout, GameOverStats, StatItem } from "../../../components/game-over";
import { Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { CLAN_FILL, CLAN_INK, EMPEROR_GOLD } from "../colors";
import { seatLabel } from "../logic/seat-labels";
import { LAYOUTS } from "./board/geometry";
import SensoMap from "./board/SensoMap";

interface Props {
  view: SensoPlayerView;
  result: SensoResult;
  names: readonly (string | null)[];
  onMenu: () => void;
  onPlayAgain?: () => void;
}

const TIEBREAK_NOTE: Record<SensoResult["tiebreak"], string | null> = {
  score: null,
  cubes: "Tied on points — decided by cubes on the map.",
  emperor: "Tied on points and cubes — the Emperor keeps the throne.",
  draw: "Tied on points and cubes with no Emperor seated — nobody claims the throne.",
};

export default function GameOverScreen({ view, result, names, onMenu, onPlayAgain }: Props) {
  const mine = view.me >= 0;
  const iWon = mine && result.winner === view.me;
  const winnerLabel = result.winner === null ? null : seatLabel(view, result.winner, names);
  const top = Math.max(...result.scores);
  const order = [...result.placements.keys()].sort(
    (a, b) => result.placements[a] - result.placements[b] || a - b,
  );
  const actions: { label: string; variant: "primary" | "secondary"; onClick: () => void }[] = [];
  if (onPlayAgain) actions.push({ label: "Play Again", variant: "primary", onClick: onPlayAgain });
  actions.push({
    label: "Back to Menu",
    variant: onPlayAgain ? "secondary" : "primary",
    onClick: onMenu,
  });
  const note = TIEBREAK_NOTE[result.tiebreak];

  return (
    <div className="senso-kanji">
      <GameOverLayout
        emoji="🏯"
        headline={iWon ? "You Win!" : winnerLabel ? `${winnerLabel} wins` : "Standstill"}
        headlineColor={iWon ? "win" : winnerLabel ? (mine ? "lose" : "neutral") : "draw"}
        subtitle={`${top} VP after 8 rounds`}
        actions={actions}
      >
        <div className="space-y-6">
          {mine && (
            <GameOverStats columns={4}>
              <StatItem label="Your score" value={result.scores[view.me]} highlight={iWon} />
              <StatItem label="Cubes on map" value={result.breakdown[view.me]?.cubes ?? 0} />
              <StatItem
                label="Regions held"
                value={result.breakdown[view.me]?.regionsControlled ?? 0}
              />
              <StatItem label="Rank" value={`#${result.placements[view.me]}`} />
            </GameOverStats>
          )}

          <Surface variant="panel" padding="lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fg-muted">
                  <th className="pb-2 text-left font-medium">#</th>
                  <th className="pb-2 text-left font-medium">Player</th>
                  <th className="pb-2 text-center font-medium">Cubes</th>
                  <th className="pb-2 text-center font-medium">Control</th>
                  <th className="pb-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.map((seat) => {
                  const b = result.breakdown[seat];
                  const clan = view.players[seat]?.clan ?? null;
                  const isWinner = result.winners.includes(seat);
                  return (
                    <tr
                      key={seat}
                      className={cn(
                        seat === view.me ? "font-semibold text-fg-strong" : "text-fg-secondary",
                        isWinner && "text-amber-300",
                      )}
                    >
                      <td className="py-1.5 text-fg-muted">{result.placements[seat]}</td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-ui-md text-3xs font-bold"
                            style={{
                              background: clan === null ? EMPEROR_GOLD : CLAN_FILL[clan],
                              color: clan === null ? "#2b2200" : CLAN_INK[clan],
                            }}
                          >
                            {clan === null ? "帝" : CLAN_SHORT[clan]}
                          </span>
                          <span>
                            {seatLabel(view, seat, names)}
                            <span className="ml-1 text-2xs text-fg-muted">
                              {factionLabel(clan)}
                            </span>
                          </span>
                          {isWinner && " 👑"}
                        </span>
                      </td>
                      <td className="py-1.5 text-center tabular-nums">
                        {clan === null ? `${b?.emperorVp ?? 0} (regions)` : (b?.cubeVp ?? 0)}
                      </td>
                      <td className="py-1.5 text-center tabular-nums">
                        {clan === null ? "—" : `+${b?.controlVp ?? 0}`}
                      </td>
                      <td className="py-1.5 text-right font-bold tabular-nums">
                        {result.scores[seat]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {note && <p className="mt-3 text-xs text-fg-muted">{note}</p>}
          </Surface>

          <div
            className="mx-auto w-full max-w-2xl"
            style={{ aspectRatio: LAYOUTS.landscape.aspect }}
          >
            <SensoMap
              view={{ board: result.finalBoard, affected: [], players: view.players }}
              orientation="landscape"
            />
          </div>
        </div>
      </GameOverLayout>
    </div>
  );
}
