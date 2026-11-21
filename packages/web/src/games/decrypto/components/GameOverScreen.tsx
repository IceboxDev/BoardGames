import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { type CSSProperties, useMemo } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { Button } from "../../../components/ui";
import { type ArtName, artBg, artVars } from "../logic/art";
import { fmtCode, teamName } from "../logic/desk";
import { CodeScreen } from "./desk/CodeScreen";
import "./desk/desk.css";

// The debrief: the desk powers down. A painted header for how the game ended
// for the viewer, both screens open with every keyword and tape, the round-by-
// round telegram, and "where it turned" — the leaks, the misreads and the
// near misses that decided it.

const REASON_TEXT: Record<string, string> = {
  interceptions: "Two interceptions broke the code",
  miscommunications: "Two misreads lost the line",
  points: "Decided on points after the last round",
  shared: "A shared victory — perfectly matched",
  "interceptor-tokens": "Two tokens inside five rounds",
  survived: "The team survived all five rounds",
};

type Insight = { kind: string; tone: "dc-r" | "dc-a" | "dc-g"; round: number; text: string };

/** The scene for how the game ended for the viewer's team. */
function heroArt(view: DecryptoPlayerView): ArtName {
  const result = view.result;
  if (!result || result.winner === undefined) return "debrief-points";
  const won = result.winner === view.team;
  if (result.reason === "interceptions" || result.reason === "interceptor-tokens") {
    return won ? "debrief-cracked" : "debrief-exposed";
  }
  if (result.reason === "miscommunications") return won ? "debrief-garbled" : "debrief-static";
  return "debrief-points";
}

function insights(view: DecryptoPlayerView): Insight[] {
  const keywords = view.result?.keywords ?? [null, null];
  const out: Insight[] = [];
  const lastRound = view.roundSummaries[view.roundSummaries.length - 1]?.round;
  for (const r of view.roundSummaries) {
    for (const t of r.transmissions) {
      const other = teamName(view, t.team === 0 ? 1 : 0);
      const who = teamName(view, t.team);
      if (t.intercepted && t.clues) {
        out.push({
          kind: r.round === lastRound ? "Decisive leak" : "Leak",
          tone: "dc-r",
          round: r.round,
          text: `${other} broke ${who}'s ${fmtCode(t.code)} — “${t.clues.join(" / ")}”`,
        });
      }
      if (t.miscommunicated && t.decodeGuess && t.clues) {
        const guess = t.decodeGuess;
        const clues = t.clues;
        const parts = t.code
          .map((d, i) =>
            guess[i] !== d
              ? `“${clues[i]}” as ${guess[i]} (meant ${d}${keywords[t.team]?.[d - 1] ? ` · ${keywords[t.team]?.[d - 1]}` : ""})`
              : null,
          )
          .filter(Boolean);
        out.push({
          kind: "Misread",
          tone: "dc-a",
          round: r.round,
          text: `${who} read ${parts.join(", ")}`,
        });
      }
      if (t.miscommunicated && (t.skipped || !t.clues)) {
        out.push({
          kind: "Lost",
          tone: "dc-a",
          round: r.round,
          text: `${who} sent no clues — a misread token`,
        });
      }
      if (t.interceptGuess && !t.intercepted) {
        const hits = t.interceptGuess.filter((d, i) => d === t.code[i]).length;
        if (hits === 2) {
          out.push({
            kind: "Close",
            tone: "dc-g",
            round: r.round,
            text: `${other} read ${fmtCode(t.interceptGuess)} against ${fmtCode(t.code)} — two of three`,
          });
        }
      }
    }
  }
  const rank: Record<string, number> = {
    "Decisive leak": 0,
    Leak: 1,
    Misread: 2,
    Lost: 2,
    Close: 3,
  };
  out.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.round - b.round);
  let close = 0;
  return out.filter((x) => x.kind !== "Close" || ++close <= 2);
}

export default function GameOverScreen({
  view,
  actions,
}: {
  view: DecryptoPlayerView;
  actions: readonly GameOverAction[];
}) {
  const vars = useMemo(() => artVars() as CSSProperties, []);
  const result = view.result;
  if (!result) return null;
  const winner = result.winner;
  const won = winner !== undefined && winner === view.team;
  const headline =
    winner === undefined
      ? "Shared victory"
      : won
        ? "Your team wins"
        : `${teamName(view, winner)} wins`;
  const list = insights(view);
  const teams: Team[] = view.variant === "interceptor" ? [0] : view.team === 0 ? [0, 1] : [1, 0];

  return (
    <div
      className="dc-room flex min-h-0 flex-1 flex-col p-2"
      style={{ ...vars, "--dc-hero-art": artBg(heroArt(view)) } as CSSProperties}
    >
      <div className="dc-debrief">
        <header className="dc-hero">
          <div className="dc-hero-text">
            <span className="dc-engr">
              Debrief · round {result.rounds} of {view.maxRounds}
            </span>
            <h1 className={winner === undefined ? "" : won ? "win" : "lose"}>{headline}</h1>
            <p>
              {REASON_TEXT[result.reason] ?? result.reason}. Points {result.points.join(" : ")}.
            </p>
            {list[0] && (
              <p>
                <span className={list[0].tone}>{list[0].kind}</span> · R{list[0].round}:{" "}
                {list[0].text}
              </p>
            )}
            <div className="dc-hero-actions">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={a.variant === "primary" ? "primary" : "secondary"}
                  onClick={a.onClick}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        </header>

        <div className="dc-felt flex-none">
          <div
            className="dc-screens"
            style={teams.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}
          >
            {teams.map((team) => (
              <CodeScreen
                key={team}
                team={team}
                title={`${teamName(view, team)} · ${team === view.team ? "your" : "their"} keywords`}
                words={result.keywords[team] ?? null}
                tapes={view.noteSheet[team]}
                lit={[false, false, false, false]}
                fromRound={result.rounds + 1}
                maxRounds={view.maxRounds}
              />
            ))}
          </div>
        </div>

        <div className="dc-debrief-grid">
          <section className="dc-panel">
            <h2 className="dc-engr">Telegram · round by round</h2>
            <div className="dc-telegram">
              {view.roundSummaries.map((r) => (
                <div key={r.round} className="dc-tl-round">
                  <b>R{r.round}</b>
                  <div>
                    {r.transmissions.map((t) => (
                      <div key={t.team} className="dc-tl-tx">
                        <span className={`dc-tdot t${t.team}`} />
                        <b>{fmtCode(t.code)}</b>
                        <span>{t.clues ? t.clues.join(" / ") : "no clues"}</span>
                        {t.intercepted && <span className="dc-tl-stamp r">Intercepted</span>}
                        {t.miscommunicated && <span className="dc-tl-stamp a">Misread</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="dc-panel">
            <h2 className="dc-engr">Where it turned</h2>
            {list.length === 0 ? (
              <p className="text-sm text-fg-secondary">
                Clean lines all game — nobody leaked a code or misread a clue.
              </p>
            ) : (
              list.map((x, i) => (
                <div
                  key={`${x.kind}-${x.round}-${x.text}`}
                  className="dc-insight"
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className={`k ${x.tone}`}>
                    {x.kind} · R{x.round}
                  </span>
                  <span>{x.text}</span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
