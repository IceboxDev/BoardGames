import type { GoPlayerView } from "@boardgames/core/games/go/view";
import {
  type GameOverAction,
  GameOverLayout,
  GameOverStats,
  StatItem,
} from "../../../components/game-over";
import { downloadSgf, viewToLog } from "../logic/sgf-download";
import GoBoard from "./board/GoBoard";

interface Props {
  readonly view: GoPlayerView;
  readonly names: readonly string[];
  readonly actions: readonly GameOverAction[];
}

function headline(
  view: GoPlayerView,
  names: readonly string[],
): { text: string; tone: "win" | "lose" | "draw" | "neutral" } {
  const r = view.result;
  if (!r || r.winner === null) return { text: "Jigo — a draw", tone: "draw" };
  const how =
    r.reason === "resign"
      ? "by resignation"
      : r.reason === "timeout"
        ? "on time"
        : `by ${Math.abs(r.breakdown?.margin ?? 0)} points`;
  if (view.you === null) return { text: `${names[r.winner]} wins ${how}`, tone: "neutral" };
  return view.you === r.winner
    ? { text: `You win ${how}`, tone: "win" }
    : { text: `${names[r.winner] ?? "Your opponent"} wins ${how}`, tone: "lose" };
}

export default function GameOverScreen({ view, names, actions }: Props) {
  const h = headline(view, names);
  const log = viewToLog(view);
  const b = view.result?.breakdown;
  const all: GameOverAction[] = [
    ...actions,
    ...(log
      ? [
          {
            label: "Download SGF",
            onClick: () => downloadSgf(log, names),
            variant: "secondary" as const,
          },
        ]
      : []),
  ];
  return (
    <GameOverLayout
      headline={h.text}
      headlineColor={h.tone}
      subtitle={view.result?.result}
      actions={all}
      wide
    >
      <div className="mx-auto w-full max-w-sm">
        <GoBoard
          size={view.size}
          board={view.board}
          dead={new Set(view.result?.dead ?? [])}
          ownership={b?.ownership ?? null}
          className="aspect-square w-full"
        />
      </div>
      {b && (
        <GameOverStats columns={3}>
          <StatItem label="Black" value={b.black.total} highlight={view.result?.winner === 0} />
          <StatItem label="White" value={b.white.total} highlight={view.result?.winner === 1} />
          <StatItem label="Dame" value={b.dame} />
        </GameOverStats>
      )}
    </GameOverLayout>
  );
}
