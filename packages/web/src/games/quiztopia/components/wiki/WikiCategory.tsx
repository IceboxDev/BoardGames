import { setId } from "@boardgames/core/games/quiztopia/ids";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CheckIcon } from "../../../../components/icons";
import {
  Eyebrow,
  InteractiveCard,
  MicroLabel,
  PageHeader,
  PageMain,
  ProgressBar,
  QueryBoundary,
  SearchInput,
  Select,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { wikiReadsQuery } from "../../api";
import { type District, districtBySlug, TONE_STRIP } from "../../bands";
import { CARD_IDS } from "../../content";
import { useTitles } from "../../hooks/useContent";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { useTrainerPaths } from "../../paths";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { foldText } from "./highlight";

// One district's 177 articles as a list: card id, title in the chosen
// language, read marker. Filter as you type; sort by card order, title or
// unread first. Per-row progress dots are deliberately absent — 177 rows
// would mean 177 state requests; the article page shows them instead.

type Sort = "card" | "title" | "unread";

export default function WikiCategory() {
  const { category } = useParams<{ category: string }>();
  const paths = useTrainerPaths();
  const district = category ? districtBySlug(category) : undefined;
  if (!district) return <Navigate to={paths.wiki} replace />;
  return <CategoryScreen district={district} />;
}

function CategoryScreen({ district: d }: { district: District }) {
  useDocumentTitle(`${d.en} · The Archive`);
  const paths = useTrainerPaths();
  const { language, setLanguage } = useQuestionLanguage({ allowBoth: false });
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("card");

  const titles = useTitles();
  const reads = useQuery({
    queryKey: qk.quiztopiaWikiReads(),
    queryFn: wikiReadsQuery(),
    staleTime: 60_000,
  });
  const readSet = useMemo(
    () => new Set((reads.data?.reads ?? []).map((r) => r.setId)),
    [reads.data],
  );

  const rows = useMemo(() => {
    const idx = language === "de" ? 1 : 0;
    const needle = foldText(filter.trim());
    const list = CARD_IDS.map((cardId, order) => {
      const sid = setId(cardId, d.n);
      const title = titles.data?.[sid]?.[idx] ?? "";
      return { cardId, setId: sid, title, order, read: readSet.has(sid) };
    }).filter((r) => !needle || foldText(`${r.cardId} ${r.title}`).includes(needle));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title) || a.order - b.order);
    else if (sort === "unread") {
      list.sort((a, b) => Number(a.read) - Number(b.read) || a.order - b.order);
    }
    return list;
  }, [titles.data, language, filter, sort, d.n, readSet]);

  const readCount = CARD_IDS.filter((cardId) => readSet.has(setId(cardId, d.n))).length;

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-12">
        <div className="flex flex-col gap-3">
          <span
            className={cn("block h-1 w-full rounded-full", TONE_STRIP[d.tone])}
            aria-hidden="true"
          />
          <Eyebrow tone={d.tone} className="flex items-center gap-1.5">
            <BuildingGlyph name={d.building} lit size={14} />
            {d.label} · {language === "de" ? d.de : d.en}
          </Eyebrow>
          <PageHeader
            size="md"
            title={language === "de" ? d.buildingLabelDe : d.buildingLabel}
            subtitle={`${CARD_IDS.length} articles · ${readCount} read`}
            actions={<LanguageToggle value={language} onChange={setLanguage} allowBoth={false} />}
          />
          <ProgressBar
            value={CARD_IDS.length > 0 ? readCount / CARD_IDS.length : 0}
            tone={d.tone}
            label="Articles read"
            animate={false}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            containerClassName="flex-1"
            aria-label="Filter articles"
            placeholder="Filter by title or card"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Select
            aria-label="Sort articles"
            size="sm"
            block={false}
            chevron
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="card">Card order</option>
            <option value="title">Title</option>
            <option value="unread">Unread first</option>
          </Select>
        </div>

        <QueryBoundary query={titles} loadingLabel="Opening the index…">
          {() => (
            <ol className="flex flex-col gap-1.5" aria-label={`${d.en} articles`}>
              {rows.map((r) => (
                <li key={r.setId}>
                  <InteractiveCard
                    as={Link}
                    to={paths.wikiArticle(d.slug, r.cardId)}
                    padding="none"
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <MicroLabel className="w-9 shrink-0 tabular-nums">{r.cardId}</MicroLabel>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg-primary group-hover:text-fg-strong">
                      {r.title}
                    </span>
                    {r.read ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-emerald-300">
                        <CheckIcon className="h-3.5 w-3.5" />
                        <span className="sr-only">Read</span>
                      </span>
                    ) : (
                      <span
                        className="block h-1.5 w-1.5 shrink-0 rounded-full border border-line-strong"
                        title="Unread"
                      />
                    )}
                  </InteractiveCard>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="py-6 text-center text-sm text-fg-muted">
                  No article matches “{filter.trim()}”.
                </li>
              )}
            </ol>
          )}
        </QueryBoundary>
      </PageMain>
    </TrainerScreen>
  );
}
