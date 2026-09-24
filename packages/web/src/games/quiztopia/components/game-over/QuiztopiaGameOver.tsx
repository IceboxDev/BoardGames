import { parseQuestionId } from "@boardgames/core/games/quiztopia/ids";
import {
  BUILDING_COUNT,
  type QuestionLogEntry,
  type QuiztopiaPlayerView,
  type QuiztopiaResult,
} from "@boardgames/core/games/quiztopia/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GameOverLayout, GameOverStats, StatItem } from "../../../../components/game-over";
import {
  Badge,
  Button,
  MicroLabel,
  ProgressBar,
  Section,
  Surface,
} from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { submitReviewsBulk, todayKey } from "../../api";
import { districtByIndex } from "../../bands";
import { type BoardLanguage, deckLabel, wikiPathFor } from "../../logic/copy";
import { type SeatNames, seatName } from "../../logic/seats";
import { trainerPaths } from "../../paths";
import { Skyline } from "../common/Skyline";

// The end of a co-op room. The city as it ended, the numbers, every question
// that was asked (with a wiki link for the real ones), and the bridge into
// the trainer: the misses become a practice session, and every judged
// question is posted as a `source: "game"` review — once per client, keyed
// by room + turn so a reconnect or a second tab can't double-count.

type Props = {
  result: QuiztopiaResult;
  /** The last board view — null when only the result frame arrived. */
  view: QuiztopiaPlayerView | null;
  seatNames: SeatNames;
  roomCode: string | null;
  onBackToMenu: () => void;
  onOpenTrainer: () => void;
  /** Release the room before an in-app navigation away from the game. */
  onLeave?: () => void;
};

const SOLO_BASE = "/play/quiztopia/solo";

function headlineFor(result: QuiztopiaResult): {
  text: string;
  color: "win" | "lose";
  emoji: string;
} {
  if (result.outcome === "win") {
    return result.bakeryComplete
      ? { text: "The whole bakery!", color: "win", emoji: "🥐" }
      : { text: "Quiztopia shines", color: "win", emoji: "🏙️" };
  }
  if (result.outcome === "loss-buildings") {
    return { text: "Quiztopia went dark", color: "lose", emoji: "🌑" };
  }
  return { text: "Out of questions", color: "lose", emoji: "🃏" };
}

function isReal(entry: QuestionLogEntry): boolean {
  return parseQuestionId(entry.questionId) !== null;
}

export default function QuiztopiaGameOver({
  result,
  view,
  seatNames,
  roomCode,
  onBackToMenu,
  onOpenTrainer,
  onLeave,
}: Props) {
  const navigate = useNavigate();
  const headline = headlineFor(result);
  const lang: BoardLanguage = view?.language ?? "en";
  const primary: "en" | "de" = lang === "de" ? "de" : "en";
  const [showQuestions, setShowQuestions] = useState(false);

  const judged = useMemo(
    () => (view?.questionLog ?? []).filter((e) => e.correct !== null),
    [view?.questionLog],
  );
  const correctCount = judged.filter((e) => e.correct).length;
  const askedTotal = result.perCategory.reduce((n, c) => n + c.asked, 0);
  const correctTotal = result.perCategory.reduce((n, c) => n + c.correct, 0);
  const accuracy =
    judged.length > 0
      ? Math.round((correctCount / judged.length) * 100)
      : askedTotal > 0
        ? Math.round((correctTotal / askedTotal) * 100)
        : null;

  const lit = useMemo(() => {
    if (result.outcome === "win") return Array.from({ length: BUILDING_COUNT }, () => true);
    if (!view) return Array.from({ length: BUILDING_COUNT }, () => false);
    return view.buildings.map((b) => b === "won");
  }, [result.outcome, view]);

  const missIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of judged) {
      if (e.correct === false && isReal(e) && !ids.includes(e.questionId)) ids.push(e.questionId);
    }
    return ids;
  }, [judged]);

  const perSeat = useMemo(() => {
    if (!view) return [];
    return view.seats.map((seat) => {
      const mine = judged.filter((e) => e.activeSeat === seat);
      return { seat, answered: mine.length, right: mine.filter((e) => e.correct).length };
    });
  }, [view, judged]);

  const byDistrict = result.perCategory
    .map((c, i) => ({ district: districtByIndex(i), ...c }))
    .filter((c) => c.asked > 0);

  // Post the game's judged questions as reviews, once. Idempotent server-side
  // on clientId, but the guard keeps a re-render from firing a second call.
  const posted = useRef(false);
  useEffect(() => {
    if (posted.current || !roomCode) return;
    const reviews = judged.filter(isReal).map((e) => ({
      clientId: `game:${roomCode}:${e.turn}`,
      questionId: e.questionId,
      grade: e.correct ? ("good" as const) : ("again" as const),
      localDate: todayKey(),
      source: "game" as const,
      roomCode,
    }));
    if (reviews.length === 0) return;
    posted.current = true;
    submitReviewsBulk({ reviews }).catch(() => {
      // Best effort: the trainer will pick these up from the replay later.
    });
  }, [judged, roomCode]);

  const subtitle = `${result.difficultyLabel} · ${result.expert ? "Expert" : "Standard"} · ${result.won} won · ${result.lost} lost · ${result.questionsAsked} ${result.questionsAsked === 1 ? "question" : "questions"}`;

  return (
    <div className="relative z-raised">
      <GameOverLayout
        emoji={headline.emoji}
        headline={headline.text}
        headlineColor={headline.color}
        subtitle={subtitle}
        actions={[
          { label: "Back to menu", variant: "primary", onClick: onBackToMenu },
          { label: "Open trainer", variant: "secondary", onClick: onOpenTrainer },
        ]}
      >
        <div className="flex flex-col gap-6">
          <Skyline mode="hero" lit={lit} className="h-28 w-full sm:h-40" />

          <GameOverStats columns={4}>
            <StatItem label="Won" value={result.won} highlight={result.outcome === "win"} />
            <StatItem label="Lost" value={result.lost} />
            <StatItem label="Questions used" value={result.cardsUsed} />
            <StatItem label="Accuracy" value={accuracy === null ? "—" : `${accuracy}%`} />
          </GameOverStats>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="amber" size="sm">
              {result.difficultyLabel}
            </Badge>
            <Badge tone={result.expert ? "purple" : "neutral"} size="sm">
              {result.expert ? "Expert" : "Standard"}
            </Badge>
            <Badge tone="neutral" size="sm">
              {deckLabel(result.deck)} deck
            </Badge>
            {result.bakery && (
              <Badge tone="emerald" size="sm" ring>
                {result.bakeryComplete ? "Bakery complete" : "Bakery run"}
              </Badge>
            )}
            {missIds.length > 0 && (
              <Button
                variant="tinted"
                tone="amber"
                size="sm"
                onClick={() => {
                  onLeave?.();
                  navigate(trainerPaths(SOLO_BASE).study({ ids: missIds }));
                }}
              >
                Practice {missIds.length} {missIds.length === 1 ? "miss" : "misses"}
              </Button>
            )}
          </div>

          {byDistrict.length > 0 && (
            <Section title="By district">
              <ul className="flex flex-col gap-2">
                {byDistrict.map(({ district: d, asked, correct }) => (
                  <li key={d.slug} className="flex items-center gap-3 text-sm">
                    <Badge tone={d.tone} size="xs" className="w-9 justify-center">
                      {d.label}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-fg-primary">
                      {primary === "de" ? d.de : d.en}
                    </span>
                    <ProgressBar
                      value={asked ? correct / asked : 0}
                      tone={d.tone}
                      label={`${d.en} accuracy`}
                      animate={false}
                      className="w-20 shrink-0"
                    />
                    <span className="w-12 shrink-0 text-right tabular-nums text-fg-secondary">
                      {correct} / {asked}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {perSeat.length > 0 && (
            <Section title="Everyone at the table">
              <ul className="flex flex-col gap-1.5">
                {perSeat.map((s) => (
                  <li
                    key={`seat-${s.seat.toString()}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-medium text-fg-strong">
                      {seatName(seatNames, s.seat)}
                    </span>
                    <span className="tabular-nums text-fg-secondary">
                      {s.answered} answered · {s.right} right
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view && view.questionLog.length > 0 && (
            <div className="flex flex-col gap-3">
              <Button
                variant="ghost"
                size="sm"
                align="start"
                aria-expanded={showQuestions}
                onClick={() => setShowQuestions((s) => !s)}
              >
                {showQuestions ? "Hide" : "Show"} the questions from this game (
                {view.questionLog.length})
              </Button>
              {showQuestions && (
                <ol className="flex flex-col gap-2">
                  {view.questionLog.map((e, i) => {
                    const d = districtByIndex(e.categoryIndex);
                    const wiki = wikiPathFor(e.cardRef, d.slug);
                    return (
                      <Surface
                        as="li"
                        key={`q-${e.turn.toString()}-${i.toString()}`}
                        variant="tile"
                        padding="sm"
                        className={cn(
                          "flex flex-col gap-1",
                          e.correct === false && "border-rose-500/30",
                          e.correct === true && "border-emerald-500/30",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <MicroLabel className="tabular-nums">Turn {e.turn}</MicroLabel>
                          <Badge tone={d.tone} size="xs">
                            {d.label} · {primary === "de" ? d.de : d.en}
                          </Badge>
                          {e.correct === null ? (
                            <Badge tone="purple" size="xs">
                              redrawn
                            </Badge>
                          ) : e.correct ? (
                            <Badge tone="emerald" size="xs">
                              ✓ right
                            </Badge>
                          ) : (
                            <Badge tone="rose" size="xs">
                              ✗ wrong
                            </Badge>
                          )}
                          <span className="ml-auto text-2xs text-fg-muted">
                            {seatName(seatNames, e.activeSeat)}
                          </span>
                        </div>
                        <p className="text-sm text-fg-primary">{primary === "de" ? e.de : e.en}</p>
                        {e.correct !== null && (
                          <p className="text-sm font-semibold text-fg-strong">
                            {primary === "de" ? e.answerDe : e.answerEn}
                          </p>
                        )}
                        {wiki && (
                          <Link
                            to={wiki}
                            className="self-start text-xs font-medium text-accent-300 hover:text-accent-200"
                          >
                            Wiki →
                          </Link>
                        )}
                      </Surface>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      </GameOverLayout>
    </div>
  );
}
