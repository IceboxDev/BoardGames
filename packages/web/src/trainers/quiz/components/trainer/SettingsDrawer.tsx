import type { QuizSettings } from "@boardgames/core/protocol";
import { QUIZ_SOURCES } from "@boardgames/core/quiz/sources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Chip,
  Drawer,
  ErrorAlert,
  FieldGroup,
  MicroLabel,
  Stepper,
  useConfirm,
} from "../../../../components/ui";
import { errorMessageOf } from "../../../../lib/error-message";
import { resetProgress } from "../../api";
import { invalidateAfterReset } from "../../cache";
import { coreToneOf, DOMAINS } from "../../domains";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { quizReviewOutbox } from "../../review-outbox";
import { LanguageToggle } from "../common/LanguageToggle";

// The trainer's preferences in a right-hand drawer: question language, the
// daily budget of new facts, which games' questions to study, which domains
// "Study all" draws from, and the two schedule switches.
// Every change saves on its own (one PUT of the whole object, applied to the
// cache at once and sent in order — `useQuizSettings`); the stepper
// waits a beat so a run of taps becomes one request. "Reset progress" wipes
// the server-side schedule after a confirm.

type Props = {
  onClose: () => void;
};

const STEPPER_DEBOUNCE_MS = 400;

export function SettingsDrawer({ onClose }: Props) {
  const { settings, loaded, save, saving, saveError } = useQuizSettings();
  const ids = { game: useId(), leech: useId() };

  // The stepper edits a local copy and commits after a pause. A change still
  // waiting when the drawer closes is committed on the way out.
  const stored = settings.newFactsPerDay;
  const [budget, setBudget] = useState(stored);
  const pendingBudget = useRef<number | null>(null);
  const budgetTimer = useRef<number | null>(null);
  const commitBudget = useCallback(() => {
    if (budgetTimer.current !== null) window.clearTimeout(budgetTimer.current);
    budgetTimer.current = null;
    const pending = pendingBudget.current;
    if (pending === null) return;
    pendingBudget.current = null;
    save({ newFactsPerDay: pending });
  }, [save]);
  const changeBudget = (value: number) => {
    pendingBudget.current = value;
    setBudget(value);
    if (budgetTimer.current !== null) window.clearTimeout(budgetTimer.current);
    budgetTimer.current = window.setTimeout(commitBudget, STEPPER_DEBOUNCE_MS);
  };
  useEffect(() => {
    if (pendingBudget.current === null) setBudget(stored);
  }, [stored]);
  useEffect(() => () => commitBudget(), [commitBudget]);

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

  return (
    <Drawer
      side="right"
      onClose={onClose}
      eyebrow="Trainer"
      title="Settings"
      subheader={
        <p className="text-xs text-fg-muted">
          {saving ? "Saving…" : loaded ? "Saved to your account" : "Loading…"}
        </p>
      }
    >
      {errorMessage && <ErrorAlert message={errorMessage} />}

      <FieldGroup
        label="Question language"
        hint="The main language of cards and articles, and an optional second one shown under questions and answers. L cycles the main language on any screen."
      >
        <LanguageToggle
          value={settings.language}
          onChange={(language) => patch({ language })}
          size="sm"
          disabled={!loaded}
        />
      </FieldGroup>

      <FieldGroup
        label="New facts per day"
        hint="New facts come a whole article at a time: articles are taken while they fit this budget (the first one even if it alone is bigger). You read them first, then their facts are shuffled in with everything due. Reviews are never capped."
      >
        <Stepper
          value={budget}
          min={0}
          max={60}
          size="sm"
          label="New facts per day"
          caption={
            budget === 0
              ? "Nothing new — reviews only"
              : `${budget} new ${budget === 1 ? "fact" : "facts"} a day`
          }
          onChange={changeBudget}
          disabled={!loaded}
        />
      </FieldGroup>

      <FieldGroup
        label="Games"
        hint="Study the questions of these games. A question several games ask is studied once, in the wording of the first game listed."
      >
        <div className="flex flex-wrap gap-1.5">
          {QUIZ_SOURCES.map((src) => {
            const on = settings.sources.includes(src.id);
            const last = on && settings.sources.length === 1;
            return (
              <Chip
                key={src.id}
                pressed={on}
                tone="accent"
                size="xs"
                shape="pill"
                disabled={!loaded || last}
                title={last ? "At least one game stays on" : undefined}
                onClick={() =>
                  save((current) => ({
                    sources: current.sources.includes(src.id)
                      ? current.sources.filter((x) => x !== src.id)
                      : QUIZ_SOURCES.map((x) => x.id).filter(
                          (id) => id === src.id || current.sources.includes(id),
                        ),
                  }))
                }
              >
                {src.title}
              </Chip>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup
        label="“Study all” includes"
        hint="Tap a domain to leave it out of “Study all” — due and new facts alike. Its own tile still studies it."
      >
        <div className="flex flex-wrap gap-1.5">
          {DOMAINS.map((d) => {
            const included = !settings.excludeFromAll.includes(d.slug);
            return (
              <Chip
                key={d.slug}
                pressed={included}
                tone={coreToneOf(d.tone)}
                size="xs"
                shape="pill"
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
              >
                {d.en}
              </Chip>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup label="Schedule">
        <div className="flex flex-col gap-3">
          <Checkbox
            id={ids.game}
            checked={settings.gameReviewsAffectSrs}
            onChange={(e) => patch({ gameReviewsAffectSrs: e.target.checked })}
            disabled={!loaded}
            label={
              <span className="flex flex-col">
                <span>Table-game answers update my schedule</span>
                <span className="text-2xs text-fg-muted">
                  A question the table got right is treated as “knew it”; a miss as “didn't know”.
                </span>
              </span>
            }
          />
          <Checkbox
            id={ids.leech}
            checked={settings.includeLeeches}
            onChange={(e) => patch({ includeLeeches: e.target.checked })}
            disabled={!loaded}
            label={
              <span className="flex flex-col">
                <span>Include leeches</span>
                <span className="text-2xs text-fg-muted">
                  Cards missed eight times or more stay out of the queue unless this is on.
                </span>
              </span>
            }
          />
        </div>
      </FieldGroup>

      <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
        <MicroLabel>Progress</MicroLabel>
        <p className="text-xs text-fg-muted">
          Start over: every card back to new, streak and history cleared, articles unread. Settings
          stay.
        </p>
        {reset.isSuccess && (
          <p className="text-xs text-emerald-300" role="status">
            Progress reset — every fact is new again.
          </p>
        )}
        {reset.isError && (
          <ErrorAlert message={errorMessageOf(reset.error, "The reset did not go through.")} />
        )}
        <div>
          <Button variant="danger" size="sm" onClick={onReset} loading={reset.isPending}>
            Reset progress
          </Button>
        </div>
      </div>
      {confirmDialog}
    </Drawer>
  );
}
