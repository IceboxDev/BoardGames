// The host's (and admin's) controls over a private night after lock-in:
// seats, who picks the games, a title, the guest list — and the one
// out-of-app channel we have, a ready-to-paste invitation. Everything is
// staged locally and lands in a single POST /api/calendar/private-night.

import {
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type PickMode,
  type PrivateNightUpdateBody,
} from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { type LockedDate, updatePrivateNight } from "../../lib/calendar-locks";
import { formatDayKey } from "../../lib/date-format";
import { fetchPlayers } from "../../lib/profile";
import { qk } from "../../lib/query-keys";
import {
  Button,
  ErrorAlert,
  Field,
  FieldGroup,
  Input,
  MemberPicker,
  Modal,
  ModalBody,
  ModalFooter,
  SegmentedControl,
  Stepper,
  useConfirm,
} from "../ui";
import { inviteText, PICK_MODE_OPTIONS, pickModeHint } from "./private-night-copy";

export default function PrivateNightManageSheet({
  date,
  lock,
  onClose,
}: {
  date: string;
  lock: LockedDate;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const titleId = useId();
  const hostId = lock.host?.userId ?? null;
  const invitedNow = useMemo(
    () => new Set(lock.expectedUserIds.filter((id) => id !== hostId)),
    [lock.expectedUserIds, hostId],
  );

  const [seatCount, setSeatCount] = useState(lock.seats?.total ?? MIN_SEAT_COUNT);
  const [pickMode, setPickMode] = useState<PickMode>(lock.pickMode);
  const [title, setTitle] = useState(lock.title ?? "");
  const [selected, setSelected] = useState<ReadonlySet<string>>(invitedNow);
  const [copied, setCopied] = useState(false);

  const playersQuery = useQuery({
    queryKey: qk.players(),
    queryFn: ({ signal }) => fetchPlayers(signal),
  });
  const members = useMemo(
    () =>
      (playersQuery.data?.players ?? [])
        .filter((p) => p.id !== hostId)
        .map((p) => ({ id: p.id, name: p.name, image: p.image, accentHex: p.accentHex })),
    [playersQuery.data, hostId],
  );

  const taken = lock.seats?.taken ?? 1;
  const waiting = lock.seats?.waitlisted ?? 0;
  const seatCaption =
    seatCount < taken
      ? `${taken} already seated — kick someone before going lower`
      : `${taken} seated${waiting > 0 ? ` · ${waiting} waiting` : ""} · host included`;

  const additions = [...selected].filter((id) => !invitedNow.has(id));
  const removals = [...invitedNow].filter((id) => !selected.has(id));
  const patch: Omit<PrivateNightUpdateBody, "date"> = {
    ...(seatCount !== (lock.seats?.total ?? MIN_SEAT_COUNT) ? { seatCount } : {}),
    ...(pickMode !== lock.pickMode ? { pickMode } : {}),
    ...((title.trim() || null) !== lock.title ? { title: title.trim() || null } : {}),
    ...(additions.length > 0 ? { addInviteeIds: additions } : {}),
    ...(removals.length > 0 ? { removeInviteeIds: removals } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  const saveMutation = useMutation({
    mutationFn: () => updatePrivateNight(date, patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.calendarLocks() }),
        queryClient.invalidateQueries({ queryKey: qk.availableGames(date) }),
      ]);
      onClose();
    },
  });

  async function handleSave() {
    if (!dirty || saveMutation.isPending) return;
    if (seatCount < taken) return;
    // Uninviting someone who already has a seat is a kick as well — say so.
    const seatedRemovals = removals.filter(
      (id) => lock.seatedUserIds.includes(id) || lock.waitlistUserIds.includes(id),
    );
    if (seatedRemovals.length > 0) {
      const names = seatedRemovals
        .map((id) => members.find((m) => m.id === id)?.name ?? "a guest")
        .join(", ");
      const ok = await confirm({
        title: `Uninvite ${names}?`,
        description: "They already answered yes. Their seat is freed and their picks are dropped.",
        confirmLabel: "Uninvite",
      });
      if (!ok) return;
    }
    saveMutation.mutate();
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteText(date, lock, window.location.origin));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="sm"
      eyebrow="Private night"
      title="Manage the night"
      subheader={<span className="text-xs text-fg-secondary">{formatDayKey(date, "weekday")}</span>}
    >
      <ModalBody gap="md">
        <FieldGroup label="Seats" hint={seatCaption}>
          <Stepper
            size="sm"
            label="Seats"
            value={seatCount}
            min={MIN_SEAT_COUNT}
            max={MAX_SEAT_COUNT}
            onChange={setSeatCount}
            disabled={saveMutation.isPending}
          />
        </FieldGroup>

        <FieldGroup label="Games" hint={pickModeHint(pickMode)}>
          <SegmentedControl
            shape="pill"
            size="sm"
            fullWidth
            aria-label="How games get picked"
            value={pickMode}
            onChange={setPickMode}
            options={PICK_MODE_OPTIONS}
            disabled={saveMutation.isPending}
          />
        </FieldGroup>

        <Field label="Title (optional)" htmlFor={titleId}>
          <Input
            id={titleId}
            value={title}
            maxLength={80}
            placeholder="TI4 marathon, Cthulhu night…"
            onChange={(e) => setTitle(e.target.value)}
            disabled={saveMutation.isPending}
          />
        </Field>

        <FieldGroup
          label="Guest list"
          action={
            <Button variant="ghost" size="xs" onClick={copyInvite}>
              {copied ? "Copied!" : "Copy invite text"}
            </Button>
          }
        >
          <MemberPicker
            members={members}
            selectedIds={selected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            selectedNoun="invited"
            disabled={saveMutation.isPending || playersQuery.isPending}
          />
        </FieldGroup>

        {saveMutation.error && (
          <ErrorAlert message={saveMutation.error.message || "Couldn't save. Try again."} />
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || seatCount < taken}
          loading={saveMutation.isPending}
        >
          Save changes
        </Button>
      </ModalFooter>
      {confirmDialog}
    </Modal>
  );
}
