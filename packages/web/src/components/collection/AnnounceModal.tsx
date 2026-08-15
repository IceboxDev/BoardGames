import type { CollectionResponse } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { createAnnouncement } from "../../lib/collection.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { Field } from "../ui/Field.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Textarea } from "../ui/Textarea.tsx";
import { GamePicker } from "./GamePicker.tsx";

// "Announce new ownership" — the only self-service way to add an owned game.
// Creates a pending announcement an admin resolves; free-text covers games
// the site doesn't know yet.

type Source = "catalog" | "free-text";

export function AnnounceModal({
  userId,
  collection,
  onClose,
}: {
  userId: string;
  collection: CollectionResponse;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [source, setSource] = useState<Source>("catalog");
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [note, setNote] = useState("");

  // Hide what's already owned or already pending.
  const excludeSlugs = useMemo(() => {
    const set = new Set(collection.slugs);
    for (const a of collection.announcements) {
      if (a.status === "pending" && a.slug) set.add(a.slug);
    }
    return set;
  }, [collection]);

  const mutation = useMutation({
    mutationFn: () =>
      createAnnouncement(
        source === "catalog"
          ? { slug: pickedSlug as string, ...(note.trim() ? { note: note.trim() } : {}) }
          : { freeTextName: freeText.trim(), ...(note.trim() ? { note: note.trim() } : {}) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });
      onClose();
    },
  });

  const canSubmit = source === "catalog" ? pickedSlug !== null : freeText.trim().length >= 2;

  return (
    <Modal onClose={onClose} eyebrow="Collection" title="Announce a new game" size="md">
      <ModalBody className="space-y-3">
        {mutation.error && (
          <ErrorAlert message={errorMessageOf(mutation.error, "Couldn't announce") ?? ""} />
        )}
        <SegmentedControl<Source>
          aria-label="Announcement source"
          options={[
            { value: "catalog", label: "From catalog" },
            { value: "free-text", label: "Not listed" },
          ]}
          value={source}
          onChange={setSource}
        />
        {source === "catalog" ? (
          <GamePicker excludeSlugs={excludeSlugs} pickedSlug={pickedSlug} onPick={setPickedSlug} />
        ) : (
          <Field
            label="Game name"
            htmlFor={`${uid}-free-text`}
            hint="Not on the site yet — an admin will sort it out."
          >
            <Input
              id={`${uid}-free-text`}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="e.g. Brass: Birmingham"
              maxLength={120}
            />
          </Field>
        )}
        <Field label="Note (optional)" htmlFor={`${uid}-note`}>
          <Textarea
            id={`${uid}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Deluxe edition, still in shrink…"
            maxLength={500}
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
          disabled={!canSubmit || mutation.isPending}
          loading={mutation.isPending}
        >
          Announce
        </Button>
      </ModalFooter>
    </Modal>
  );
}
