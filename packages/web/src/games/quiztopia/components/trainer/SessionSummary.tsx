import { addDays } from "@boardgames/core/games/quiztopia/srs";
import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GameOverStats, StatItem } from "../../../../components/game-over";
import { Badge, Button, MicroLabel, PageHeader, Surface } from "../../../../components/ui";
import { ColumnChart } from "../../../../components/ui/charts";
import { qk } from "../../../../lib/query-keys";
import { overviewQuery } from "../../api";
import { districtByN } from "../../bands";
import type { TrainerSession } from "../../hooks/useTrainerSession";
import { weekdayName } from "../../keys";
import { pickTexts } from "../../logic/copy";
import type { TrainerPaths } from "../../paths";
import { Skyline } from "../common/Skyline";
import { TextLink } from "../common/TextLink";

// The end of a session: the four numbers, the city as it stands now (the
// overview refetches once the last grade lands, so a district the session
// cleared lights up here), when this session's cards come back, and the
// misses with a way into the archive. "Keep going" pulls a fresh queue.

type Props = {
  session: TrainerSession;
  title: string;
  language: QuiztopiaLanguage;
  paths: TrainerPaths;
};

export function SessionSummary({ session, title, language, paths }: Props) {
  const navigate = useNavigate();
  const { summary, today } = session;
  const [showMissed, setShowMissed] = useState(false);
  const [extending, setExtending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: qk.quiztopiaOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
  const lit = overview.data
    ? overview.data.categories.map((c) => c.seen > 0 && c.due === 0)
    : Array.from({ length: 12 }, () => false);

  const accuracy = summary.accuracy === null ? "—" : `${Math.round(summary.accuracy * 100)}%`;
  const columns = summary.dueNext7.map((count, i) => ({
    label: i === 0 ? "Today" : weekdayName(addDays(today, i), "short"),
    segments: [{ value: count, tone: "sky" as const, label: "Due" }],
  }));

  const keepGoing = async () => {
    setExtending(true);
    setNote(null);
    try {
      const added = await session.extend();
      if (added === 0) setNote("Nothing more due today — the city is lit.");
    } catch {
      setNote("Couldn't fetch more cards right now.");
    } finally {
      setExtending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <PageHeader
        align="center"
        size="lg"
        eyebrow={title}
        title="Session complete"
        subtitle={
          summary.reviewed === 0
            ? "No cards graded this time."
            : `${summary.reviewed} card${summary.reviewed === 1 ? "" : "s"} · ${summary.learned} graduated to review`
        }
      />

      <Skyline mode="trainer" lit={lit} className="h-36 w-full sm:h-44" />

      <GameOverStats columns={4}>
        <StatItem label="Reviewed" value={summary.reviewed} />
        <StatItem label="Knew it" value={summary.knew} />
        <StatItem label="Didn't know" value={summary.didnt} />
        <StatItem label="Accuracy" value={accuracy} highlight={(summary.accuracy ?? 0) >= 0.9} />
      </GameOverStats>

      <Surface variant="raised" padding="lg" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg-strong">Coming back</h2>
          <MicroLabel>from this session, next 7 days</MicroLabel>
        </div>
        <ColumnChart columns={columns} height={96} />
      </Surface>

      {summary.missed.length > 0 && (
        <Surface variant="raised" padding="lg" className="flex flex-col gap-2">
          <Button
            variant="link"
            onClick={() => setShowMissed((v) => !v)}
            aria-expanded={showMissed}
            className="justify-between text-sm"
          >
            <span className="font-semibold text-fg-strong">
              Missed this session ({summary.missed.length})
            </span>
            <span>{showMissed ? "Hide" : "Show"}</span>
          </Button>
          {showMissed && (
            <ul className="divide-y divide-line">
              {summary.missed.map((m) => {
                const d = districtByN(m.item.category);
                const texts = m.question ? pickTexts(language, m.question.en, m.question.de) : [];
                const q = Number.parseInt(m.questionId.slice(-1), 10);
                return (
                  <li key={m.questionId} className="flex items-start gap-3 py-2.5">
                    <Badge tone={d.tone} size="sm" title={d.en} className="mt-0.5">
                      {d.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg-primary">{texts[0] ?? m.questionId}</p>
                      {m.question && (
                        <p className="text-xs text-fg-secondary">
                          {language === "de" ? m.question.answerDe : m.question.answerEn}
                        </p>
                      )}
                      <p className="mt-0.5 flex items-center gap-2 text-2xs text-fg-muted">
                        {m.misses > 1 && <span>missed ×{m.misses}</span>}
                        <TextLink
                          to={paths.wikiArticle(d.slug, m.item.cardId, Number.isNaN(q) ? 0 : q)}
                          tone="muted"
                        >
                          Read the article →
                        </TextLink>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      )}

      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <Button variant="primary" size="lg" onClick={() => navigate(paths.hub)}>
          Back to the city
        </Button>
        {session.spec.kind === "due" && (
          <Button variant="secondary" size="lg" onClick={keepGoing} loading={extending}>
            Keep going
          </Button>
        )}
      </div>
      {note && (
        <p role="status" className="text-center text-xs text-fg-muted">
          {note}
        </p>
      )}
    </div>
  );
}
