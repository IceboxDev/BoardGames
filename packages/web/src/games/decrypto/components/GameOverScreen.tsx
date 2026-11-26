import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { type CSSProperties, useMemo, useState } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { Button, SegmentedControl } from "../../../components/ui";
import { type ArtName, artBg, artUrl, artVars } from "../logic/art";
import { fmtCode, teamName } from "../logic/desk";
import { reviewRounds, tierLines } from "../logic/review";
import { KeywordBoard, RoundTape, type TapeDetail, TierLegend } from "./desk/Review";
import "./desk/desk.css";

// The debrief, as a poster: the painted scene of how the game ended, a big
// verdict and the real tokens on one side; on the other, the rounds as
// teletype tapes that print open into every clue's keyword, both reads and
// the reasons behind them (or, by keyword, the finished note sheet). One
// screen: only the tape list scrolls.

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

/** The verdict in three lines, the verb in the middle ("White / cracks / Black"). */
function verdictLines(view: DecryptoPlayerView): [string, string, string] {
  const result = view.result;
  if (!result) return ["", "", ""];
  const w = result.winner;
  if (w === undefined) return ["Shared", "victory", ""];
  const winner = teamName(view, w);
  const loser = teamName(view, w === 0 ? 1 : 0);
  switch (result.reason) {
    case "interceptions":
    case "interceptor-tokens":
      return [winner, "cracks", loser];
    case "miscommunications":
      return [loser, "loses", "the line"];
    case "survived":
      return [winner, "survives", "the wire"];
    default:
      return [winner, "wins on", "points"];
  }
}

type Mode = TapeDetail | "keys";

const MODES: { value: Mode; label: string }[] = [
  { value: "brief", label: "Brief" },
  { value: "full", label: "Full reasoning" },
  { value: "keys", label: "By keyword" },
];

function TokenStack({ count, art, label }: { count: number; art: ArtName; label: string }) {
  const url = artUrl(art);
  return (
    <span className="dc-ps-stack" title={`${count} ${label}`}>
      {[0, 1].map((i) =>
        url ? (
          <img key={i} src={url} alt="" className={i < count ? "" : "off"} />
        ) : (
          <i key={i} className={i < count ? "" : "off"} />
        ),
      )}
    </span>
  );
}

export default function GameOverScreen({
  view,
  actions,
  playerNames = [],
}: {
  view: DecryptoPlayerView;
  actions: readonly GameOverAction[];
  playerNames?: readonly (string | null)[];
}) {
  const vars = useMemo(() => artVars() as CSSProperties, []);
  const rounds = useMemo(() => reviewRounds(view, playerNames), [view, playerNames]);
  const legend = useMemo(() => tierLines(rounds, view), [rounds, view]);
  const [picked, setPicked] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("brief");
  const open = picked ?? rounds[rounds.length - 1]?.round ?? 1;
  const result = view.result;
  if (!result) return null;
  const winner = result.winner;
  const won = winner !== undefined && winner === view.team;
  const tone = winner === undefined ? "" : won ? "win" : "lose";
  const [l1, l2, l3] = verdictLines(view);
  const turn = insights(view)[0];
  const teams: Team[] = view.variant === "interceptor" ? [0] : view.team === 0 ? [0, 1] : [1, 0];
  const tokenTeams: Team[] = view.variant === "interceptor" ? [0, 1] : teams;
  const names = { 0: teamName(view, 0), 1: teamName(view, 1) } as Record<Team, string>;
  const you = winner === undefined ? "Shared victory" : won ? "Your team wins" : "Your team loses";

  return (
    <div
      className="dc-room dc-poster-frame"
      style={{ ...vars, "--dc-hero-art": artBg(heroArt(view)) } as CSSProperties}
    >
      <div className="dc-poster">
        <section className="dc-ps-hero" aria-label="Result">
          <span className="dc-ps-kick">
            Debrief · round {result.rounds} of {view.maxRounds}
          </span>
          <h1 className={`dc-ps-h1 ${tone}`}>
            <span>{l1}</span> <em>{l2}</em> <span>{l3}</span>
          </h1>
          <p className="dc-ps-you">
            <b>{you}.</b> {REASON_TEXT[result.reason] ?? result.reason}. Points{" "}
            {result.points.join(" : ")}.
          </p>
          <div className="dc-ps-tokens">
            {tokenTeams.map((t) => (
              <div key={t} className="dc-ps-tok">
                <span className="name">
                  <span className={`dc-tdot t${t}`} /> {names[t]}
                </span>
                <span className="row">
                  <TokenStack
                    count={view.tokens[t]?.interceptions ?? 0}
                    art="token-interception"
                    label="interceptions"
                  />
                  <span>{view.tokens[t]?.interceptions ?? 0} intercepted</span>
                </span>
                <span className="row">
                  <TokenStack
                    count={view.tokens[t]?.miscommunications ?? 0}
                    art="token-miscommunication"
                    label="misreads"
                  />
                  <span>{view.tokens[t]?.miscommunications ?? 0} misread</span>
                </span>
              </div>
            ))}
          </div>
          {turn && (
            <p className="dc-ps-turn">
              <b>
                {turn.kind} · R{turn.round}.
              </b>{" "}
              {turn.text}
            </p>
          )}
          <div className="dc-ps-acts">
            {actions.map((a) => (
              <Button
                key={a.label}
                variant={a.variant === "primary" ? "primary" : "secondary"}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="dc-ps-tapes" aria-label="Rounds">
          <header className="dc-ps-th">
            <h2>{mode === "keys" ? "The keywords" : "The tapes"}</h2>
            <SegmentedControl
              options={MODES}
              value={mode}
              onChange={setMode}
              size="xs"
              shape="rounded"
              fullWidth={false}
              tone="amber"
            />
          </header>
          {mode === "keys" ? (
            <div className="dc-ps-scroll">
              <KeywordBoard
                teams={teams}
                names={names}
                keywords={result.keywords}
                sheet={view.noteSheet}
              />
            </div>
          ) : (
            <div className="dc-ps-scroll dc-tapes-list">
              {mode === "full" && <TierLegend lines={legend} />}
              {rounds.map((r) => (
                <RoundTape
                  key={r.round}
                  round={r}
                  open={r.round === open}
                  detail={mode}
                  onOpen={() => setPicked(r.round)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
