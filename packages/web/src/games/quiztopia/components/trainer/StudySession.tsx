import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { XIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Eyebrow,
  IconButton,
  LoadingState,
  ProgressBar,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { errorMessageOf } from "../../../../lib/error-message";
import { type District, districtByN } from "../../bands";
import { useTitles } from "../../hooks/useContent";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { useQuiztopiaSettings } from "../../hooks/useQuiztopiaSettings";
import { useTrainerSession } from "../../hooks/useTrainerSession";
import { isPlainKey, isTypingTarget } from "../../keys";
import { useTrainerPaths } from "../../paths";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
import { FlashCard } from "./FlashCard";
import { GradeBar } from "./GradeBar";
import { NewArticlesIntro } from "./NewArticlesIntro";
import { SessionSummary } from "./SessionSummary";
import { specFromSearch } from "./session-spec";
import { TrainerScreen } from "./TrainerScreen";

// One study session: the search params pick the queue (a district, a set,
// an explicit id list, or everything due — optionally capped), the hook
// owns it, this screen only lays out top bar, card and grade bar and wires
// the keys. Not a GameScreen: there is no board, no rails, no fan.

export default function StudySession() {
  const [params] = useSearchParams();
  const search = params.toString();
  const spec = useMemo(() => specFromSearch(search), [search]);
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const session = useTrainerSession(spec);
  const { language, setLanguage } = useQuestionLanguage();
  const titles = useTitles(spec.kind === "set");

  const district: District | null =
    spec.kind === "due" && spec.category !== null
      ? districtByN(spec.category)
      : session.item
        ? districtByN(session.item.category)
        : null;
  const scopeDistrict: District | null =
    spec.kind === "due" && spec.category !== null ? districtByN(spec.category) : null;

  const title = useMemo(() => {
    if (spec.kind === "set") {
      const t = titles.data?.[spec.setId];
      return `Mini quiz · ${t ? (language === "de" ? t[1] : t[0]) : spec.setId}`;
    }
    if (spec.kind === "ids") return "Practice misses";
    if (scopeDistrict) return scopeDistrict.en;
    return spec.limit ? `Quick ${spec.limit}` : "All districts";
  }, [spec, titles.data, language, scopeDistrict]);
  useDocumentTitle(`${title} · Quiztopia`);

  // Whole-set days start by reading the day's new articles; their questions
  // are then shuffled in with everything due (the server already mixed them).
  const { settings } = useQuiztopiaSettings();
  const newSets = useMemo(() => {
    if (spec.kind !== "due" || settings.newCardOrder !== "sets" || session.status !== "ready") {
      return [];
    }
    const seen = new Map<string, { setId: string; cardId: string; category: number }>();
    for (const it of session.items) {
      if (it.tier === "new" && !seen.has(it.setId)) {
        seen.set(it.setId, { setId: it.setId, cardId: it.cardId, category: it.category });
      }
    }
    return [...seen.values()];
  }, [spec.kind, settings.newCardOrder, session.status, session.items]);
  const [readIndex, setReadIndex] = useState(0);
  const [readingDone, setReadingDone] = useState(false);
  const reading =
    newSets.length > 0 && !readingDone && readIndex < newSets.length && session.progress.done === 0;

  const { revealed, reveal, grade, undo, canUndo, complete, status } = session;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target)) return;
      if (reading && e.key !== "Escape") return;
      if (e.key === "Escape") {
        e.preventDefault();
        navigate(paths.hub);
        return;
      }
      if (status !== "ready" || complete) return;
      switch (e.key) {
        case " ":
        case "Enter":
          if (!revealed) {
            e.preventDefault();
            reveal();
          }
          break;
        case "1":
        case "ArrowLeft":
          if (revealed) {
            e.preventDefault();
            grade("again");
          }
          break;
        case "2":
        case "ArrowRight":
          if (revealed) {
            e.preventDefault();
            grade("good");
          }
          break;
        case "u":
        case "U":
          if (canUndo) {
            e.preventDefault();
            undo();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, revealed, reveal, grade, undo, canUndo, complete, status, navigate, paths.hub]);

  const loadError = errorMessageOf(session.loadError, "Couldn't load the queue.");

  let body: ReactNode;
  if (loadError) {
    body = (
      <div className="flex flex-col gap-3">
        <ErrorAlert message={loadError} />
        <div>
          <Button variant="secondary" onClick={() => navigate(paths.hub)}>
            Back to the city
          </Button>
        </div>
      </div>
    );
  } else if (session.status === "loading") {
    body = <LoadingState fillHeight label="Shuffling today's cards…" />;
  } else if (session.empty) {
    body = (
      <EmptyState
        fillHeight
        titleAs="h2"
        title={scopeDistrict ? `${scopeDistrict.en} is lit` : "Nothing due right now"}
        description={
          spec.kind === "due"
            ? "No cards are due and today's new cards are done. Come back tomorrow, or raise the daily budget in settings."
            : "None of these questions could be loaded."
        }
        action={
          <Button variant="secondary" onClick={() => navigate(paths.hub)}>
            Back to the city
          </Button>
        }
      />
    );
  } else if (reading) {
    body = (
      <NewArticlesIntro
        sets={newSets}
        index={readIndex}
        language={language}
        cardCount={session.progress.total}
        onNext={() => {
          if (readIndex + 1 >= newSets.length) setReadingDone(true);
          else setReadIndex(readIndex + 1);
        }}
        onSkip={() => setReadingDone(true)}
      />
    );
  } else if (complete) {
    body = <SessionSummary session={session} title={title} language={language} paths={paths} />;
  } else if (!session.current || !district) {
    body = <LoadingState fillHeight label="Dealing the card…" />;
  } else {
    const q = session.current.q;
    body = (
      <FlashCard
        card={session.current}
        district={district}
        state={session.state}
        revealed={revealed}
        language={language}
        snippet={revealed ? session.snippetFor(language) : null}
        snippetPending={session.articlePending}
        articleHref={paths.wikiArticle(district.slug, session.current.item.cardId, q)}
        timelineHref={paths.timeline(session.current.item.questionId)}
        onReveal={reveal}
      />
    );
  }

  const showGradeBar = !loadError && status === "ready" && !session.empty && !complete && !reading;

  return (
    <TrainerScreen className="flex flex-col">
      <header className="sticky top-0 z-lift border-b border-line bg-surface-950/80 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow
              tone={scopeDistrict?.tone ?? "accent"}
              size="sm"
              className="flex items-center gap-1.5 truncate"
            >
              {scopeDistrict && <BuildingGlyph name={scopeDistrict.building} lit size={12} />}
              {scopeDistrict
                ? `${scopeDistrict.label} · ${scopeDistrict.buildingLabel}`
                : "Trainer"}
            </Eyebrow>
            <p className="truncate text-sm font-semibold text-fg-strong">{title}</p>
          </div>
          {status === "ready" && !session.empty && (
            <div className="flex w-24 shrink-0 flex-col items-end gap-1 sm:w-32">
              <span className="text-2xs tabular-nums text-fg-muted">
                {Math.min(session.progress.done + 1, session.progress.total)} of{" "}
                {session.progress.total}
              </span>
              <ProgressBar
                size="sm"
                tone={scopeDistrict?.tone ?? "accent"}
                value={
                  session.progress.total > 0 ? session.progress.done / session.progress.total : 0
                }
                label="Session progress"
              />
            </div>
          )}
          <LanguageToggle value={language} onChange={setLanguage} />
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Close session"
            title="Back to the city (Esc)"
            onClick={() => navigate(paths.hub)}
            icon={<XIcon />}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-6">
        {(session.notice || session.offlinePending > 0) && (
          <div className="flex flex-wrap items-center gap-2" role="status">
            {session.offlinePending > 0 && (
              <Badge tone="amber" size="sm" ring>
                {session.offlinePending} review{session.offlinePending === 1 ? "" : "s"} waiting to
                sync
              </Badge>
            )}
            {session.notice && <p className="text-xs text-amber-200">{session.notice}</p>}
          </div>
        )}
        {body}
      </main>

      {showGradeBar && (
        <GradeBar
          revealed={revealed}
          disabled={session.cardPending || !session.current}
          onReveal={reveal}
          onGrade={grade}
          canUndo={canUndo}
          onUndo={undo}
          lastReview={session.lastReview}
          today={session.today}
        />
      )}
    </TrainerScreen>
  );
}
