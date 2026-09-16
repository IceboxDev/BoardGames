// What an outsider sees when they tap a private night: that the date is
// taken, by whom, and how full the table is. Nothing else — the server sent a
// redacted lock, so there is nothing else to show even by accident.

import { type LockedDate, nightLabel } from "../../lib/calendar-locks";
import { formatDayKey } from "../../lib/date-format";
import { Modal, ModalBody, ProgressBar } from "../ui";
import { HostLine } from "./RsvpModal";

export default function PrivateNightPeek({
  date,
  lock,
  onClose,
}: {
  date: string;
  lock: LockedDate;
  onClose: () => void;
}) {
  const seats = lock.seats;
  const left = seats ? Math.max(0, seats.total - seats.taken) : null;
  const hostName = lock.host?.name ?? null;
  return (
    <Modal
      onClose={onClose}
      size="xs"
      eyebrow={nightLabel(date) ? `Private night · ${nightLabel(date)}` : "Private night"}
      eyebrowClassName="text-private-ink/70"
      title={formatDayKey(date, "weekday")}
      subheader={hostName ? <HostLine name={hostName} /> : undefined}
    >
      <ModalBody gap="md">
        {seats && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-2xs text-fg-secondary">
              <span>Seats</span>
              <span className="font-semibold tabular-nums text-fg-strong">
                {seats.taken} of {seats.total} taken
              </span>
            </div>
            <ProgressBar
              value={seats.taken}
              extent={seats.total}
              tone={left === 0 ? "amber" : "neutral"}
              label="Seats taken"
              animate={false}
            />
          </div>
        )}
        <p className="text-sm text-fg-secondary">
          This one is invitation only
          {hostName ? (
            <>
              {" "}
              — ask <span className="font-semibold text-fg-strong">{hostName}</span> if you'd like a
              seat.
            </>
          ) : (
            "."
          )}
        </p>
      </ModalBody>
    </Modal>
  );
}
