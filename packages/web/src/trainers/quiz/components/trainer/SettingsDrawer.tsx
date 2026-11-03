import type { QuizLang, QuizSettings } from "@boardgames/core/protocol";
import { QUIZ_SOURCES } from "@boardgames/core/quiz/sources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { XIcon } from "../../../../components/icons";
import { Button, Drawer, ErrorAlert, IconButton, useConfirm } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { resetProgress } from "../../api";
import { invalidateAfterReset } from "../../cache";
import { DOMAINS } from "../../domains";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { quizReviewOutbox } from "../../review-outbox";
import { DomainIcon } from "../common/DomainIcon";
import { SourceMarkIcon } from "../common/SourceLabel";
import { Headline, PaperTabs, SectionHead } from "../paper/Paper";
import { KICKER } from "../paper/paper-style";

// The trainer's preferences as the paper's "Editor's desk", a right-hand
// drawer set in the newspaper's type: languages, the day's 15 (fixed, not a
// setting), which games' questions to study, which sections the day's
// edition draws from, and the two schedule switches. Every change saves on
// its own (one PUT of the whole object, applied to the cache at once and
// sent in order — `useQuizSettings`). "Start over" wipes the server-side
// schedule after a confirm.

type Props = {
  onClose: () => void;
};

const LANGS: readonly { value: QuizLang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
];

export function SettingsDrawer({ onClose }: Props) {
  const { settings, loaded, save, saving, saveError } = useQuizSettings();

  // Reset: wipe schedule, history and reads on the server and drop any
  // reviews still queued offline (they would re-create the progress). Replay
  // is paused across both steps, so no queued review can land in between.
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const reset = useMutation({
    mutationFn: () =>
      quizReviewOutbox.exclusive(async () => {
        const res = await resetProgress({ confirm: true });
        await quizReviewOutbox.clear();
        return res;
      }),
    onSuccess: () => invalidateAfterReset(qc),
  });
  const onReset = async () => {
    const ok = await confirm({
      title: "Reset all quiz progress?",
      description:
        "Every card goes back to new, your streak and study history are cleared, and all articles become unread. Your settings stay. This cannot be undone.",
      confirmLabel: "Reset progress",
    });
    if (ok) reset.mutate();
  };

  const patch = (p: Partial<QuizSettings>) => save(p);
  const errorMessage = errorMessageOf(saveError, "The change was not saved.");
  const { primary, secondary } = settings.language;
  const included = DOMAINS.length - settings.excludeFromAll.length;

  return (
    <Drawer
      side="right"
      onClose={onClose}
      ariaLabel="Trainer settings"
      chrome="bare"
      panelClassName="bg-surface-900 sm:w-xl sm:max-w-xl"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn(KICKER, "text-accent-300")}>The Daily Quiz · the editor's desk</span>
          <Headline as="h2" size="lg">
            Settings
          </Headline>
          <span className="font-news text-xs italic text-fg-muted" role="status">
            {saving ? "Saving…" : loaded ? "Every change is saved to your account" : "Loading…"}
          </span>
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close"
          onClick={onClose}
          icon={<XIcon />}
        />
      </header>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto px-6 pt-1 pb-6">
        {errorMessage && <ErrorAlert message={errorMessage} />}

        <Section
          title="Language"
          note="The main language of cards and articles, and a second one shown under questions and answers. L cycles the main language on any screen."
        >
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
            <span className={cn(KICKER, "text-fg-muted")}>Read in</span>
            <PaperTabs<QuizLang>
              label="Main language"
              value={primary}
              options={LANGS}
              onChange={(p) =>
                patch({ language: { primary: p, secondary: secondary === p ? null : secondary } })
              }
            />
            <span className={cn(KICKER, "text-fg-muted")}>Also show</span>
            <PaperTabs<QuizLang | "none">
              label="Second language"
              value={secondary ?? "none"}
              options={[
                { value: "none", label: "Nothing" },
                ...LANGS.filter((l) => l.value !== primary),
              ]}
              onChange={(v) => patch({ language: { primary, secondary: v === "none" ? null : v } })}
            />
          </div>
        </Section>

        <Section title="New facts">
          <div className="flex items-center gap-4 border-3 border-double border-line-strong px-4 py-3">
            <span className="font-headline text-5xl leading-none font-black tabular-nums text-fg-strong">
              15
            </span>
            <p className="font-news text-sm leading-snug text-fg-secondary">
              new facts a day, in whole articles — 7 + 8, 5 + 5 + 5 or 4 + 5 + 6 — read first, then
              shuffled in with everything due. Once every article is read and every question
              answered, the front page can{" "}
              <span className="text-fg-strong">print another edition</span>. Reviews are never
              capped.
            </p>
          </div>
        </Section>

        <Section
          title="Games"
          right={`${settings.sources.length} of ${QUIZ_SOURCES.length}`}
          note="A question several games ask is studied once, in the wording of the first game ticked."
        >
          <ul className="flex flex-col">
            {QUIZ_SOURCES.map((src) => {
              const on = settings.sources.includes(src.id);
              const last = on && settings.sources.length === 1;
              return (
                <li key={src.id} className="border-b border-dotted border-line-strong">
                  <TickRow
                    on={on}
                    disabled={!loaded || last}
                    title={last ? "At least one game stays on" : undefined}
                    onToggle={() =>
                      save((current) => ({
                        sources: current.sources.includes(src.id)
                          ? current.sources.filter((x) => x !== src.id)
                          : QUIZ_SOURCES.map((x) => x.id).filter(
                              (id) => id === src.id || current.sources.includes(id),
                            ),
                      }))
                    }
                  >
                    <span className="flex items-center gap-2 font-headline text-base font-bold text-fg-strong">
                      <SourceMarkIcon source={src.id} className="size-6" />
                      {src.title}
                    </span>
                  </TickRow>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          title="Today's edition draws from"
          right={`${included} of ${DOMAINS.length} sections`}
          note="Leave a section out of the day's edition — due and new facts alike. Its own page in the archive still studies it."
        >
          <ul className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
            {DOMAINS.map((d) => {
              const on = !settings.excludeFromAll.includes(d.slug);
              return (
                <li key={d.slug} className="border-b border-dotted border-line-strong">
                  <Button
                    variant="ghost"
                    shape="square"
                    align="start"
                    block
                    aria-pressed={on}
                    disabled={!loaded}
                    onClick={() =>
                      // From the latest settings, not this render: taps faster
                      // than a save round trip each build on the one before.
                      save((current) => ({
                        excludeFromAll: current.excludeFromAll.includes(d.slug)
                          ? current.excludeFromAll.filter((x) => x !== d.slug)
                          : [...current.excludeFromAll, d.slug],
                      }))
                    }
                    className={cn("h-auto gap-3 px-1 py-1", !on && "opacity-45 grayscale")}
                  >
                    <DomainIcon domain={d.slug} size={40} className="size-9" />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-left font-news text-sm leading-snug",
                        on ? "text-fg-strong" : "text-fg-muted line-through",
                      )}
                    >
                      {d.en}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Schedule">
          <ul className="flex flex-col">
            <li className="border-b border-dotted border-line-strong">
              <TickRow
                on={settings.gameReviewsAffectSrs}
                disabled={!loaded}
                onToggle={() => patch({ gameReviewsAffectSrs: !settings.gameReviewsAffectSrs })}
              >
                <RowText
                  title="Table-game answers update my schedule"
                  note="A question the table got right counts as “knew it”; a miss as “didn't know”."
                />
              </TickRow>
            </li>
            <li className="border-b border-dotted border-line-strong">
              <TickRow
                on={settings.includeLeeches}
                disabled={!loaded}
                onToggle={() => patch({ includeLeeches: !settings.includeLeeches })}
              >
                <RowText
                  title="Include leeches"
                  note="Cards missed eight times or more stay out of the queue unless this is on."
                />
              </TickRow>
            </li>
          </ul>
        </Section>

        <section
          aria-label="Start over"
          className="flex flex-col gap-2 border-t border-line-strong pt-3"
        >
          <span className={cn(KICKER, "text-rose-300")}>Start over</span>
          <p className="font-news text-sm italic text-fg-muted">
            Every card back to new, streak and history cleared, articles unread. Settings stay.
          </p>
          {reset.isSuccess && (
            <p className="font-news text-sm text-emerald-300" role="status">
              Progress reset — every fact is new again.
            </p>
          )}
          {reset.isError && (
            <ErrorAlert message={errorMessageOf(reset.error, "The reset did not go through.")} />
          )}
          <div>
            <Button
              variant="danger"
              size="sm"
              shape="square"
              onClick={onReset}
              loading={reset.isPending}
              className="font-news text-xs font-semibold uppercase tracking-pill"
            >
              Reset progress
            </Button>
          </div>
        </section>
      </div>
      {confirmDialog}
    </Drawer>
  );
}

/** A settings section: its head between rules, the controls, an italic note. */
function Section({
  title,
  right,
  note,
  children,
}: {
  title: string;
  right?: ReactNode;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <SectionHead right={right}>{title}</SectionHead>
      {children}
      {note && <p className="font-news text-xs italic leading-snug text-fg-muted">{note}</p>}
    </section>
  );
}

/** A ruled row with a square tick box: a switch set in print. */
function TickRow({
  on,
  disabled,
  title,
  onToggle,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      shape="square"
      align="start"
      block
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className="h-auto gap-3 px-1 py-2"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border font-news text-sm font-bold",
          on ? "border-accent-300 bg-accent-300 text-on-accent" : "border-fg-primary/60",
        )}
      >
        {on ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1 text-left">{children}</span>
    </Button>
  );
}

function RowText({ title, note }: { title: string; note: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-headline text-base font-bold text-fg-strong">{title}</span>
      <span className="font-news text-xs italic text-fg-muted">{note}</span>
    </span>
  );
}
