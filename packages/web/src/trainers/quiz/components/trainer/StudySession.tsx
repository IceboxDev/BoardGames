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
import { coreToneOf, type Domain, domainOf, findDomain } from "../../domains";
import { useQuizIndex } from "../../hooks/useContent";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { useTrainerSession } from "../../hooks/useTrainerSession";
import { isScreenShortcut } from "../../keys";
import { fieldIn } from "../../logic/text";
import { useTrainerPaths } from "../../paths";
import { LanguageToggle } from "../common/LanguageToggle";
import { FlashCard } from "./FlashCard";
import { GradeBar } from "./GradeBar";
import { NewArticlesIntro } from "./NewArticlesIntro";
import { SessionSummary } from "./SessionSummary";
import { articlesToRead } from "./session-plan";
import { specFromSearch } from "./session-spec";
import { TrainerScreen } from "./TrainerScreen";

// One study session: the search params pick the queue (a domain, an
// article, an explicit id list, or everything due — optionally capped), the hook
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
  const index = useQuizIndex(spec.kind === "article");

  const scopeDomain: Domain | null = spec.kind === "due" ? (findDomain(spec.domain) ?? null) : null;
  const domain: Domain | null =
    scopeDomain ?? (session.item ? domainOf(session.item.domain) : null);

  const title = useMemo(() => {
    if (spec.kind === "article") {
      const a = index.data?.article(spec.articleId);
      return `Mini quiz · ${a ? fieldIn(a, "title", language.primary) : spec.articleId}`;
    }
    if (spec.kind === "ids") return "Practice misses";
    if (scopeDomain) return scopeDomain.en;
    return spec.limit ? `Quick ${spec.limit}` : "All domains";
  }, [spec, index.data, language, scopeDomain]);
  useDocumentTitle(`${title} · Quiz`);

  // A day starts by reading its new articles; their facts are then shuffled
  // in with everything due (the server already mixed them). An article begun
  // on an earlier sitting was read then: its leftover facts are just dealt.
  const newArticles = useMemo(
    () => (spec.kind === "due" && session.status === "ready" ? articlesToRead(session.items) : []),
    [spec.kind, session.status, session.items],
  );
  const [readIndex, setReadIndex] = useState(0);
  const [readingDone, setReadingDone] = useState(false);
  const reading =
    newArticles.length > 0 &&
    !readingDone &&
    readIndex < newArticles.length &&
    session.progress.inSession === 0;

  // `reveal` / `grade` refuse on their own while the card's text is still
  // loading, so the keys need no extra gate beyond the screen's state.
  const { revealed, reveal, grade, undo, canUndo, complete, status } = session;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isScreenShortcut(e)) return;
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
            Back to the hub
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
        title={scopeDomain ? `${scopeDomain.en} is all caught up` : "Nothing due right now"}
        description={
          spec.kind === "due"
            ? "No cards are due and today's new facts are done. Come back tomorrow, or raise the daily budget in settings."
            : "None of these facts could be loaded."
        }
        action={
          <Button variant="secondary" onClick={() => navigate(paths.hub)}>
            Back to the hub
          </Button>
        }
      />
    );
  } else if (reading) {
    body = (
      <NewArticlesIntro
        articles={newArticles}
        index={readIndex}
        language={language}
        cardCount={session.items.length}
        onNext={() => {
          if (readIndex + 1 >= newArticles.length) setReadingDone(true);
          else setReadIndex(readIndex + 1);
        }}
        onSkip={() => setReadingDone(true)}
      />
    );
  } else if (complete) {
    body = <SessionSummary session={session} title={title} language={language} paths={paths} />;
  } else if (!session.current || !domain) {
    body = <LoadingState fillHeight label="Dealing the card…" />;
  } else {
    body = (
      <FlashCard
        card={session.current}
        domain={domain}
        state={session.state}
        revealed={revealed}
        language={language}
        snippet={revealed ? session.snippetFor(language.primary) : null}
        snippetPending={session.articlePending}
        articleHref={paths.wikiArticle(
          session.current.item.articleId,
          session.current.item.questionId,
        )}
        timelineHref={paths.timeline(session.current.item.questionId)}
        onReveal={reveal}
      />
    );
  }

  const showGradeBar = !loadError && status === "ready" && !session.empty && !complete && !reading;

  return (
    <TrainerScreen className="flex flex-col">
      <header className="sticky top-0 z-lift border-b border-line bg-surface-950/80 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow
              tone={scopeDomain ? coreToneOf(scopeDomain.tone) : "accent"}
              size="sm"
              className="truncate"
            >
              {scopeDomain ? `${scopeDomain.label} · ${scopeDomain.de}` : "Trainer"}
            </Eyebrow>
            <p className="truncate text-sm font-semibold text-fg-strong">{title}</p>
          </div>
          {status === "ready" && !session.empty && (
            <div className="flex w-14 shrink-0 flex-col items-end gap-1 sm:w-32">
              <span className="text-2xs tabular-nums text-fg-muted">
                {Math.min(session.progress.done + 1, session.progress.total)} of{" "}
                {session.progress.total}
              </span>
              <ProgressBar
                size="sm"
                tone={scopeDomain ? coreToneOf(scopeDomain.tone) : "accent"}
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
            title="Back to the hub (Esc)"
            onClick={() => navigate(paths.hub)}
            icon={<XIcon />}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-6">
        {(session.notice || session.offlinePending > 0 || session.offlineRejected > 0) && (
          <div className="flex flex-wrap items-center gap-2" role="status">
            {session.offlinePending > 0 && (
              <Badge tone="amber" size="sm" ring>
                {session.offlinePending} review{session.offlinePending === 1 ? "" : "s"} waiting to
                sync
              </Badge>
            )}
            {session.offlineRejected > 0 && (
              <Badge tone="rose" size="sm" ring>
                {session.offlineRejected} queued review
                {session.offlineRejected === 1 ? " was" : "s were"} rejected by the server
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
