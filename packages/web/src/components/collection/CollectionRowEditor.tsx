import type { CollectionResponse, UpsertItemBody } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { removeOwnedGame, setPlayedThrough, upsertCollectionItem } from "../../lib/collection.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { Field } from "../ui/Field.tsx";
import { Input } from "../ui/Input.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Select } from "../ui/Select.tsx";
import { Textarea } from "../ui/Textarea.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";
import type { CollectionRow } from "./collection-rows.ts";

// Full per-item editor inside the table's expansion row. Draft-then-save for
// the typed fields; the destructive affordances (played-through, restore,
// remove) sit at the bottom behind confirms. Ownership-mutating calls also
// invalidate the profile/players caches so counts update everywhere.

type Draft = {
  sleeveStatus: "none" | "sleeved" | "missing";
  sleeveTypeId: string;
  boxId: string;
  statusId: string;
  widthMm: string;
  depthMm: string;
  heightMm: string;
  weightG: string;
  language: string;
  acquiredOn: string;
  price: string; // EUR decimal string
  note: string;
};

function draftFromRow(row: CollectionRow): Draft {
  const item = row.item;
  return {
    sleeveStatus: item?.sleeveStatus ?? "none",
    sleeveTypeId: item?.sleeveTypeId ?? "",
    boxId: item?.boxId ?? "",
    statusId: item?.statusId ?? "",
    widthMm: item?.widthMm != null ? String(item.widthMm) : "",
    depthMm: item?.depthMm != null ? String(item.depthMm) : "",
    heightMm: item?.heightMm != null ? String(item.heightMm) : "",
    weightG: item?.weightG != null ? String(item.weightG) : "",
    language: item?.language ?? "",
    acquiredOn: item?.acquiredOn ?? "",
    price: item?.pricePaidCents != null ? (item.pricePaidCents / 100).toFixed(2) : "",
    note: item?.note ?? "",
  };
}

function intOrNull(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function CollectionRowEditor({
  userId,
  row,
  collection,
}: {
  userId: string;
  row: CollectionRow;
  collection: CollectionResponse;
}) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [draft, setDraft] = useState<Draft>(() => draftFromRow(row));

  const invalidateCollection = () =>
    void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });
  const invalidateOwnership = () => {
    invalidateCollection();
    void queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
    void queryClient.invalidateQueries({ queryKey: qk.players() });
    void queryClient.invalidateQueries({ queryKey: qk.inventory(userId) });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: UpsertItemBody = {
        ...(row.slug !== null ? { slug: row.slug } : { itemId: row.item?.id as string }),
        sleeveStatus: draft.sleeveStatus,
        sleeveTypeId:
          draft.sleeveStatus === "none" ? null : draft.sleeveTypeId ? draft.sleeveTypeId : null,
        boxId: draft.boxId || null,
        statusId: draft.statusId || null,
        widthMm: intOrNull(draft.widthMm),
        depthMm: intOrNull(draft.depthMm),
        heightMm: intOrNull(draft.heightMm),
        weightG: intOrNull(draft.weightG),
        language: draft.language.trim() || null,
        acquiredOn: /^\d{4}-\d{2}-\d{2}$/.test(draft.acquiredOn) ? draft.acquiredOn : null,
        pricePaidCents: draft.price
          ? Math.round(Number.parseFloat(draft.price.replace(",", ".")) * 100) || null
          : null,
        note: draft.note.trim() || null,
      };
      return upsertCollectionItem(userId, body);
    },
    onSuccess: invalidateCollection,
  });

  const playedThroughMutation = useMutation({
    mutationFn: (playedThrough: boolean) =>
      setPlayedThrough(userId, { slug: row.slug as string, playedThrough }),
    onSuccess: invalidateOwnership,
  });

  const removeMutation = useMutation({
    mutationFn: () => removeOwnedGame(userId, row.slug as string),
    onSuccess: invalidateOwnership,
  });

  const error =
    errorMessageOf(save.error, "Save failed") ??
    errorMessageOf(playedThroughMutation.error, "Update failed") ??
    errorMessageOf(removeMutation.error, "Remove failed");

  return (
    <div className="space-y-3">
      {error && <ErrorAlert message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status" htmlFor={`ed-status-${row.key}`}>
          <Select
            id={`ed-status-${row.key}`}
            size="sm"
            value={draft.statusId}
            onChange={(e) => setDraft({ ...draft, statusId: e.target.value })}
          >
            <option value="">—</option>
            {collection.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Storage box" htmlFor={`ed-box-${row.key}`}>
          <Select
            id={`ed-box-${row.key}`}
            size="sm"
            value={draft.boxId}
            onChange={(e) => setDraft({ ...draft, boxId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {collection.boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sleeves" htmlFor={`ed-sleeves-${row.key}`}>
          <SegmentedControl<Draft["sleeveStatus"]>
            aria-label="Sleeve status"
            size="sm"
            options={[
              { value: "none", label: "N/A" },
              { value: "sleeved", label: "Sleeved" },
              { value: "missing", label: "Missing" },
            ]}
            value={draft.sleeveStatus}
            onChange={(sleeveStatus) => setDraft({ ...draft, sleeveStatus })}
          />
        </Field>
        <Field label="Sleeve type" htmlFor={`ed-sleevetype-${row.key}`}>
          <Select
            id={`ed-sleevetype-${row.key}`}
            size="sm"
            disabled={draft.sleeveStatus === "none"}
            value={draft.sleeveTypeId}
            onChange={(e) => setDraft({ ...draft, sleeveTypeId: e.target.value })}
          >
            <option value="">—</option>
            {collection.sleeveTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.widthMm && s.heightMm ? ` (${s.widthMm}×${s.heightMm})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Field label="Width mm" htmlFor={`ed-w-${row.key}`}>
          <Input
            id={`ed-w-${row.key}`}
            inputMode="numeric"
            value={draft.widthMm}
            onChange={(e) => setDraft({ ...draft, widthMm: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Depth mm" htmlFor={`ed-d-${row.key}`}>
          <Input
            id={`ed-d-${row.key}`}
            inputMode="numeric"
            value={draft.depthMm}
            onChange={(e) => setDraft({ ...draft, depthMm: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Height mm" htmlFor={`ed-h-${row.key}`}>
          <Input
            id={`ed-h-${row.key}`}
            inputMode="numeric"
            value={draft.heightMm}
            onChange={(e) => setDraft({ ...draft, heightMm: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Weight g" htmlFor={`ed-g-${row.key}`}>
          <Input
            id={`ed-g-${row.key}`}
            inputMode="numeric"
            value={draft.weightG}
            onChange={(e) => setDraft({ ...draft, weightG: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Language" htmlFor={`ed-lang-${row.key}`}>
          <Input
            id={`ed-lang-${row.key}`}
            value={draft.language}
            maxLength={40}
            placeholder="EN / DE"
            onChange={(e) => setDraft({ ...draft, language: e.target.value })}
          />
        </Field>
        <Field label="Acquired" htmlFor={`ed-acq-${row.key}`}>
          <Input
            id={`ed-acq-${row.key}`}
            type="date"
            value={draft.acquiredOn}
            onChange={(e) => setDraft({ ...draft, acquiredOn: e.target.value })}
          />
        </Field>
        <Field label="Price €" htmlFor={`ed-price-${row.key}`}>
          <Input
            id={`ed-price-${row.key}`}
            inputMode="decimal"
            value={draft.price}
            placeholder="24.99"
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
        </Field>
        <div className="flex items-end">
          {row.bggId && (
            <a
              href={`https://boardgamegeek.com/boardgame/${row.bggId}`}
              target="_blank"
              rel="noreferrer"
              className="text-2xs text-accent-300 underline-offset-2 hover:underline"
            >
              BGG page ↗
            </a>
          )}
        </div>
      </div>

      <Field label="Note" htmlFor={`ed-note-${row.key}`}>
        <Textarea
          id={`ed-note-${row.key}`}
          rows={2}
          maxLength={2000}
          value={draft.note}
          placeholder="Anything worth remembering about this copy…"
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {row.legacy && row.slug && !row.playedThrough && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: `Mark "${row.title}" played through?`,
                  description:
                    "Playing it destroyed the copy, so it leaves your owned games — the record stays here.",
                  confirmLabel: "Mark played through",
                });
                if (ok) playedThroughMutation.mutate(true);
              }}
              loading={playedThroughMutation.isPending}
            >
              Mark played through
            </Button>
          )}
          {row.legacy && row.slug && row.playedThrough && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => playedThroughMutation.mutate(false)}
              loading={playedThroughMutation.isPending}
            >
              Restore to owned
            </Button>
          )}
          {!row.legacy && row.slug && !row.playedThrough && (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-300"
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove "${row.title}" from the collection?`,
                  description:
                    "For a sold or gifted copy. This also deletes its collection notes — it can be re-added via an announcement.",
                  confirmLabel: "Remove",
                });
                if (ok) removeMutation.mutate();
              }}
              loading={removeMutation.isPending}
            >
              Remove from collection
            </Button>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => save.mutate()} loading={save.isPending}>
          Save
        </Button>
      </div>
      {confirmDialog}
    </div>
  );
}
