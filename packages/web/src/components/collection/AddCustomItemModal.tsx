import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { createCustomItem } from "../../lib/collection.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { Field } from "../ui/Field.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal.tsx";

// Manually-added box for something the site doesn't list — an unlisted game,
// an accessory case, a storage insert. Deliberately NOT the ownership flow:
// it never touches the inventory, so catalog games still only arrive through
// announce → approve. Measurements etc. are added afterwards via the row
// editor, like any other entry.

export function AddCustomItemModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [title, setTitle] = useState("");

  const mutation = useMutation({
    mutationFn: () => createCustomItem(userId, { title: title.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });
      onClose();
    },
  });

  return (
    <Modal
      onClose={onClose}
      eyebrow="Collection"
      title="Add an unlisted box"
      subheader="For games or accessories the site doesn't list — it appears in your manager only, not in the games catalog."
      size="sm"
    >
      <ModalBody className="space-y-3">
        {mutation.error && (
          <ErrorAlert message={errorMessageOf(mutation.error, "Couldn't add the box") ?? ""} />
        )}
        <Field label="Box name" htmlFor={`${uid}-title`}>
          <Input
            id={`${uid}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mensa quiz box"
            maxLength={120}
            autoFocus
          />
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => mutation.mutate()}
          disabled={title.trim().length === 0 || mutation.isPending}
          loading={mutation.isPending}
        >
          Add box
        </Button>
      </ModalFooter>
    </Modal>
  );
}
