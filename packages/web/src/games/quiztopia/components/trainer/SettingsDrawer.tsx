import type { QuiztopiaSettings } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Drawer,
  ErrorAlert,
  FieldGroup,
  MicroLabel,
  SegmentedControl,
  Stepper,
  useConfirm,
} from "../../../../components/ui";
import { errorMessageOf } from "../../../../lib/error-message";
import { resetProgress } from "../../api";
import { PENDING_REVIEWS_KEY } from "../../hooks/useOfflineReviewQueue";
import { useQuiztopiaSettings } from "../../hooks/useQuiztopiaSettings";
import { LanguageToggle } from "../common/LanguageToggle";

// The trainer's preferences in a right-hand drawer: question language, how
// new cards arrive (whole sets or originals first), the daily budget of new
// cards per district, and the two schedule switches.
// Every change saves on its own (one PUT of the whole object); the stepper
// waits a beat so a run of taps becomes one request. "Reset progress" wipes
// the server-side schedule after a confirm.

type Props = {
  onClose: () => void;
};

const STEPPER_DEBOUNCE_MS = 400;

export function SettingsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </svg>
  );
}

export function SettingsDrawer({ onClose }: Props) {
  const { settings, loaded, save, saving, saveError } = useQuiztopiaSettings();
  const ids = { game: useId(), leech: useId() };

  // The stepper edits a local copy and commits after a pause. Whole-set mode
  // budgets articles (`newSetsPerDay`), originals-first mode questions.
  const bySet = settings.newCardOrder === "sets";
  const budgetField = bySet ? "newSetsPerDay" : "newPerDay";
  const stored = settings[budgetField];
  const [budget, setBudget] = useState(stored);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setBudget(stored);
  }, [stored]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => {
      dirty.current = false;
      save({ [budgetField]: budget });
    }, STEPPER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [budget, budgetField, save]);

  // Reset: wipe schedule, history and reads on the server, drop any reviews
  // still queued offline (they would re-create the progress), refetch.
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const reset = useMutation({
    mutationFn: () => resetProgress({ confirm: true }),
    onSuccess: () => {
      try {
        window.localStorage.removeItem(PENDING_REVIEWS_KEY);
      } catch {
        // storage blocked — nothing queued there either
      }
      void qc.invalidateQueries({
        queryKey: ["quiztopia"],
        predicate: (q) => q.queryKey[1] !== "content" && q.queryKey[1] !== "settings",
      });
    },
  });
  const onReset = async () => {
    const ok = await confirm({
      title: "Reset all Quiztopia progress?",
      description:
        "Every card goes back to new, your streak and study history are cleared, and all articles become unread. Your settings stay. This cannot be undone.",
      confirmLabel: "Reset progress",
    });
    if (ok) reset.mutate();
  };

  const patch = (p: Partial<QuiztopiaSettings>) => save(p);
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
        hint="The study card and the article default to this; L cycles it on any screen."
      >
        <LanguageToggle
          value={settings.language}
          onChange={(language) => patch({ language })}
          size="sm"
        />
      </FieldGroup>

      <FieldGroup
        label="New cards arrive"
        hint={
          settings.newCardOrder === "sets"
            ? "A whole set at a time — the original question and its four siblings together, so you learn the topic behind them."
            : "Every original card question first, spread apart; the four invented siblings per set come later."
        }
      >
        <SegmentedControl
          options={[
            { value: "sets", label: "Whole sets" },
            { value: "originals", label: "Originals first" },
          ]}
          value={settings.newCardOrder}
          onChange={(newCardOrder) => patch({ newCardOrder })}
          shape="pill"
          size="sm"
          tone="accent"
          selectionMode="toggle"
          disabled={!loaded}
        />
      </FieldGroup>

      <FieldGroup
        label={bySet ? "New articles per district, per day" : "New cards per district, per day"}
        hint={
          bySet
            ? "You read the new articles first, then their questions are shuffled in with everything due. Reviews are never capped."
            : "Reviews are never capped — this only paces how fast the city grows."
        }
      >
        <Stepper
          value={budget}
          min={0}
          max={bySet ? 10 : 50}
          size="sm"
          label={bySet ? "New articles per district per day" : "New cards per district per day"}
          caption={
            budget === 0
              ? "Nothing new — reviews only"
              : bySet
                ? `${budget} ${budget === 1 ? "article" : "articles"} · ${budget * 5} questions per district`
                : `Up to ${budget * 12} new cards a day across the city`
          }
          onChange={(next) => {
            dirty.current = true;
            setBudget(next);
          }}
          disabled={!loaded}
        />
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
            Progress reset — the city is dark again.
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
