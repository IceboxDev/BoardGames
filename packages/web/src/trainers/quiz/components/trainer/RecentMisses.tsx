import type { QuizLanguages, RecentMisses as RecentMissesData } from "@boardgames/core/protocol";
import { useNavigate } from "react-router-dom";
import { Badge, Chip, EmptyState, Surface } from "../../../../components/ui";
import { findFact } from "../../content";
import { domainOf } from "../../domains";
import { useArticle } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import { inLangs } from "../../logic/text";
import { relativeDays } from "../../logic/time";
import type { TrainerPaths } from "../../paths";
import { TextLink } from "../common/TextLink";

// Questions the table got wrong in recent co-op games, posted by the
// game-over screen as `source: "game"` reviews. One "Practice" chip turns
// the whole list into an `?ids=` session; each row links to its article.

type Miss = RecentMissesData["misses"][number];

type Props = {
  misses: readonly Miss[];
  language: QuizLanguages;
  paths: TrainerPaths;
  /** Rows shown before the list is cut (the chip still practises all). */
  max?: number;
  className?: string;
};

function MissRow({
  miss,
  language,
  paths,
}: {
  miss: Miss;
  language: QuizLanguages;
  paths: TrainerPaths;
}) {
  const d = domainOf(miss.domain);
  const { settings } = useQuizSettings();
  const article = useArticle(miss.articleId);
  const found = article.data ? findFact(article.data, miss.questionId) : null;
  const question = found ? questionOf(found.fact, settings.sources) : null;
  const texts = question ? inLangs(language, question) : [];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Badge tone={d.tone} size="sm" title={d.en} className="mt-0.5">
        {d.label}
      </Badge>
      <div className="min-w-0 flex-1">
        {texts.length > 0 ? (
          <p className="text-sm text-fg-primary">{texts[0]}</p>
        ) : (
          <p className="text-sm text-fg-muted">{article.isError ? "Question unavailable" : "…"}</p>
        )}
        {texts[1] && <p className="text-xs text-fg-muted">{texts[1]}</p>}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-fg-muted">
          <span>Table game · {relativeDays(miss.reviewedAt)}</span>
          {miss.missCount > 1 && <span className="tabular-nums">missed ×{miss.missCount}</span>}
          <TextLink to={paths.wikiArticle(miss.articleId, miss.questionId)} tone="muted">
            Wiki →
          </TextLink>
        </p>
      </div>
    </li>
  );
}

export function RecentMisses({ misses, language, paths, max = 8, className }: Props) {
  const navigate = useNavigate();
  const ids = misses.map((m) => m.questionId);
  const shown = misses.slice(0, max);
  return (
    <Surface variant="raised" padding="lg" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg-strong">Recent game misses</h2>
          <p className="text-2xs text-fg-muted">What the table got wrong in the last 60 days</p>
        </div>
        {ids.length > 0 && (
          <Chip
            pressed={false}
            tone="amber"
            size="sm"
            onClick={() => navigate(paths.study({ ids }))}
            title="Study every missed question in one session"
          >
            Practice {ids.length}
          </Chip>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          className="mt-3"
          title="No table-game misses yet"
          description="Questions the table gets wrong in a co-op game land here, ready to practise in one go."
        />
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {shown.map((m) => (
            <MissRow key={m.questionId} miss={m} language={language} paths={paths} />
          ))}
        </ul>
      )}
      {misses.length > shown.length && (
        <p className="mt-2 text-2xs text-fg-muted">
          {misses.length - shown.length} more — the chip practises them all.
        </p>
      )}
    </Surface>
  );
}
