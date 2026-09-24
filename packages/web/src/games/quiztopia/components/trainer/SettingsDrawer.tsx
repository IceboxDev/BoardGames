import type { QuiztopiaSettings } from "@boardgames/core/protocol";
import { useEffect, useId, useRef, useState } from "react";
import {
  Checkbox,
  Drawer,
  ErrorAlert,
  FieldGroup,
  MicroLabel,
  SegmentedControl,
  Stepper,
} from "../../../../components/ui";
import { errorMessageOf } from "../../../../lib/error-message";
import { useQuiztopiaSettings } from "../../hooks/useQuiztopiaSettings";
import { LanguageToggle } from "../common/LanguageToggle";

// The trainer's preferences in a right-hand drawer: question language, how
// new cards arrive (whole sets or originals first), the daily budget of new
// cards per district, and the two schedule switches.
// Every change saves on its own (one PUT of the whole object); the stepper
// waits a beat so a run of taps becomes one request. There is no "reset
// progress" here — the API has no endpoint for it yet.

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

  // The stepper edits a local copy and commits after a pause.
  const [newPerDay, setNewPerDay] = useState(settings.newPerDay);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setNewPerDay(settings.newPerDay);
  }, [settings.newPerDay]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => {
      dirty.current = false;
      save({ newPerDay });
    }, STEPPER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [newPerDay, save]);

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
        label="New cards per district, per day"
        hint="Reviews are never capped — this only paces how fast the city grows."
      >
        <Stepper
          value={newPerDay}
          min={0}
          max={50}
          size="sm"
          label="New cards per district per day"
          caption={
            newPerDay === 0
              ? "No new cards — reviews only"
              : settings.newCardOrder === "sets"
                ? `${Math.ceil(newPerDay / 5)} ${Math.ceil(newPerDay / 5) === 1 ? "set" : "sets"} (${Math.ceil(newPerDay / 5) * 5} cards) per district — rounded up to whole sets`
                : `Up to ${newPerDay * 12} new cards a day across the city`
          }
          onChange={(next) => {
            dirty.current = true;
            setNewPerDay(next);
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

      <div className="mt-auto border-t border-line-soft pt-3">
        <MicroLabel>Progress</MicroLabel>
        <p className="mt-1 text-xs text-fg-muted">
          Your schedule lives on the server. There is no reset yet — ask an admin if you need a
          fresh start.
        </p>
      </div>
    </Drawer>
  );
}
