import type { SearchResponse } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  InteractiveCard,
  LoadingState,
  MicroLabel,
  PageHeader,
  PageMain,
  SearchInput,
  Section,
  TONE_TEXT,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { errorMessageOf } from "../../../../lib/error-message";
import { qk } from "../../../../lib/query-keys";
import { searchQuery } from "../../api";
import { DISTRICTS, districtByN } from "../../bands";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { useTrainerPaths } from "../../paths";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
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

const KIND_TONE = { answer: "emerald", title: "sky", question: "neutral" } as const;

export default function WikiSearch() {
  useDocumentTitle("Search · The Archive");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);
  const { language, setLanguage } = useQuestionLanguage({ allowBoth: false, keyboard: false });

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
    queryKey: qk.quiztopiaSearch(q, language, null),
    queryFn: searchQuery({ q, lang: language, limit: 50 }),
    enabled,
    staleTime: 5 * 60_000,
  });

  const tokens = useMemo(() => searchTokens(q), [q]);
  const groups = useMemo(() => {
    const byCat = new Map<number, Hit[]>();
    for (const hit of results.data?.hits ?? []) {
      const list = byCat.get(hit.category) ?? [];
      list.push(hit);
      byCat.set(hit.category, list);
    }
    return DISTRICTS.filter((d) => byCat.has(d.n)).map((d) => ({
      district: d,
      hits: byCat.get(d.n) ?? [],
    }));
  }, [results.data]);

  const errorMessage = errorMessageOf(results.error, "Search failed.");
  const hitCount = results.data?.hits.length ?? 0;

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-12">
        <PageHeader
          size="md"
          eyebrow="The Archive"
          title="Search"
          actions={
            <Button variant="link" onClick={() => navigate(paths.wiki)}>
              ← Districts
            </Button>
          }
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            autoFocus
            containerClassName="flex-1"
            aria-label="Search the archive"
            placeholder="A word from a question, an answer or a title"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <LanguageToggle value={language} onChange={setLanguage} allowBoth={false} size="sm" />
        </div>

        {!enabled && (
          <p className="text-sm text-fg-muted">
            Type at least {MIN_LENGTH} letters. Searching in{" "}
            {language === "de" ? "German" : "English"}
            {" — "}the toggle switches the language of the texts searched.
          </p>
        )}
        {enabled && errorMessage && <ErrorAlert message={errorMessage} />}
        {enabled && results.isPending && <LoadingState label="Searching…" />}
        {enabled && results.data && hitCount === 0 && (
          <EmptyState
            title={`No hits for “${q}”`}
            description={
              language === "en"
                ? "Try the German spelling — names and titles differ between the two texts."
                : "Try the English spelling — names and titles differ between the two texts."
            }
          />
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-6">
            <MicroLabel className="tabular-nums">
              {hitCount} hit{hitCount === 1 ? "" : "s"}
              {hitCount >= 50 ? " · showing the first 50" : ""}
            </MicroLabel>
            {groups.map(({ district: d, hits }) => (
              <Section
                key={d.slug}
                title={d.en}
                count={hits.length}
                icon={
                  <BuildingGlyph name={d.building} lit size={14} className={TONE_TEXT[d.tone]} />
                }
              >
                <ul className="flex flex-col gap-2">
                  {hits.map((hit) => {
                    const kind = hitKind(hit, tokens);
                    const q = Number.parseInt(hit.questionId.slice(-1), 10);
                    return (
                      <li key={hit.questionId}>
                        <InteractiveCard
                          as={Link}
                          to={paths.wikiArticle(districtByN(hit.category).slug, hit.cardId, q)}
                          padding="sm"
                          className="flex flex-col gap-1"
                        >
                          <div className="flex items-center gap-2">
                            <MicroLabel>
                              {hit.cardId} · Q{q + 1}
                            </MicroLabel>
                            <Badge tone={KIND_TONE[kind]} size="xs">
                              {kind}
                            </Badge>
                          </div>
                          <p className="text-sm text-fg-primary" lang={language}>
                            {highlight(hit.question, tokens)}
                          </p>
                          <p className="text-xs text-fg-secondary" lang={language}>
                            <span className="text-fg-muted">→ </span>
                            {highlight(hit.answer, tokens)}
                          </p>
                          <p className="text-2xs text-fg-muted" lang={language}>
                            {highlight(hit.title, tokens)}
                          </p>
                        </InteractiveCard>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ))}
          </div>
        )}
      </PageMain>
    </TrainerScreen>
  );
}
