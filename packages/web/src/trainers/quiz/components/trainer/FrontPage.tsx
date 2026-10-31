import type { QuizLang, TrainerOverview } from "@boardgames/core/protocol";
import type { Article } from "@boardgames/core/quiz/content-types";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookIcon } from "../../../../components/icons";
import { LoadingState } from "../../../../components/ui";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import { cn } from "../../../../lib/cn";
import { bodyIn } from "../../content";
import { DOMAINS, domainOf } from "../../domains";
import { articleQuery } from "../../hooks/useContent";
import { fieldIn } from "../../logic/text";
import type { TrainerPaths } from "../../paths";
import { DomainIcon } from "../common/DomainIcon";
import {
  BoxedPanel,
  Byline,
  Columns,
  Ear,
  Folio,
  Headline,
  JumpLine,
  Kicker,
  Masthead,
  PaperButton,
  PaperPhoto,
  SectionHead,
} from "../paper/Paper";
import { editionNumber, KICKER, longDate, RULE_DOUBLE_TOP } from "../paper/paper-style";
import { type TextCut, useFitText } from "../paper/use-fit-text";
import { type ArticleBlock, segmentArticle } from "../wiki/article-segments";
import type { ArticleToRead, StudyAllPlan } from "./session-plan";
import { TrainerNav } from "./TrainerNav";

// The trainer's front page: today's edition as one newspaper page that fills
// the screen from the masthead to the folio on laptops and up. The lead story
// is the day's longest new article, the other new articles run as briefs
// beside it, and the right column holds the Revision Corner (the due cards
// that get shuffled into the Quiz Page) and the index of the 14 sections.
// Below `lg` the same page stacks and scrolls.

/** A laptop-or-wider screen with height to spare (the `roomy` variant in index.css). */
const ROOMY_QUERY = "(min-width: 64rem) and (min-height: 52rem)";
const WORDS_PER_MINUTE = 220;

type Props = {
  overview: TrainerOverview;
  plan: StudyAllPlan;
  /** The day's new articles in reading order (empty when none are dealt). */
  reading: readonly ArticleToRead[];
  /** Facts the queue deals per article today. */
  questionsOf: (articleId: string) => number;
  doneToday: number;
  today: string;
  lang: QuizLang;
  paths: TrainerPaths;
  reportsUnread: number;
  onStart: () => void;
  /** Another batch of 15 new facts (offered once today's set is done). */
  onMore: () => void;
  onReadArchive: () => void;
  onOpenSettings: () => void;
};

export function FrontPage({
  overview,
  plan,
  reading,
  questionsOf,
  doneToday,
  today,
  lang,
  paths,
  reportsUnread,
  onStart,
  onMore,
  onReadArchive,
  onOpenSettings,
}: Props) {
  const more = overview.moreAvailable ? onMore : null;
  const loaded = useQueries({
    queries: reading.map((r) => ({ ...articleQuery(r.articleId), staleTime: Infinity })),
  });
  const articles = loaded.map((q) => q.data).filter((a): a is Article => !!a);
  const ready = articles.length === reading.length;
  // The lead is the longest article; the briefs keep reading order.
  const lead = ready
    ? articles.reduce<Article | null>(
        (best, a) => (best && words(best, lang) >= words(a, lang) ? best : a),
        null,
      )
    : null;
  const pageOf = (id: string) => `A${reading.findIndex((r) => r.articleId === id) + 2}`;
  const quizPage = `A${reading.length + 2}`;
  const briefs = ready ? articles.filter((a) => a !== lead) : [];
  const minutes = articles.reduce((m, a) => m + minutesOf(a, lang), 0);

  return (
    <div className="flex flex-col px-4 pt-3 md:px-6 lg:h-full lg:min-h-160 xl:px-10">
      <Masthead
        className="shrink-0"
        edition={`Vol. ${roman(Number(today.slice(0, 4)) - 2025)} · No. ${editionNumber(today)}`}
        dateLine={longDate(today)}
        pageLabel="Front page"
        homeTo={paths.hub}
        leftEar={
          <Ear
            title="Today's edition"
            line={
              reading.length > 0
                ? `${reading.length} ${reading.length === 1 ? "article" : "articles"} · ${plan.newFacts} questions`
                : "No new articles"
            }
            note={reading.length > 0 ? `about ${Math.max(1, minutes)} minutes of reading` : null}
          />
        }
        rightEar={
          <Ear
            title="Revision"
            tone="sky"
            align="right"
            line={`${plan.due} ${plan.due === 1 ? "card" : "cards"} due`}
            note="shuffled into the Quiz Page"
          />
        }
        nav={
          <TrainerNav
            paths={paths}
            current="front"
            reportsUnread={reportsUnread}
            onOpenSettings={onOpenSettings}
          />
        }
      />

      <main
        className={cn(
          "grid gap-6 py-4 lg:min-h-0 lg:flex-1 lg:gap-0",
          briefs.length > 0
            ? "lg:grid-cols-[minmax(0,6.6fr)_minmax(0,3fr)_minmax(0,2.4fr)]"
            : "lg:grid-cols-[minmax(0,9fr)_minmax(0,2.6fr)]",
        )}
      >
        <div className="flex min-h-0 flex-col lg:border-r lg:border-line-strong lg:pr-6">
          {plan.total === 0 ? (
            <CaughtUp onReadArchive={onReadArchive} onMore={more} excluded={plan.excluded} />
          ) : reading.length === 0 ? (
            <RevisionLead
              plan={plan}
              onStart={onStart}
              moreLater={more !== null}
              quizPage={quizPage}
            />
          ) : !lead ? (
            <LoadingState label="Setting today's pages…" />
          ) : (
            <LeadStory
              article={lead}
              lang={lang}
              questions={questionsOf(lead.id)}
              page={pageOf(lead.id)}
              quizPage={quizPage}
              onStart={onStart}
            />
          )}
        </div>

        {briefs.length > 0 && (
          <div className="flex min-h-0 flex-col gap-4 lg:border-r lg:border-line-strong lg:px-5">
            {briefs.map((a) => (
              <Brief
                key={a.id}
                article={a}
                lang={lang}
                page={pageOf(a.id)}
                questions={questionsOf(a.id)}
              />
            ))}
          </div>
        )}

        <aside className="flex min-h-0 flex-col gap-3 lg:pl-5">
          <RevisionCorner overview={overview} plan={plan} />
          <SectionsIndex overview={overview} paths={paths} />
        </aside>
      </main>

      <Folio
        page="A1"
        right={
          <span className="tabular-nums">
            {doneToday} of {doneToday + plan.total} done
          </span>
        }
      />
    </div>
  );
}

// ── The lead story ──────────────────────────────────────────────────────────

function LeadStory({
  article,
  lang,
  questions,
  page,
  quizPage,
  onStart,
}: {
  article: Article;
  lang: QuizLang;
  questions: number;
  /** The lead's own page among the day's reading pages. */
  page: string;
  quizPage: string;
  onStart: () => void;
}) {
  const { standfirst, blocks } = splitStandfirst(article, lang);
  // The photo gets its own column only where the page has height to spare;
  // on a short laptop screen the text keeps both columns.
  const roomy = useMediaQuery(ROOMY_QUERY);
  const photo = roomy ? (article.images[0] ?? null) : null;
  const paras = paragraphsOf(blocks);
  const fit = useFitText<HTMLDivElement>(16, 22, `${article.id}:${lang}:${photo ? 1 : 2}`);
  return (
    <article className="flex min-h-0 flex-1 flex-col gap-2.5">
      <Kicker domain={article.domain} />
      <Headline as="h1" size="xl" className="text-balance lg:text-4xl roomy:lg:text-5xl">
        {fieldIn(article, "title", lang)}
      </Headline>
      {standfirst && (
        <p className="line-clamp-2 font-news text-lg leading-snug italic text-fg-secondary">
          {standfirst}
        </p>
      )}
      <Byline right={`${minutesOf(article, lang)} min read · ${questions} questions`} />
      <div className="flex min-h-0 flex-1 gap-6 max-lg:h-80 max-lg:flex-none">
        {photo && <PaperPhoto image={photo} lang={lang} className="h-full w-2/5 shrink-0" fill />}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Columns
            ref={fit.ref}
            count={photo ? 1 : 2}
            className="h-full cols-fill-auto text-justify hyphens-auto [&_p]:mb-[0.6em]"
          >
            <CutText paras={paras} cut={fit.cut} jump={`Continued on page ${page}`} dropCap />
          </Columns>
        </div>
      </div>
      <StartRow
        primary="Begin reading"
        jump={`Reading starts on page A2 · the Quiz Page follows on ${quizPage}`}
        onStart={onStart}
      />
    </article>
  );
}

/** No new articles today, but cards are due: the Quiz Page is the story. */
function RevisionLead({
  plan,
  quizPage,
  onStart,
  moreLater,
}: {
  plan: StudyAllPlan;
  quizPage: string;
  onStart: () => void;
  /** Today's set is read: another can be printed once these cards are done. */
  moreLater: boolean;
}) {
  return (
    <article className="flex min-h-0 flex-1 flex-col gap-3">
      <span className={cn(KICKER, "text-sky-300")}>Revision day</span>
      <Headline as="h1" size="xl" className="text-balance">
        {plan.due} {plan.due === 1 ? "card" : "cards"} from earlier editions
      </Headline>
      <p className="font-news text-lg italic text-fg-secondary">
        {moreLater
          ? "Today's edition is read. Clear these cards and the presses can run again: three more articles, 15 new questions."
          : `No new pages today: ${plan.summary}. Straight to the Quiz Page.`}
      </p>
      <div className="flex-1" />
      <StartRow primary="Start the Quiz Page" jump={`Turn to page ${quizPage}`} onStart={onStart} />
    </article>
  );
}

function CaughtUp({
  onReadArchive,
  onMore,
  excluded,
}: {
  onReadArchive: () => void;
  onMore: (() => void) | null;
  excluded: number;
}) {
  return (
    <article className="flex min-h-0 flex-1 flex-col gap-3">
      <span className={cn(KICKER, "text-emerald-300")}>
        {onMore ? "Stop the presses" : "All caught up"}
      </span>
      <Headline as="h1" size="xl">
        {onMore ? "Today's edition is done" : "Nothing more in today's edition"}
      </Headline>
      <p className="font-news text-lg italic text-fg-secondary">
        {onMore
          ? "Every article read, every question answered. Tomorrow's edition brings the next set — or print another now: three more articles, 15 new questions, read first and then quizzed like this one."
          : excluded > 0
            ? "Nothing is due and the sections you read have no new articles left. Bring a section back in settings, or study one from its archive page."
            : "Nothing is due and today's new articles are read. Tomorrow's edition brings the next ones."}
      </p>
      <div className="flex-1" />
      <div className={cn(RULE_DOUBLE_TOP, "flex items-center gap-3 pt-2.5")}>
        {onMore && (
          <PaperButton primary size="lg" className="min-w-48" onClick={onMore}>
            Print another edition
          </PaperButton>
        )}
        <PaperButton primary={!onMore} size="lg" onClick={onReadArchive}>
          <BookIcon className="size-4" />
          Read the archive
        </PaperButton>
      </div>
    </article>
  );
}

function StartRow({
  primary,
  jump,
  onStart,
}: {
  primary: string;
  jump: string;
  onStart: () => void;
}) {
  return (
    <div className={cn(RULE_DOUBLE_TOP, "flex shrink-0 flex-wrap items-center gap-3 pt-2.5")}>
      <PaperButton primary size="lg" className="min-w-48" onClick={onStart}>
        {primary}
      </PaperButton>
      <span className="hidden 2xl:inline">
        <JumpLine onClick={onStart}>{jump}</JumpLine>
      </span>
    </div>
  );
}

// ── Briefs ──────────────────────────────────────────────────────────────────

function Brief({
  article,
  lang,
  page,
  questions,
}: {
  article: Article;
  lang: QuizLang;
  page: string;
  questions: number;
}) {
  const { standfirst, blocks } = splitStandfirst(article, lang);
  const paras = paragraphsOf(blocks, standfirst);
  const [dropCap, setDropCap] = useState(true);
  const fit = useFitText<HTMLDivElement>(14, 17, `${article.id}:${lang}:${dropCap}`);
  // A drop cap wants four lines of room; a shallower box sets plain text.
  useEffect(() => setDropCap(fit.lines >= 5), [fit.lines]);
  return (
    <article className="relative flex min-h-0 flex-1 flex-col gap-2 border-b border-line-strong pb-4 last:border-b-0">
      <Kicker domain={article.domain} />
      <Headline size="md">{fieldIn(article, "title", lang)}</Headline>
      <span className={cn(KICKER, "text-fg-muted")}>
        Page {page} · {minutesOf(article, lang)} min · {questions} questions
      </span>
      <div className="min-h-0 flex-1 overflow-hidden max-lg:h-40 max-lg:flex-none">
        <Columns ref={fit.ref} count={1} className="h-full hyphens-auto [&_p]:mb-[0.5em]">
          <CutText
            paras={paras}
            cut={fit.cut}
            jump={`Continued on page ${page}`}
            dropCap={dropCap}
          />
        </Columns>
      </div>
    </article>
  );
}

// ── Right column ────────────────────────────────────────────────────────────

function RevisionCorner({ overview, plan }: { overview: TrainerOverview; plan: StudyAllPlan }) {
  const included = new Set(plan.included);
  const from = overview.domains.filter((d) => d.due > 0 && included.has(d.domain));
  return (
    <BoxedPanel tone="sky" className="flex shrink-0 flex-col gap-1.5 px-4 py-3">
      <span className={cn(KICKER, "text-sky-300")}>The Revision Corner</span>
      <p className="flex items-baseline gap-3">
        <span className="font-headline text-5xl leading-none font-black tabular-nums text-fg-strong">
          {plan.due}
        </span>
        <span className="font-news text-sm leading-snug text-fg-secondary">
          {plan.due === 0
            ? "nothing due from earlier editions"
            : `${plan.due === 1 ? "card" : "cards"} from earlier editions, shuffled into today's Quiz Page`}
        </span>
      </p>
      {from.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Sections with cards due">
          {from.map((d) => (
            <li key={d.domain} title={`${domainOf(d.domain).en}: ${d.due} due`}>
              <DomainIcon domain={d.domain} size={24} />
            </li>
          ))}
        </ul>
      )}
    </BoxedPanel>
  );
}

function SectionsIndex({ overview, paths }: { overview: TrainerOverview; paths: TrainerPaths }) {
  const byDomain = new Map(overview.domains.map((d) => [d.domain, d]));
  return (
    <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col">
      <SectionHead right="Learnt">Sections</SectionHead>
      <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {DOMAINS.map((d) => {
          const c = byDomain.get(d.slug);
          const pct = c && c.total > 0 ? Math.round((c.known / c.total) * 100) : 0;
          return (
            <li
              key={d.slug}
              className="flex min-h-8 flex-1 border-b border-dotted border-line-strong lg:min-h-0"
            >
              <Link
                to={paths.wikiDomain(d.slug)}
                className="flex h-full w-full min-w-0 items-center gap-2.5 py-0.5 font-news text-xs text-fg-primary xl:text-sm hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-accent-400"
              >
                <span className="relative aspect-square h-full max-h-9 min-h-4 shrink-0">
                  <DomainIcon domain={d.slug} size={40} className="absolute inset-0 size-full" />
                </span>
                <span className="min-w-0 flex-1 truncate">{d.en}</span>
                <span className="tabular-nums text-fg-muted">{pct}%</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Text ────────────────────────────────────────────────────────────────────

interface Para {
  key: string;
  text: string;
}

/** The article's body as plain paragraphs: no answer marks on the front page. */
function paragraphsOf(blocks: readonly ArticleBlock[], lead?: string | null): Para[] {
  const out: Para[] = lead ? [{ key: "lead", text: lead }] : [];
  for (const b of blocks) {
    if (b.kind === "paragraph") {
      out.push({ key: `p${b.offset}`, text: b.segments.map((s) => s.text).join("") });
    } else if (b.kind === "list") {
      for (const item of b.items) {
        out.push({
          key: `l${item[0]?.offset ?? b.offset}`,
          text: `• ${item.map((s) => s.text).join("")}`,
        });
      }
    }
  }
  return out;
}

/**
 * The story set to its box: whole paragraphs, then the cut one up to its last
 * fitting sentence and the jump line to the page it continues on.
 */
function CutText({
  paras,
  cut,
  jump,
  dropCap,
}: {
  paras: readonly Para[];
  cut: TextCut | null;
  jump: string;
  dropCap?: boolean;
}) {
  if (cut && cut.para === 0 && cut.chars === 0) {
    return <p className={cn(KICKER, "text-accent-300")}>▸ {jump}</p>;
  }
  const shown = cut ? paras.slice(0, cut.para + 1) : paras;
  return (
    <>
      {shown.map((p, i) => {
        const last = cut !== null && i === cut.para;
        return (
          <p key={p.key} data-para={i} className={cn(dropCap && i === 0 && "drop-cap")}>
            {last ? `${p.text.slice(0, cut.chars)}${cut.ellipsis ? "…" : ""}` : p.text}
            {last && (
              <>
                {" "}
                <span className={cn(KICKER, "whitespace-nowrap text-accent-300")}>▸ {jump}</span>
              </>
            )}
          </p>
        );
      })}
    </>
  );
}

/** The first sentence becomes the standfirst; the body runs on from the next. */
function splitStandfirst(
  article: Article,
  lang: QuizLang,
): { standfirst: string | null; blocks: ArticleBlock[] } {
  const { body, spans } = bodyIn(article, lang);
  const blocks = segmentArticle(body, spans);
  const first = blocks[0];
  if (first?.kind !== "paragraph") return { standfirst: null, blocks };
  const text = first.segments.map((s) => s.text).join("");
  const m = /^(.{20,220}?[.!?])\s+(.+)$/s.exec(text);
  if (!m) return { standfirst: null, blocks };
  const rest: ArticleBlock = {
    kind: "paragraph",
    offset: first.offset,
    segments: [{ kind: "text", text: m[2], offset: first.offset }],
  };
  return { standfirst: m[1], blocks: [rest, ...blocks.slice(1)] };
}

function words(article: Article, lang: QuizLang): number {
  return bodyIn(article, lang).body.split(/\s+/).length;
}

function minutesOf(article: Article, lang: QuizLang): number {
  return Math.max(1, Math.round(words(article, lang) / WORDS_PER_MINUTE));
}

function roman(n: number): string {
  const r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return r[Math.max(0, Math.min(r.length - 1, n - 1))];
}
