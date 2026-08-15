import type { CollectionResponse } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createSleeveType,
  createStatus,
  deleteSleeveType,
  deleteStatus,
} from "../../lib/collection.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { TrashIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { Chip } from "../ui/Chip.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal, ModalBody } from "../ui/Modal.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";

// Per-user vocabularies: sleeve types (name + size + brand) and status
// options. Deliberately personal — no shared/group tables — so the empty
// status list offers one-click suggested defaults instead of seeded rows.

const SUGGESTED_STATUSES = ["In rotation", "Unpunched", "On loan", "Missing pieces", "For trade"];

type Tab = "sleeves" | "statuses";

export function VocabManagerModal({
  userId,
  collection,
  onClose,
}: {
  userId: string;
  collection: CollectionResponse;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("sleeves");
  const [sleeveName, setSleeveName] = useState("");
  const [sleeveWidth, setSleeveWidth] = useState("");
  const [sleeveHeight, setSleeveHeight] = useState("");
  const [sleeveBrand, setSleeveBrand] = useState("");
  const [statusLabel, setStatusLabel] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });

  const addSleeve = useMutation({
    mutationFn: () =>
      createSleeveType(userId, {
        name: sleeveName.trim(),
        widthMm: sleeveWidth ? Number.parseInt(sleeveWidth, 10) : null,
        heightMm: sleeveHeight ? Number.parseInt(sleeveHeight, 10) : null,
        brand: sleeveBrand.trim() || null,
      }),
    onSuccess: () => {
      setSleeveName("");
      setSleeveWidth("");
      setSleeveHeight("");
      setSleeveBrand("");
      invalidate();
    },
  });
  const removeSleeve = useMutation({
    mutationFn: (id: string) => deleteSleeveType(userId, id),
    onSuccess: invalidate,
  });
  const addStatus = useMutation({
    mutationFn: (label: string) => createStatus(userId, { label }),
    onSuccess: () => {
      setStatusLabel("");
      invalidate();
    },
  });
  const removeStatus = useMutation({
    mutationFn: (id: string) => deleteStatus(userId, id),
    onSuccess: invalidate,
  });

  const error =
    errorMessageOf(addSleeve.error, "Couldn't add sleeve type") ??
    errorMessageOf(removeSleeve.error, "Couldn't delete sleeve type") ??
    errorMessageOf(addStatus.error, "Couldn't add status") ??
    errorMessageOf(removeStatus.error, "Couldn't delete status");

  const existingLabels = new Set(collection.statuses.map((s) => s.label.toLowerCase()));

  return (
    <Modal onClose={onClose} eyebrow="Collection" title="Sleeves & statuses" size="sm">
      <ModalBody className="space-y-3">
        {error && <ErrorAlert message={error} />}
        <SegmentedControl<Tab>
          aria-label="Vocabulary"
          options={[
            { value: "sleeves", label: "Sleeve types" },
            { value: "statuses", label: "Statuses" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "sleeves" ? (
          <>
            <form
              className="grid grid-cols-2 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (sleeveName.trim()) addSleeve.mutate();
              }}
            >
              <Input
                value={sleeveName}
                onChange={(e) => setSleeveName(e.target.value)}
                placeholder="Name — e.g. Standard Euro"
                aria-label="Sleeve type name"
                maxLength={60}
                className="col-span-2"
              />
              <Input
                value={sleeveWidth}
                onChange={(e) => setSleeveWidth(e.target.value.replace(/\D/g, ""))}
                placeholder="Width mm"
                aria-label="Sleeve width in mm"
                inputMode="numeric"
              />
              <Input
                value={sleeveHeight}
                onChange={(e) => setSleeveHeight(e.target.value.replace(/\D/g, ""))}
                placeholder="Height mm"
                aria-label="Sleeve height in mm"
                inputMode="numeric"
              />
              <Input
                value={sleeveBrand}
                onChange={(e) => setSleeveBrand(e.target.value)}
                placeholder="Brand (optional)"
                aria-label="Sleeve brand"
                maxLength={60}
              />
              <Button type="submit" variant="primary" size="sm" disabled={!sleeveName.trim()}>
                Add sleeve type
              </Button>
            </form>
            <ul className="space-y-1">
              {collection.sleeveTypes.map((sleeve) => (
                <li key={sleeve.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-primary">
                    {sleeve.name}
                    <span className="text-3xs text-fg-muted">
                      {sleeve.widthMm && sleeve.heightMm
                        ? ` · ${sleeve.widthMm}×${sleeve.heightMm} mm`
                        : ""}
                      {sleeve.brand ? ` · ${sleeve.brand}` : ""}
                    </span>
                  </span>
                  <IconButton
                    aria-label={`Delete ${sleeve.name}`}
                    tone="rose"
                    size="xs"
                    icon={<TrashIcon />}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete "${sleeve.name}"?`,
                        description:
                          "Games sleeved with it keep their sleeve status, minus the type.",
                        confirmLabel: "Delete",
                      });
                      if (ok) removeSleeve.mutate(sleeve.id);
                    }}
                  />
                </li>
              ))}
              {collection.sleeveTypes.length === 0 && (
                <li className="py-1 text-center text-xs text-fg-muted">No sleeve types yet.</li>
              )}
            </ul>
          </>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (statusLabel.trim()) addStatus.mutate(statusLabel.trim());
              }}
            >
              <Input
                value={statusLabel}
                onChange={(e) => setStatusLabel(e.target.value)}
                placeholder="New status — e.g. In rotation"
                aria-label="New status label"
                maxLength={40}
              />
              <Button type="submit" variant="primary" size="sm" disabled={!statusLabel.trim()}>
                Add
              </Button>
            </form>
            {SUGGESTED_STATUSES.some((s) => !existingLabels.has(s.toLowerCase())) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-3xs text-fg-muted">Suggestions:</span>
                {SUGGESTED_STATUSES.filter((s) => !existingLabels.has(s.toLowerCase())).map(
                  (label) => (
                    <Chip key={label} pressed={false} onClick={() => addStatus.mutate(label)}>
                      {label}
                    </Chip>
                  ),
                )}
              </div>
            )}
            <ul className="space-y-1">
              {collection.statuses.map((status) => (
                <li key={status.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-primary">{status.label}</span>
                  <IconButton
                    aria-label={`Delete ${status.label}`}
                    tone="rose"
                    size="xs"
                    icon={<TrashIcon />}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete "${status.label}"?`,
                        description: "Games carrying it lose the status.",
                        confirmLabel: "Delete",
                      });
                      if (ok) removeStatus.mutate(status.id);
                    }}
                  />
                </li>
              ))}
              {collection.statuses.length === 0 && (
                <li className="py-1 text-center text-xs text-fg-muted">No statuses yet.</li>
              )}
            </ul>
          </>
        )}
        {confirmDialog}
      </ModalBody>
    </Modal>
  );
}
