import type { CollectionResponse } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createBox, deleteBox, updateBox } from "../../lib/collection.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { TrashIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal, ModalBody } from "../ui/Modal.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";

// Storage boxes: the physical-location grouping ("Kallax shelf 3", "big
// travel crate"). Create / rename / delete; deleting unassigns items via the
// FK's ON DELETE SET NULL. Items are assigned from the table's multi-select.

export function BoxManagerModal({
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
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });
  const create = useMutation({
    mutationFn: (name: string) => createBox(userId, { name }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateBox(userId, id, { name }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBox(userId, id),
    onSuccess: invalidate,
  });

  const error =
    errorMessageOf(create.error, "Couldn't create box") ??
    errorMessageOf(rename.error, "Couldn't rename box") ??
    errorMessageOf(remove.error, "Couldn't delete box");

  return (
    <Modal onClose={onClose} eyebrow="Collection" title="Storage boxes" size="sm">
      <ModalBody className="space-y-3">
        {error && <ErrorAlert message={error} />}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate(newName.trim());
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New box — e.g. Kallax, top shelf"
            maxLength={80}
            aria-label="New box name"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()}>
            Add
          </Button>
        </form>
        <ul className="space-y-1.5">
          {collection.boxes.map((box) => {
            const draft = drafts[box.id] ?? box.name;
            const dirty = draft.trim() !== box.name && draft.trim().length > 0;
            return (
              <li key={box.id} className="flex items-center gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [box.id]: e.target.value }))}
                  aria-label={`Rename ${box.name}`}
                  maxLength={80}
                />
                {dirty && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => rename.mutate({ id: box.id, name: draft.trim() })}
                  >
                    Save
                  </Button>
                )}
                <IconButton
                  aria-label={`Delete ${box.name}`}
                  tone="rose"
                  icon={<TrashIcon />}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete "${box.name}"?`,
                      description: "Games in this box become unassigned — nothing else is lost.",
                      confirmLabel: "Delete box",
                    });
                    if (ok) remove.mutate(box.id);
                  }}
                />
              </li>
            );
          })}
          {collection.boxes.length === 0 && (
            <li className="py-2 text-center text-xs text-fg-muted">
              No boxes yet — add one, then assign games from the table.
            </li>
          )}
        </ul>
        {confirmDialog}
      </ModalBody>
    </Modal>
  );
}
