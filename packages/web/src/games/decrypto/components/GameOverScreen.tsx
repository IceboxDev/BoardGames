import type { DecryptoPlayerView } from "@boardgames/core/games/decrypto/types";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { teamLabel } from "../logic/labels";

// Final screen: outcome, why it ended, both teams' now-public keywords, and
// the token tallies. `view.result` carries the full disclosure at gameOver.

const REASON_TEXT: Record<string, string> = {
  interceptions: "two interceptions sealed it",
  miscommunications: "the other team miscommunicated twice",
  points: "won the tiebreak on points",
  shared: "a shared victory — perfectly matched",
  "interceptor-tokens": "two tokens inside five rounds",
  survived: "the team survived all five rounds",
};

export default function GameOverScreen({
  view,
  actions,
}: {
  view: DecryptoPlayerView;
  actions: readonly GameOverAction[];
}) {
  const result = view.result;
  if (!result) return null;
  const iWon = result.winner !== undefined && result.winner === view.team;
  const headline =
    result.winner === undefined
      ? "Shared victory"
      : `${teamLabel(view.variant, result.winner)} wins`;

  return (
    <GameOverLayout
      centered
      headline={headline}
      headlineColor={result.winner === undefined ? "draw" : iWon ? "win" : "lose"}
      subtitle={`${REASON_TEXT[result.reason] ?? result.reason} · ${result.rounds} round${
        result.rounds === 1 ? "" : "s"
      }`}
      actions={actions}
    >
      <div className="grid grid-cols-1 gap-3 xs2:grid-cols-2">
        {([0, 1] as const).map((team) => {
          const tokens = view.tokens[team];
          const keywords = result.keywords[team];
          return (
            <div key={team} className="rounded-xl bg-surface-800/50 p-3">
              <p className="mb-1.5 text-2xs font-bold uppercase tracking-label text-fg-primary">
                {teamLabel(view.variant, team)}
                {team === view.team && <span className="text-accent-300"> · you</span>}
              </p>
              <p className="mb-2 text-3xs text-fg-secondary">
                {tokens?.interceptions ?? 0} interception
                {tokens?.interceptions === 1 ? "" : "s"}
                {view.variant === "standard" &&
                  ` · ${tokens?.miscommunications ?? 0} miscommunication${
                    tokens?.miscommunications === 1 ? "" : "s"
                  }`}
              </p>
              {keywords ? (
                <ol className="flex flex-col gap-0.5">
                  {keywords.map((word, i) => (
                    <li key={word} className="flex items-baseline gap-1.5">
                      <span className="text-2xs font-black text-accent-300">{i + 1}</span>
                      <span className="text-xs font-semibold uppercase text-fg-strong">{word}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-3xs italic text-fg-muted">No keywords — solo interceptor</p>
              )}
            </div>
          );
        })}
      </div>
    </GameOverLayout>
  );
}
