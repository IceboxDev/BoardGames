import { useState } from "react";
import { cn } from "../lib/cn";
import { ChevronDownIcon } from "./icons";
import {
  Button,
  Chip,
  MemberPicker,
  type MemberPickerMember,
  Modal,
  ModalBody,
  ModalFooter,
} from "./ui";

// The library bar's "Owned by" control: a select-shaped trigger that opens a
// member checklist. A dialog rather than an anchored popover because the bar
// scrolls horizontally on phones and would clip anything hanging off it.

type Props = {
  members: readonly MemberPickerMember[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

export function OwnedByFilter({ members, selectedIds, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);
  const active = selectedIds.length > 0;
  const label =
    selectedIds.length === 1
      ? (members.find((m) => m.id === selectedIds[0])?.name ?? "Owned by")
      : active
        ? `Owned by · ${selectedIds.length}`
        : "Owned by";

  return (
    <>
      <Chip
        variant="outlined"
        shape="rounded"
        tone="accent"
        size="md"
        pressed={active}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Show games these members own"
        className={cn(
          "h-9 w-full justify-between gap-1 whitespace-nowrap rounded-card-lg",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
      </Chip>

      {open && (
        <Modal onClose={() => setOpen(false)} size="sm" title="Owned by">
          <ModalBody gap="md">
            <MemberPicker
              members={members}
              selectedIds={selected}
              onToggle={(id) =>
                onChange(
                  selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
                )
              }
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={!active}>
              Clear
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
