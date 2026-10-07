import { addDays } from "@boardgames/core/games/quiztopia/srs";
import type {
  Journal,
  JournalQuestion,
  RecentMisses,
  TimelinePins,
  TrainerHistory,
  TrainerOverview,
} from "@boardgames/core/protocol";
import { DEFAULT_QUIZTOPIA_SETTINGS } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageMain } from "../../../../components/ui";
import { qk } from "../../../../lib/query-keys";
import { todayKey } from "../../api";
import { districtByN } from "../../bands";
import { findQuestion } from "../../content";
import { useCardQuestions } from "../../hooks/useContent";
import { viewerTimeZone } from "../../hooks/useJournal";
import { TrainerBaseProvider } from "../../paths";
import WikiJournal from "../wiki/WikiJournal";
import { FlashCard } from "./FlashCard";
import TrainerHub from "./TrainerHub";
import { TrainerScreen } from "./TrainerScreen";

// Dev-only trainer scenes for /dev/quiztopia-preview (no auth, no server):
//   scene=hub        — the hub over a fixture overview / history (seeded
//                      into a private query cache; `&fresh=1` = brand-new member)
//   scene=journal    — the journal over three fixture days
//   scene=card       — the study card on a real content card; `&revealed=1`
//                      flips it after mount, exercising the real animation

const BASE = "/dev/quiztopia-preview";

function fixtureOverview(today: string, fresh: boolean): TrainerOverview {
  const seen = fresh ? [] : [212, 64, 40, 38, 30, 25, 18, 12, 9, 6, 3, 0];
  return {
    contentVersion: "dev",
    today,
    streak: fresh
      ? { current: 0, longest: 0, studiedToday: false }
      : { current: 4, longest: 6, studiedToday: false },
    todayCounts: fresh
      ? { reviews: 0, good: 0, again: 0, newIntroduced: 0 }
      : { reviews: 12, good: 10, again: 2, newIntroduced: 0 },
    categories: Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const s = seen[i] ?? 0;
      const known = Math.round(s * 0.55);
      const due = n === 1 ? 22 : n === 2 ? 4 : 0;
      return {
        n,
        total: 885,
        seen: s,
        due,
        learningDue: n === 1 ? 11 : 0,
        newAvailable: 885 - s,
        newRemainingToday: 15,
        known,
        mature: Math.round(known * 0.1),
        mastery: 0,
        retention30: s > 0 ? 0.78 : null,
        reviews30: s,
        leeches: n === 1 ? 2 : 0,
      };
    }),
    settings: {
      ...DEFAULT_QUIZTOPIA_SETTINGS,
      excludeFromAll: fresh ? [] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
  qc.setQueryData(qk.quiztopiaOverview(today), overview);
  qc.setQueryData(qk.quiztopiaHistory(90, today), fixtureHistory(today, fresh));
  qc.setQueryData<RecentMisses>(qk.quiztopiaRecentMisses(), { misses: [] });
  qc.setQueryData(qk.quiztopiaSettings(), overview.settings);
  qc.setQueryData<TimelinePins>(qk.quiztopiaPins(), {
    pins: fresh
      ? []
      : Array.from({ length: 105 }, (_, i) => ({
          questionId: `c${String((i % 100) + 1).padStart(3, "0")}-s01-q${i % 5}`,
          state: "learning" as const,
          known: i % 2 === 0,
          lastReviewedAt: null,
        })),
    summary: fresh ? { dated: 0, spanYears: 0 } : { dated: 105, spanYears: 1300 },
  });
  qc.setQueryData(qk.quiztopiaJournal(viewerTimeZone()), {
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
    q: Number(questionId.slice(-1)),
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
        sets: [
          {
            setId: "c001-s01",
            category: 1,
            titleEn: "Wannabe (Spice Girls song)",
            titleDe: "Wannabe (Spice-Girls-Lied)",
            readAt: `${today}T08:12:00.000Z`,
            questions: [
              jq(
                "c001-s01-q0",
                "With which number-one hit did the Spice Girls achieve international fame in 1996?",
                "Wannabe",
                ["good"],
                { firstSeen: true },
              ),
              jq("c001-s01-q2", "Which band member was nicknamed “Posh”?", "Victoria Beckham", [
                "again",
                "good",
              ]),
            ],
          },
          {
            setId: "c014-s06",
            category: 6,
            titleEn: "Treaty of Westphalia",
            titleDe: "Westfälischer Friede",
            readAt: null,
            questions: [
              jq(
                "c014-s06-q0",
                "Which war did the Peace of Westphalia end in 1648?",
                "The Thirty Years' War",
                ["again"],
                { firstSeen: true },
              ),
              jq(
                "c014-s06-q3",
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
        sets: [
          {
            setId: "c042-s10",
            category: 10,
            titleEn: "Olympus Mons",
            titleDe: "Olympus Mons",
            readAt: null,
            questions: [
              jq(
                "c042-s10-q1",
                "On which planet is the highest volcano in the solar system?",
                "Mars",
                ["good"],
                { fromGame: true },
              ),
            ],
          },
          {
            setId: "c077-s12",
            category: 12,
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

export default function TrainerPreview({ scene }: { scene: "hub" | "card" | "journal" }) {
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
          ) : (
            <CardScene flip={params.get("revealed") === "1"} />
          )}
        </div>
      </QueryClientProvider>
    </TrainerBaseProvider>
  );
}

function CardScene({ flip }: { flip: boolean }) {
  const cardQuery = useCardQuestions("c001");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!flip) return;
    const t = window.setTimeout(() => setRevealed(true), 400);
    return () => window.clearTimeout(t);
  }, [flip]);
  const found = cardQuery.data ? findQuestion(cardQuery.data, "c001-s01-q0") : null;
  return (
    <TrainerScreen>
      <PageMain width="2xl" className="flex flex-col justify-center py-10">
        {found && (
          <FlashCard
            card={{
              item: {
                questionId: "c001-s01-q0",
                setId: "c001-s01",
                cardId: "c001",
                category: 1,
                tier: "new",
              },
              set: found.set,
              question: found.question,
              q: found.q,
            }}
            district={districtByN(1)}
            state={null}
            revealed={revealed}
            language="en"
            snippet={null}
            snippetPending={false}
            articleHref={`${BASE}/wiki`}
            timelineHref={`${BASE}/timeline`}
            onReveal={() => setRevealed(true)}
          />
        )}
      </PageMain>
    </TrainerScreen>
  );
}
