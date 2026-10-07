import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LockedDate } from "../../lib/calendar-locks";

vi.mock("../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: { id: "admin", name: "Admin" }, isAdmin: true }),
}));
vi.mock("./AddressAutocomplete", () => ({ default: () => null }));

const { default: LockInModal } = await import("./LockInModal");

const member = (id: string, name: string): ProfileDirectoryEntry => ({
  id,
  name,
  image: null,
  tagline: null,
  accentHex: null,
  gamesOwned: 0,
  nextNightDateKey: null,
});
const MEMBERS = [member("ana", "Ana"), member("ben", "Ben"), member("cid", "Cid")];

function renderModal(props: Partial<Parameters<typeof LockInModal>[0]> = {}) {
  return render(
    <LockInModal
      date="2026-10-16"
      initialLock={null}
      candidates={[{ userId: "admin", name: "Admin" }]}
      members={MEMBERS}
      suggestedInviteeIds={new Set(["cid"])}
      onSubmit={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );
}

const checked = (name: string) => screen.getByRole("checkbox", { name });

describe("LockInModal prefill", () => {
  it("opens a found date as the group's private night", () => {
    renderModal({ prefill: { kind: "private", inviteeIds: ["ana", "ben"], seatCount: 3 } });
    expect(screen.getByRole("tab", { name: "Private night" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(checked("Ana")).toBeChecked();
    expect(checked("Ben")).toBeChecked();
    // The prefill replaces the "free that day" pre-check, it doesn't add to it.
    expect(checked("Cid")).not.toBeChecked();
    expect(screen.getByText("3 seats, host included")).toBeInTheDocument();
  });

  it("ignores the prefill when editing an existing night", () => {
    const lock = { isPrivate: false, host: null, rsvps: {} } as unknown as LockedDate;
    renderModal({
      initialLock: lock,
      prefill: { kind: "private", inviteeIds: ["ana"], seatCount: 3 },
    });
    expect(screen.getByRole("tab", { name: "Open night" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
