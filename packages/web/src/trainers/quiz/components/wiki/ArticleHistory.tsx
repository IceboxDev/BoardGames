import type { QuizLang } from "@boardgames/core/protocol";
import type { QuizDeskFact } from "@boardgames/core/protocol/http/quiz-desk";
import type { Article, Wording } from "@boardgames/core/quiz/content-types";
import type { HistoryKind } from "@boardgames/core/quiz/history-schema";
import { sourceById } from "@boardgames/core/quiz/sources";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { deskKeys, httpQuizDeskApi } from "../../../../components/admin/quiz-desk/api";
import { GradeBadge } from "../../../../components/admin/quiz-desk/GradeBadge";
import { ChevronRightIcon } from "../../../../components/icons";
import { Badge, Button, MicroLabel, QueryBoundary } from "../../../../components/ui";
import { sourceDomain } from "../../../../games/quiztopia/logic/copy";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { articleHistoryQuery } from "../../api";
import { useQuizIndex } from "../../hooks/useContent";
import { archiveHref, archiveLabel } from "../../logic/archive-links";
import {
  compactDiff,
  formatValue,
  groupHistory,
  type HistoryEntry,
  type HistoryGroup,
  KIND_TONE,
  textKey,
  textsAfter,
} from "../../logic/history";
import { fieldIn, inLang, say } from "../../logic/text";
import { useTrainerPaths } from "../../paths";
import { TextLink } from "../common/TextLink";

// The article's record, for a reader who wonders why a question reads the
// way it does: what each card printed ("On the card: …"), the questions
// taken out of play, and — on demand, from the server, since the history
// files never ship in the bundle — every change to the article and its
// questions with its date, kind, reason, evidence and the words it changed.

type Copy = { en: string; de: string; ru: string };

const KIND_LABEL: Record<HistoryKind, Copy> = {
  printed: { en: "Printed", de: "Gedruckt", ru: "Напечатано" },
  imported: { en: "Imported", de: "Importiert", ru: "Импорт" },
  created: { en: "Created", de: "Erstellt", ru: "Создано" },
  reworded: { en: "Reworded", de: "Umformuliert", ru: "Переформулировано" },
  errata: { en: "Errata", de: "Erratum", ru: "Опечатка карты" },
  corrected: { en: "Corrected", de: "Korrigiert", ru: "Исправлено" },
  translated: { en: "Translated", de: "Übersetzt", ru: "Переведено" },
  marked: { en: "Marked", de: "Markiert", ru: "Отмечено" },
  illustrated: { en: "Illustrated", de: "Bebildert", ru: "Иллюстрации" },
  recategorised: { en: "Recategorised", de: "Neu eingeordnet", ru: "Перенесено в другой раздел" },
  split: { en: "Split", de: "Geteilt", ru: "Разделено" },
  merged: { en: "Merged", de: "Zusammengeführt", ru: "Объединено" },
  moved: { en: "Moved", de: "Verschoben", ru: "Перемещено" },
  retired: { en: "Retired", de: "Ausgemustert", ru: "Снято" },
  restored: { en: "Restored", de: "Wiederhergestellt", ru: "Восстановлено" },
  edited: { en: "Edited", de: "Bearbeitet", ru: "Отредактировано" },
  flagged: { en: "Flagged", de: "Markiert zur Prüfung", ru: "На проверке" },
  checkpoint: { en: "Checkpoint", de: "Stand", ru: "Контрольная точка" },
};

const FIELD_BASE: Record<string, Copy> = {
  title: { en: "Title", de: "Titel", ru: "Заголовок" },
  body: { en: "Text", de: "Text", ru: "Текст" },
  notes: { en: "Editor's note", de: "Anmerkung", ru: "Примечание" },
  answer: { en: "Answer", de: "Antwort", ru: "Ответ" },
  question: { en: "Question", de: "Frage", ru: "Вопрос" },
  spans: { en: "Answer marks", de: "Antwortmarken", ru: "Отметки ответа" },
  timeline: { en: "Date", de: "Datum", ru: "Дата" },
  source: { en: "Source", de: "Quelle", ru: "Источник" },
  images: { en: "Images", de: "Bilder", ru: "Изображения" },
  retired: { en: "Retirement", de: "Ausmusterung", ru: "Снятие" },
  printed: { en: "Printed on", de: "Gedruckt auf", ru: "Напечатано на" },
  cardText: { en: "Card text", de: "Kartentext", ru: "Текст карты" },
  origin: { en: "Origin", de: "Herkunft", ru: "Происхождение" },
  domain: { en: "Domain", de: "Bereich", ru: "Раздел" },
  sub: { en: "Topic", de: "Thema", ru: "Тема" },
};

/** "bodyEn" → "Text (EN)", "de" → "Question (DE)", "spans" → "Answer marks". */
function fieldLabel(field: string, lang: QuizLang): string {
  const suffixed = /^(title|body|notes|answer)(En|De|Ru)$/.exec(field);
  if (suffixed) return `${say(lang, FIELD_BASE[suffixed[1]])} (${suffixed[2].toUpperCase()})`;
  if (field === "en" || field === "de" || field === "ru") {
    return `${say(lang, FIELD_BASE.question)} (${field.toUpperCase()})`;
  }
  const base = FIELD_BASE[field];
  return base ? say(lang, base) : field;
}

const LOCALES: Record<QuizLang, string> = { en: "en-GB", de: "de-DE", ru: "ru-RU" };

function formatDay(at: string, lang: QuizLang): string {
  const d = new Date(`${at}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleDateString(LOCALES[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── On the card ──────────────────────────────────────────────────────────

/** "On the card: …" under a question whose printed wording was reworked. */
export function CardTextHint({ wordings, lang }: { wordings: readonly Wording[]; lang: QuizLang }) {
  const reworked = wordings.filter((w) => w.printed && w.cardText);
  if (reworked.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {reworked.map((w) => {
        const game = w.printed ? (sourceById(w.printed.source)?.title ?? w.printed.source) : "";
        return (
          <li key={w.id} className="text-xs text-fg-muted">
            <span className="font-medium text-fg-secondary">
              {say(lang, { en: "On the card", de: "Auf der Karte", ru: "На карте" })}
              {reworked.length > 1 && ` (${game})`}:
            </span>{" "}
            <q>{w.cardText}</q>
          </li>
        );
      })}
    </ul>
  );
}

// ── Retired questions ────────────────────────────────────────────────────

/** A collapsed list of the article's retired facts: why, when, and what replaced them. */
export function RetiredQuestions({ article, lang }: { article: Article; lang: QuizLang }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const paths = useTrainerPaths();
  const index = useQuizIndex();
  const retired = article.retired ?? [];
  if (retired.length === 0) return null;
  const factNumber = new Map(article.facts.map((f, q) => [f.id, q]));
  return (
    <section className="flex flex-col gap-2">
      <Button
        size="xs"
        variant="ghost"
        align="start"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="self-start"
      >
        <ChevronRightIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        {say(lang, {
          en: "Retired questions",
          de: "Ausgemusterte Fragen",
          ru: "Снятые вопросы",
        })}{" "}
        ({retired.length})
      </Button>
      {open && (
        <ul id={listId} className="flex flex-col divide-y divide-line-soft">
          {retired.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 py-2">
              <p className="text-sm text-fg-secondary line-through decoration-fg-muted/60">
                {inLang(lang, f.wordings[0])}
              </p>
              <p className="text-xs text-fg-muted">
                {inLang(lang, { en: f.answerEn, de: f.answerDe, ru: f.answerRu })}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge tone="rose" size="xs">
                  {say(lang, KIND_LABEL.retired)} · {formatDay(f.retired.at, lang)}
                </Badge>
                {(f.retired.replacedBy ?? []).map((id) => {
                  const q = factNumber.get(id);
                  const home = q !== undefined ? article.id : index.data?.articleOf(id)?.id;
                  if (!home) return null;
                  return (
                    <TextLink key={id} to={paths.wikiArticle(home, id)}>
                      {say(lang, { en: "Now asked as", de: "Jetzt gefragt als", ru: "Теперь" })}{" "}
                      {q !== undefined ? `Q${q + 1}` : id} →
                    </TextLink>
                  );
                })}
              </div>
              <ClampedText text={f.retired.reason} lang={lang} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── History ──────────────────────────────────────────────────────────────

const CLAMP_AT = 180;

function ClampedText({ text, lang }: { text: string; lang: QuizLang }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > CLAMP_AT;
  return (
    <div className="text-xs leading-snug text-fg-secondary">
      <p className={cn(long && !expanded && "line-clamp-2")} lang="en">
        {text}
      </p>
      {long && (
        <Button
          size="xs"
          variant="link"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded
            ? say(lang, { en: "Less", de: "Weniger", ru: "Свернуть" })
            : say(lang, { en: "More", de: "Mehr", ru: "Ещё" })}
        </Button>
      )}
    </div>
  );
}

function DiffView({
  ops,
  after,
}: {
  ops: NonNullable<HistoryEntry["changes"]>[number]["diff"];
  after: string | undefined;
}) {
  if (!ops) return null;
  const pieces = compactDiff(ops, after);
  return (
    <span className="whitespace-pre-wrap break-words">
      {pieces.map((p, i) => {
        const key = `${i}-${p.type}`;
        if (p.type === "gap") {
          return (
            <span key={key} className="text-fg-disabled" aria-hidden="true">
              {" … "}
            </span>
          );
        }
        if (p.type === "del") {
          return (
            <del key={key} className="rounded-ui-md bg-rose-500/15 text-rose-300">
              {p.text}
            </del>
          );
        }
        if (p.type === "ins") {
          return (
            <ins
              key={key}
              className="rounded-ui-md bg-emerald-500/15 text-emerald-300 no-underline"
            >
              {p.text}
            </ins>
          );
        }
        return (
          <span key={key} className="text-fg-muted">
            {p.text}
          </span>
        );
      })}
    </span>
  );
}

function ChangeLine({
  change,
  after,
  lang,
}: {
  change: NonNullable<HistoryEntry["changes"]>[number];
  after: string | undefined;
  lang: QuizLang;
}) {
  const label = fieldLabel(change.field, lang);
  const oldValue = formatValue(change.field, change.old);
  const newValue = formatValue(change.field, change.new);
  return (
    <li className="text-xs leading-snug">
      <span className="font-medium text-fg-secondary">{label}</span>
      {change.diff ? (
        <>
          {": "}
          <DiffView ops={change.diff} after={after} />
        </>
      ) : (
        (oldValue !== null || newValue !== null) && (
          <>
            {": "}
            {oldValue !== null && (
              <del className="text-fg-muted decoration-fg-muted/60">{oldValue}</del>
            )}
            {oldValue !== null && newValue !== null && (
              <span className="text-fg-disabled">
                <span aria-hidden="true">{" → "}</span>
                <span className="sr-only"> changed to </span>
              </span>
            )}
            {newValue !== null && <span className="text-fg-primary">{newValue}</span>}
          </>
        )
      )}
    </li>
  );
}

function EntryRow({
  entry,
  texts,
  lang,
}: {
  entry: HistoryEntry;
  texts: ReadonlyMap<string, string>;
  lang: QuizLang;
}) {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-line pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <MicroLabel className="tabular-nums">{formatDay(entry.at, lang)}</MicroLabel>
        <Badge tone={KIND_TONE[entry.kind]} size="xs">
          {say(lang, KIND_LABEL[entry.kind])}
        </Badge>
        {entry.target.type === "wording" && (
          <MicroLabel>
            {say(lang, { en: "wording", de: "Formulierung", ru: "формулировка" })}
          </MicroLabel>
        )}
        <MicroLabel className="ml-auto truncate">{entry.by}</MicroLabel>
      </div>
      <ClampedText text={entry.reason} lang={lang} />
      {entry.changes && entry.changes.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {entry.changes.map((c) => (
            <ChangeLine
              key={c.field}
              change={c}
              after={texts.get(textKey(entry.seq, c.field))}
              lang={lang}
            />
          ))}
        </ul>
      )}
      {entry.sources && entry.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {entry.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="text-xs text-accent-300 transition-colors hover:text-accent-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60"
            >
              {s.title ?? sourceDomain(s.url)}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      )}
      <EntryMeta entry={entry} />
    </li>
  );
}

const LINK_CLASS =
  "text-3xs text-accent-300 transition-colors hover:text-accent-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60";

/** Where the entry's context lives (`ref`), who made it, its run and confidence — when recorded. */
export function EntryMeta({ entry }: { entry: HistoryEntry }) {
  const { ref, actor, run, confidence } = entry;
  if (!ref && !actor && !run && !confidence) return null;
  const href = ref ? archiveHref(ref) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {ref &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={ref}
            className={LINK_CLASS}
          >
            {/^https?:/.test(ref) ? sourceDomain(ref) : archiveLabel(ref)}
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <MicroLabel title={ref}>{ref}</MicroLabel>
        ))}
      {actor && (
        <MicroLabel title={actor.model ? `${actor.kind} · ${actor.model}` : actor.kind}>
          {actor.kind}: {actor.name}
          {actor.model ? ` (${actor.model})` : ""}
        </MicroLabel>
      )}
      {run && <MicroLabel>run {run}</MicroLabel>}
      {confidence && <MicroLabel>confidence {confidence}</MicroLabel>}
    </div>
  );
}

function DeskFactFor({
  factId,
  desk,
}: {
  factId: string | undefined;
  desk: ReadonlyMap<string, QuizDeskFact> | undefined;
}) {
  const fact = factId ? desk?.get(factId) : undefined;
  return fact ? <DeskFactStrip fact={fact} /> : null;
}

/** Admins only: a fact's research grade and its printed cards' photos. */
function DeskFactStrip({ fact }: { fact: QuizDeskFact }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <GradeBadge grade={fact.grade} />
      {fact.printedOn.map((p) => (
        <a
          key={`${p.source}-${p.card}-${p.wordingId}`}
          href={p.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          title={`${sourceById(p.source)?.title ?? p.source} ${p.card}${p.manifest?.rotate ? ` · turn ${p.manifest.rotate}° clockwise` : ""}`}
        >
          Card photo {p.card}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

function groupTitle(group: HistoryGroup, article: Article, lang: QuizLang): string {
  if (group.kind === "article") {
    return `${say(lang, { en: "The article", de: "Der Artikel", ru: "Статья" })} · ${fieldIn(article, "title", lang)}`;
  }
  if (group.kind === "fact" && group.index !== undefined) {
    const fact = article.facts[group.index];
    return `Q${group.index + 1} · ${fact ? inLang(lang, fact.wordings[0]) : ""}`;
  }
  if (group.kind === "retired") {
    const fact = article.retired?.find((f) => f.id === group.factId);
    const label = say(lang, { en: "Retired", de: "Ausgemustert", ru: "Снят" });
    return `${label} · ${fact ? inLang(lang, fact.wordings[0]) : group.factId}`;
  }
  return say(lang, { en: "Elsewhere", de: "Anderes", ru: "Прочее" });
}

function HistoryBody({
  article,
  entries,
  lang,
  desk,
}: {
  article: Article;
  entries: readonly HistoryEntry[];
  lang: QuizLang;
  /** Admins: the desk's facts by id (grade, card photos). */
  desk?: ReadonlyMap<string, QuizDeskFact>;
}) {
  const groups = useMemo(() => groupHistory(entries, article), [entries, article]);
  const texts = useMemo(() => textsAfter(entries, article), [entries, article]);
  if (groups.length === 0) {
    return (
      <p className="text-xs text-fg-muted">
        {say(lang, {
          en: "No changes recorded yet.",
          de: "Noch keine Änderungen verzeichnet.",
          ru: "Изменений пока нет.",
        })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section
          key={g.key}
          aria-label={groupTitle(g, article, lang)}
          className="flex flex-col gap-2"
        >
          <h3 className="truncate text-xs font-semibold text-fg-strong">
            {groupTitle(g, article, lang)}
          </h3>
          <DeskFactFor factId={g.factId} desk={desk} />
          <ol className="flex flex-col gap-3">
            {g.entries.map((e) => (
              <EntryRow key={e.seq} entry={e} texts={texts} lang={lang} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The "History" control: loads the article's changelog the first time it opens. */
export function ArticleHistory({ article, lang }: { article: Article; lang: QuizLang }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const query = useQuery({
    queryKey: qk.quizArticleHistory(article.id),
    queryFn: articleHistoryQuery(article.id),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Admins also get each fact's grade and card photos, from the Quiz desk —
  // fetched only once the panel opens; a failure just leaves them out.
  const { isAdmin } = useCurrentUser();
  const provenance = useQuery({
    queryKey: deskKeys.provenance(httpQuizDeskApi.id, article.id),
    queryFn: ({ signal }) => httpQuizDeskApi.provenance(article.id, signal),
    enabled: open && isAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const desk = useMemo(
    () => (provenance.data ? new Map(provenance.data.facts.map((f) => [f.id, f])) : undefined),
    [provenance.data],
  );
  return (
    <section className="flex flex-col gap-2">
      <Button
        size="xs"
        variant="ghost"
        align="start"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="self-start"
      >
        <ChevronRightIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        {say(lang, { en: "History", de: "Verlauf", ru: "История" })}
      </Button>
      {open && (
        <div id={panelId}>
          <QueryBoundary
            query={query}
            loading={
              <MicroLabel>
                {say(lang, {
                  en: "Loading the history…",
                  de: "Lade den Verlauf…",
                  ru: "Загрузка…",
                })}
              </MicroLabel>
            }
            errorLabel="The history could not be loaded."
          >
            {(data) => (
              <HistoryBody article={article} entries={data.entries} lang={lang} desk={desk} />
            )}
          </QueryBoundary>
        </div>
      )}
    </section>
  );
}
