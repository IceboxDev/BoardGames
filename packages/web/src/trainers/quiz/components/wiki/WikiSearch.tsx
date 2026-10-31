import type { SearchResponse } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert, LoadingState } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { qk } from "../../../../lib/query-keys";
import { searchQuery } from "../../api";
import { DOMAINS } from "../../domains";
import { usePrimaryLanguage } from "../../hooks/useQuestionLanguage";
import { useTrainerPaths } from "../../paths";
import { DomainIcon } from "../common/DomainIcon";
import { PrimaryLanguageToggle } from "../common/LanguageToggle";
import { Headline, PaperNote, PaperSearch, SectionHead } from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { KICKER } from "../paper/paper-style";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { hasMatch, highlight, searchTokens } from "./highlight";

// Full-text search over questions, answers and titles in one language. The
// box is the source of truth; the URL follows it after a short pause so a
// result page can be shared and the back button returns to the query.

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

type Hit = SearchResponse["hits"][number];
type HitKind = "answer" | "title" | "question";

function hitKind(hit: Hit, tokens: readonly string[]): HitKind {
  if (hasMatch(hit.answer, tokens)) return "answer";
  if (hasMatch(hit.title, tokens)) return "title";
  return "question";
}

const KIND_LABEL: Record<HitKind, string> = {
  answer: "In the answer",
  title: "In the title",
  question: "In the question",
};

export default function WikiSearch() {
  useDocumentTitle("Search · The Archive");
  const paths = useTrainerPaths();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);
  const { language, setPrimary } = usePrimaryLanguage({ keyboard: false });

  // Box → URL, debounced; URL → box when navigation changes it underneath.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === urlQ) return;
    const t = window.setTimeout(() => {
      setParams(trimmed ? { q: trimmed } : {}, { replace: true });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text, urlQ, setParams]);
  useEffect(() => {
    setText((cur) => (cur.trim() === urlQ ? cur : urlQ));
  }, [urlQ]);

  const q = urlQ.trim();
  const enabled = q.length >= MIN_LENGTH;
  const results = useQuery({
    queryKey: qk.quizSearch(q, language, null),
    queryFn: searchQuery({ q, lang: language, limit: 50 }),
    enabled,
    staleTime: 5 * 60_000,
  });

  const tokens = useMemo(() => searchTokens(q), [q]);
  const groups = useMemo(() => {
    const byDomain = new Map<string, Hit[]>();
    for (const hit of results.data?.hits ?? []) {
      const list = byDomain.get(hit.domain) ?? [];
      list.push(hit);
      byDomain.set(hit.domain, list);
    }
    return DOMAINS.filter((d) => byDomain.has(d.slug)).map((d) => ({
      domain: d,
      hits: byDomain.get(d.slug) ?? [],
    }));
  }, [results.data]);

  const errorMessage = errorMessageOf(results.error, "Search failed.");
  const hitCount = results.data?.hits.length ?? 0;

  return (
    <TrainerScreen>
      <PaperPage pageLabel="Search the archive" folio="B4" current="archive" className="gap-4">
        <header className="flex flex-col gap-3">
          <Link to={paths.wiki} className={cn(KICKER, "text-fg-muted hover:text-fg-strong")}>
            ◂ The Archive
          </Link>
          <Headline as="h1" size="lg">
            Search the archive
          </Headline>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <PaperSearch
              autoFocus
              className="flex-1"
              label="Search the archive"
              placeholder="A word from a question, an answer or a title"
              value={text}
              onChange={setText}
            />
            <PrimaryLanguageToggle value={language} onChange={setPrimary} size="sm" />
          </div>
        </header>

        {!enabled && (
          <PaperNote className="text-left">
            Type at least {MIN_LENGTH} letters. Searching in{" "}
            {{ en: "English", de: "German", ru: "Russian" }[language]}
            {" — "}the toggle switches the language of the texts searched.
          </PaperNote>
        )}
        {enabled && errorMessage && <ErrorAlert message={errorMessage} />}
        {enabled && results.isPending && <LoadingState label="Searching…" />}
        {enabled && results.data && hitCount === 0 && (
          <PaperNote>
            No hits for “{q}”.{" "}
            {language === "en"
              ? "Try the German spelling — names and titles differ between the languages."
              : "Try the English spelling — names and titles differ between the languages."}
          </PaperNote>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-6">
            <p className={cn(KICKER, "tabular-nums text-accent-300")}>
              {hitCount} hit{hitCount === 1 ? "" : "s"}
              {hitCount >= 50 ? " · showing the first 50" : ""}
            </p>
            {groups.map(({ domain: d, hits }) => (
              <section key={d.slug} aria-label={d.en} className="flex flex-col gap-1">
                <SectionHead right={<span className="tabular-nums">{hits.length}</span>}>
                  <span className="flex items-center gap-2">
                    <DomainIcon domain={d.slug} size={28} />
                    <span className={d.ink}>{d.en}</span>
                  </span>
                </SectionHead>
                <ul className="grid gap-x-8 md:grid-cols-2">
                  {hits.map((hit) => {
                    const kind = hitKind(hit, tokens);
                    return (
                      <li
                        key={hit.questionId}
                        className="border-b border-dotted border-line-strong"
                      >
                        <Link
                          to={paths.wikiArticle(hit.articleId, hit.questionId)}
                          className="group flex flex-col gap-0.5 py-2.5 focus-visible:outline-2 focus-visible:outline-accent-400"
                        >
                          <span className={cn(KICKER, "text-fg-muted")}>{KIND_LABEL[kind]}</span>
                          <span
                            className="font-headline text-base font-bold leading-snug text-fg-strong group-hover:text-accent-200"
                            lang={language}
                          >
                            {highlight(hit.title, tokens)}
                          </span>
                          <span className="font-news text-sm text-fg-primary" lang={language}>
                            {highlight(hit.question, tokens)}
                          </span>
                          <span
                            className={cn("font-news text-sm font-semibold", d.ink)}
                            lang={language}
                          >
                            {highlight(hit.answer, tokens)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PaperPage>
    </TrainerScreen>
  );
}
