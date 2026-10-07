import { parseSetId } from "@boardgames/core/games/quiztopia/ids";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  InteractiveCard,
  MicroLabel,
  PageHeader,
  PageMain,
  ProgressBar,
  SearchInput,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { qk } from "../../../../lib/query-keys";
import { todayKey, wikiReadsQuery } from "../../api";
import { DISTRICTS, districtByN } from "../../bands";
import { CARD_IDS, CONTENT_INDEX } from "../../content";
import { useJournal } from "../../hooks/useJournal";
import { articleLanguage } from "../../hooks/useQuestionLanguage";
import { useQuiztopiaSettings } from "../../hooks/useQuiztopiaSettings";
import { dayLabel } from "../../logic/time";
import { useTrainerPaths } from "../../paths";
import { CategoryTile } from "../trainer/CategoryTile";
import { TrainerScreen } from "../trainer/TrainerScreen";

// The archive's front page: search, your journal's latest day (the way back
// to what you studied or read recently), and the twelve districts with how
// much of each has been read. A district lights up when every one of its
// articles has been read.

export default function WikiIndex() {
  useDocumentTitle("The Archive · Quiztopia");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { settings } = useQuiztopiaSettings();
  const lang = articleLanguage(settings.language);
  const [q, setQ] = useState("");

  const reads = useQuery({
    queryKey: qk.quiztopiaWikiReads(),
    queryFn: wikiReadsQuery(),
    staleTime: 60_000,
  });
  const readByCategory = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of reads.data?.reads ?? []) {
      const parsed = parseSetId(r.setId);
      if (parsed) counts.set(parsed.n, (counts.get(parsed.n) ?? 0) + 1);
    }
    return counts;
  }, [reads.data]);
  const perDistrict = CARD_IDS.length;
  const totalRead = reads.data?.reads.length ?? 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length >= 2) navigate(paths.search(trimmed));
  };

  return (
    <TrainerScreen>
      <PageMain width="6xl" className="flex flex-col gap-6 pb-12">
        <PageHeader
          size="lg"
          eyebrow="Wiki"
          title="The Archive"
          subtitle={`${CONTENT_INDEX.counts.sets.toLocaleString()} articles across ${DISTRICTS.length} districts — every answer highlighted where the text gives it away.`}
          actions={
            <Button variant="link" onClick={() => navigate(paths.hub)}>
              ← Trainer
            </Button>
          }
        />

        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            containerClassName="flex-1"
            aria-label="Search the archive"
            placeholder="Search questions, answers and titles — Enter to search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={q.trim().length < 2}>
            Search
          </Button>
        </form>

        <JournalTeaser lang={lang} />

        <section aria-label="Districts" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg-strong">Districts</h2>
            <MicroLabel className="tabular-nums">
              {totalRead} of {CONTENT_INDEX.counts.sets} read
            </MicroLabel>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {DISTRICTS.map((d) => {
              const read = readByCategory.get(d.n) ?? 0;
              return (
                <CategoryTile
                  key={d.slug}
                  district={d}
                  to={paths.wikiCategory(d.slug)}
                  lit={perDistrict > 0 && read >= perDistrict}
                  cta="Browse"
                >
                  <div className="flex flex-col gap-1.5">
                    <MicroLabel className="tabular-nums">
                      {perDistrict} articles · {read} read
                    </MicroLabel>
                    <ProgressBar
                      value={perDistrict > 0 ? read / perDistrict : 0}
                      tone={d.tone}
                      label={`${d.en}: articles read`}
                      animate={false}
                    />
                  </div>
                </CategoryTile>
              );
            })}
          </div>
        </section>
      </PageMain>
    </TrainerScreen>
  );
}

/** The latest day of the journal, its articles as tiles, and the way in. */
function JournalTeaser({ lang }: { lang: "en" | "de" }) {
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const journal = useJournal();
  const today = useMemo(() => todayKey(), []);
  const latest = journal.days[0];
  return (
    <section aria-label="Your journal" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg-strong">Your journal</h2>
        <Button variant="link" size="sm" onClick={() => navigate(paths.journal)}>
          Open your journal →
        </Button>
      </div>
      {latest ? (
        <>
          <MicroLabel>
            {dayLabel(latest.date, today)} · {latest.sets.length}{" "}
            {latest.sets.length === 1 ? "article" : "articles"}
          </MicroLabel>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {latest.sets.slice(0, 4).map((set) => {
              const d = districtByN(set.category);
              const cardId = parseSetId(set.setId)?.cardId ?? "";
              const missed = set.questions.filter((q) => q.grades.includes("again")).length;
              return (
                <li key={set.setId}>
                  <InteractiveCard
                    as={Link}
                    to={paths.wikiArticle(d.slug, cardId)}
                    padding="sm"
                    className="flex h-full flex-col gap-1"
                  >
                    <Badge tone={d.tone} size="xs" className="self-start">
                      {d.label} · {lang === "de" ? d.de : d.en}
                    </Badge>
                    <p className="line-clamp-2 text-sm font-medium text-fg-strong">
                      {lang === "de" ? set.titleDe : set.titleEn}
                    </p>
                    <p className="mt-auto text-2xs text-fg-muted">
                      {[
                        set.questions.length > 0
                          ? `${set.questions.length} question${set.questions.length === 1 ? "" : "s"}`
                          : null,
                        missed > 0 ? `${missed} missed` : null,
                        set.readAt ? "read" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </InteractiveCard>
                </li>
              );
            })}
          </ul>
          {latest.sets.length > 4 && (
            <p className="text-2xs text-fg-muted">
              …and {latest.sets.length - 4} more — open your journal for the whole day.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-fg-muted">
          {journal.isPending
            ? "Opening your journal…"
            : "Every question you study and article you read is kept here, day by day."}
        </p>
      )}
    </section>
  );
}
