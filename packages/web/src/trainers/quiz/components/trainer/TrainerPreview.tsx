import type {
  Journal,
  JournalQuestion,
  MyReports,
  RecentMisses,
  TimelinePins,
  TrainerHistory,
  TrainerOverview,
} from "@boardgames/core/protocol";
import { DEFAULT_QUIZ_SETTINGS } from "@boardgames/core/protocol";
import { addDays } from "@boardgames/core/quiz/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageMain } from "../../../../components/ui";
import { qk } from "../../../../lib/query-keys";
import { todayKey } from "../../api";
import { findFact } from "../../content";
import { DOMAINS, domainOf } from "../../domains";
import { useArticle } from "../../hooks/useContent";
import { viewerTimeZone } from "../../hooks/useJournal";
import { questionOf } from "../../hooks/useTrainerSession";
import { TrainerBaseProvider } from "../../paths";
import { ReportDialog } from "../report/ReportDialog";
import WikiJournal from "../wiki/WikiJournal";
import WikiReports from "../wiki/WikiReports";
import { FlashCard } from "./FlashCard";
import TrainerHub from "./TrainerHub";
import { TrainerScreen } from "./TrainerScreen";

// Dev-only trainer scenes for /dev/quiztopia-preview (no auth, no server):
//   scene=hub        — the hub over a fixture overview / history (seeded
//                      into a private query cache; `&fresh=1` = brand-new member)
//   scene=journal    — the journal over three fixture days
//   scene=reports    — "Your reports" over fixture reports (one fresh outcome)
//                      `&report=1` on scene=card opens the report form over it
//   scene=card       — the study card on a real content card; `&revealed=1`
//                      flips it after mount, exercising the real animation

const BASE = "/dev/quiztopia-preview";

function fixtureOverview(today: string, fresh: boolean): TrainerOverview {
  const seen = fresh ? [] : [212, 64, 40, 38, 30, 25, 18, 12, 9, 6, 3, 0, 14, 2];
  return {
    contentVersion: "dev",
    today,
    streak: fresh
      ? { current: 0, longest: 0, studiedToday: false }
      : { current: 4, longest: 6, studiedToday: false },
    todayCounts: fresh
      ? { reviews: 0, good: 0, again: 0, newIntroduced: 0 }
      : { reviews: 12, good: 10, again: 2, newIntroduced: 0 },
    newRemainingToday: 15,
    leftoverToday: 0,
    domains: DOMAINS.map((d, i) => {
      const s = seen[i] ?? 0;
      const known = Math.round(s * 0.55);
      const due = i === 0 ? 22 : i === 1 ? 4 : 0;
      return {
        domain: d.slug,
        total: 760,
        seen: s,
        due,
        learningDue: i === 0 ? 11 : 0,
        newAvailable: 760 - s,
        known,
        mature: Math.round(known * 0.1),
        mastery: 0,
        retention30: s > 0 ? 0.78 : null,
        reviews30: s,
        leeches: i === 0 ? 2 : 0,
      };
    }),
    settings: {
      ...DEFAULT_QUIZ_SETTINGS,
      excludeFromAll: fresh ? [] : DOMAINS.slice(2).map((d) => d.slug),
    },
  };
}

function fixtureHistory(today: string, fresh: boolean): TrainerHistory {
  if (fresh) return { days: [] };
  const offsets = [-12, -10, -9, -8, -6, -3, -2, -1];
  return {
    days: offsets.map((o, i) => {
      const reviews = 20 + ((i * 17) % 40);
      const good = Math.round(reviews * (0.76 + (i % 4) * 0.05));
      return {
        date: addDays(today, o),
        reviews,
        good,
        again: reviews - good,
        newIntroduced: 5 + (i % 3) * 5,
      };
    }),
  };
}

function seededClient(fresh: boolean): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  const today = todayKey();
  const overview = fixtureOverview(today, fresh);
  qc.setQueryData(qk.quizOverview(today), overview);
  qc.setQueryData(qk.quizHistory(90, today), fixtureHistory(today, fresh));
  qc.setQueryData<RecentMisses>(qk.quizRecentMisses(), { misses: [] });
  qc.setQueryData(qk.quizSettings(), overview.settings);
  qc.setQueryData<TimelinePins>(qk.quizPins(), {
    pins: fresh
      ? []
      : Array.from({ length: 105 }, (_, i) => ({
          questionId: `f${String(i * 60 + 1).padStart(5, "0")}`,
          state: "learning" as const,
          known: i % 2 === 0,
          lastReviewedAt: null,
        })),
    summary: fresh ? { dated: 0, spanYears: 0 } : { dated: 105, spanYears: 1300 },
  });
  qc.setQueryData<MyReports>(qk.quizReports(), fixtureReports(fresh));
  qc.setQueryData(qk.quizJournal(viewerTimeZone()), {
    pages: [fixtureJournal(today, fresh)],
    pageParams: [null],
  });
  return qc;
}

function jq(
  questionId: string,
  en: string,
  answerEn: string,
  grades: JournalQuestion["grades"],
  extra: Partial<JournalQuestion> = {},
): JournalQuestion {
  return {
    questionId,
    printed: true,
    en,
    de: en,
    answerEn,
    answerDe: answerEn,
    grades,
    firstSeen: false,
    fromGame: false,
    ...extra,
  };
}

function fixtureJournal(today: string, fresh: boolean): Journal {
  if (fresh) return { days: [], nextBefore: null };
  return {
    nextBefore: addDays(today, -3),
    days: [
      {
        date: today,
        reviewed: 6,
        knew: 4,
        newQuestions: 2,
        articlesRead: 1,
        articles: [
          {
            articleId: "a0001",
            domain: "music-stage",
            titleEn: "Wannabe (Spice Girls song)",
            titleDe: "Wannabe (Spice-Girls-Lied)",
            readAt: `${today}T08:12:00.000Z`,
            questions: [
              jq(
                "f00001",
                "With which number-one hit did the Spice Girls achieve international fame in 1996?",
                "Wannabe",
                ["good"],
                { firstSeen: true },
              ),
              jq(
                "f00003",
                "Which band member was nicknamed “Posh”?",
                "Victoria Beckham",
                ["again", "good"],
                { printed: false },
              ),
            ],
          },
          {
            articleId: "a0162",
            domain: "history",
            titleEn: "Treaty of Westphalia",
            titleDe: "Westfälischer Friede",
            readAt: null,
            questions: [
              jq(
                "f00806",
                "Which war did the Peace of Westphalia end in 1648?",
                "The Thirty Years' War",
                ["again"],
                { firstSeen: true },
              ),
              jq(
                "f00809",
                "In which two cities was the treaty negotiated?",
                "Münster and Osnabrück",
                ["good"],
              ),
            ],
          },
        ],
      },
      {
        date: addDays(today, -1),
        reviewed: 3,
        knew: 3,
        newQuestions: 0,
        articlesRead: 1,
        articles: [
          {
            articleId: "a0502",
            domain: "earth-space",
            titleEn: "Olympus Mons",
            titleDe: "Olympus Mons",
            readAt: null,
            questions: [
              jq(
                "f02507",
                "On which planet is the highest volcano in the solar system?",
                "Mars",
                ["good"],
                { fromGame: true },
              ),
            ],
          },
          {
            articleId: "a0924",
            domain: "technology",
            titleEn: "ENIAC",
            titleDe: "ENIAC",
            readAt: `${addDays(today, -1)}T19:40:00.000Z`,
            questions: [],
          },
        ],
      },
    ],
  };
}

export default function TrainerPreview({
  scene,
}: {
  scene: "hub" | "card" | "journal" | "reports";
}) {
  const [params] = useSearchParams();
  const fresh = params.get("fresh") === "1";
  const client = useMemo(() => seededClient(fresh), [fresh]);
  return (
    <TrainerBaseProvider value={BASE}>
      <QueryClientProvider client={client}>
        <div className="flex h-screen flex-col bg-surface-950">
          {scene === "hub" ? (
            <TrainerHub />
          ) : scene === "journal" ? (
            <WikiJournal />
          ) : scene === "reports" ? (
            <WikiReports />
          ) : (
            <CardScene
              flip={params.get("revealed") === "1"}
              report={params.get("report") === "1"}
            />
          )}
        </div>
      </QueryClientProvider>
    </TrainerBaseProvider>
  );
}

function fixtureReports(fresh: boolean): MyReports {
  if (fresh) return { reports: [], unread: 0 };
  const snapshot = {
    kind: "question" as const,
    en: "Which war did the Peace of Westphalia end in 1648?",
    de: "Welchen Krieg beendete der Westfälische Friede 1648?",
    answerEn: "The Thirty Years' War",
    answerDe: "Den Dreißigjährigen Krieg",
    timeline: null,
    source: null,
  };
  const base = {
    target: { kind: "question" as const, id: "f00806" },
    articleId: "a0162",
    domain: "history",
    language: "en" as const,
    surface: "trainer" as const,
    createdAt: "2026-10-04T10:00:00.000Z",
    updatedAt: "2026-10-04T10:00:00.000Z",
    snapshot,
  };
  return {
    unread: 1,
    reports: [
      {
        ...base,
        id: 3,
        issue: "wrong-date",
        message: "The treaty was signed on 24 October 1648, the card says 1649.",
        status: "fixed",
        resolutionNote: "Corrected to 24 October 1648 — thanks for spotting it!",
        resolvedAt: "2026-10-06T18:00:00.000Z",
        unread: true,
      },
      {
        ...base,
        id: 2,
        target: { kind: "article", id: "a0001" },
        articleId: "a0001",
        domain: "music-stage",
        issue: "typo",
        message: "“Brect” in the second paragraph.",
        status: "open",
        resolutionNote: null,
        resolvedAt: null,
        unread: false,
        snapshot: { kind: "article", titleEn: "Bertolt Brecht", titleDe: "Bertolt Brecht" },
      },
      {
        ...base,
        id: 1,
        issue: "translation",
        language: "de",
        message: null,
        status: "declined",
        resolutionNote: "Both versions say the same thing — the German is just shorter.",
        resolvedAt: "2026-10-05T09:00:00.000Z",
        unread: false,
      },
    ],
  };
}

function CardScene({ flip, report }: { flip: boolean; report: boolean }) {
  const article = useArticle("a0001");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!flip) return;
    const t = window.setTimeout(() => setRevealed(true), 400);
    return () => window.clearTimeout(t);
  }, [flip]);
  const found = article.data ? findFact(article.data, "f00001") : null;
  const question = found ? questionOf(found.fact, DEFAULT_QUIZ_SETTINGS.sources) : null;
  return (
    <TrainerScreen>
      <PageMain width="2xl" className="flex flex-col justify-center py-10">
        {article.data && found && question && (
          <FlashCard
            card={{
              item: {
                questionId: "f00001",
                articleId: "a0001",
                domain: "music-stage",
                tier: "new",
              },
              article: article.data,
              question,
              index: found.index,
            }}
            domain={domainOf(article.data.domain)}
            state={null}
            revealed={revealed}
            language={{ primary: "en", secondary: null }}
            snippet={null}
            snippetPending={false}
            articleHref={`${BASE}/wiki`}
            timelineHref={`${BASE}/timeline`}
            onReveal={() => setRevealed(true)}
          />
        )}
        {question && report && (
          <ReportDialog
            context={{
              target: { kind: "question", id: "f00001" },
              title: question.en,
              domain: "music-stage",
              surface: "trainer",
              hideSpoilers: !revealed,
              language: "en",
            }}
            onClose={() => {}}
          />
        )}
      </PageMain>
    </TrainerScreen>
  );
}
