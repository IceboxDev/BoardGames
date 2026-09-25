import { type GeoSettings, GeoSettingsSchema } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  Button,
  Checkbox,
  Drawer,
  ErrorAlert,
  FieldGroup,
  MicroLabel,
  SegmentedControl,
  useConfirm,
} from "../../components/ui";
import { errorMessageOf } from "../../lib/error-message";
import { putSettings, resetProgress } from "./api";
import { useCatalog } from "./data";
import { GEO_PENDING_KEY } from "./offline-queue";

// The geography trainer's preferences: names in English or German, an optional
// continent to focus the new places on, leeches, and a reset.

type Props = { settings: GeoSettings; onClose: () => void };

export function GeoSettingsDrawer({ settings: initial, onClose }: Props) {
  const catalog = useCatalog();
  const qc = useQueryClient();
  const [settings, setSettings] = useState(initial);
  const leechId = useId();
  const save = useMutation({
    mutationFn: (next: GeoSettings) => putSettings(GeoSettingsSchema.parse(next)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["geography", "overview"] }),
  });
  const patch = (p: Partial<GeoSettings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    save.mutate(next);
  };

  const { confirm, confirmDialog } = useConfirm();
  const reset = useMutation({
    mutationFn: () => resetProgress({ confirm: true }),
    onSuccess: () => {
      try {
        window.localStorage.removeItem(GEO_PENDING_KEY);
      } catch {
        // storage blocked — nothing queued there either
      }
      void qc.invalidateQueries({ queryKey: ["geography", "overview"] });
      void qc.invalidateQueries({ queryKey: ["geography", "history"] });
    },
  });
  const onReset = async () => {
    const ok = await confirm({
      title: "Reset all World Geography progress?",
      description:
        "Every place goes back to new, and your streak and study history are cleared. Your settings stay. This cannot be undone.",
      confirmLabel: "Reset progress",
    });
    if (ok) reset.mutate();
  };

  return (
    <Drawer
      side="right"
      onClose={onClose}
      eyebrow="World Geography"
      title="Settings"
      subheader={
        <p className="text-xs text-fg-muted">
          {save.isPending ? "Saving…" : "Saved to your account"}
        </p>
      }
    >
      {save.isError && (
        <ErrorAlert message={errorMessageOf(save.error, "The change was not saved.")} />
      )}

      <FieldGroup label="Names in" hint="Typed answers are accepted in either language.">
        <SegmentedControl
          options={[
            { value: "en", label: "English" },
            { value: "de", label: "Deutsch" },
          ]}
          value={settings.language}
          onChange={(language) => patch({ language })}
          shape="pill"
          size="sm"
          selectionMode="toggle"
        />
      </FieldGroup>

      <FieldGroup
        label="Focus"
        hint="New countries and cities come only from this continent. The seven continents always come first."
      >
        <SegmentedControl
          options={[
            { value: "all", label: "World" },
            ...catalog.continents
              .filter((c) => c.code !== "an")
              .map((c) => ({ value: c.code, label: c.nameEn })),
          ]}
          value={settings.focus ?? "all"}
          onChange={(v) => patch({ focus: v === "all" ? null : (v as GeoSettings["focus"]) })}
          shape="rounded"
          size="xs"
          selectionMode="toggle"
          className="flex-wrap"
        />
      </FieldGroup>

      <FieldGroup label="Schedule">
        <Checkbox
          id={leechId}
          checked={settings.includeLeeches}
          onChange={(e) => patch({ includeLeeches: e.target.checked })}
          label={
            <span className="flex flex-col">
              <span>Include leeches</span>
              <span className="text-2xs text-fg-muted">
                Places missed eight times or more stay out of the queue unless this is on.
              </span>
            </span>
          }
        />
      </FieldGroup>

      <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
        <MicroLabel>Progress</MicroLabel>
        <p className="text-xs text-fg-muted">
          Start over: every place back to new, streak and history cleared. Settings stay.
        </p>
        {reset.isSuccess && (
          <p className="text-xs text-emerald-300" role="status">
            Progress reset — the world is blank again.
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
