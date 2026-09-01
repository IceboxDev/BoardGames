import { useState } from "react";
import { ExpandableAdminCard, UserRow, UsersTable } from "../components/admin";
import type { AdminUser } from "../components/admin/types";
import { INACTIVE_AFTER_DAYS } from "./admin-coverage";

// Dev-only preview of the admin page's inactivity split — the main users
// table with 0% players carrying their days-at-0% tag, and the collapsible
// "Inactive players" card below it — with mock rows, no auth/queries.
// /dev/admin-inactive-preview

const noop = () => {};

function mockUser(id: string, name: string, role = "user"): AdminUser {
  return {
    id,
    name,
    email: `${id}@example.com`,
    role,
    onlineMode: "offline",
    createdAt: "2026-04-29T10:00:00.000Z",
  };
}

function row(u: AdminUser, coverage: { can: number; maybe: number }, zeroForDays?: number) {
  return (
    <UserRow
      key={u.id}
      user={u}
      coverage={{ ...coverage, total: 41 }}
      zeroForDays={zeroForDays}
      expanded={false}
      onToggleInventory={noop}
      onSetOnlineMode={noop}
      pending={false}
      onOpenCalendar={noop}
      onOpenActivity={noop}
      deleteMode={false}
      isSelf={false}
      confirmingDelete={false}
      confirmEmail=""
      onConfirmEmailChange={noop}
      onStartDelete={noop}
      onCancelDelete={noop}
      onCommitDelete={noop}
      deleting={false}
      onResetPassword={noop}
      resettingPassword={false}
    />
  );
}

export default function AdminInactivePreview() {
  const [showInactive, setShowInactive] = useState(true);
  return (
    <div className="mx-auto flex max-w-7xl flex-col p-6">
      <UsersTable loading={false} empty={false} deleteMode={false}>
        {row(mockUser("u1", "Mantas Kandratavičius", "admin"), { can: 1, maybe: 0 })}
        {row(mockUser("u2", "Jaqueline Binder"), { can: 15, maybe: 4 })}
        {row(mockUser("u3", "Victor Fajardo"), { can: 12, maybe: 7 })}
        {row(mockUser("u4", "Sarah Raines"), { can: 0, maybe: 0 }, 2)}
        {row(mockUser("u5", "Juliane Franzen"), { can: 0, maybe: 0 }, 5)}
        {row(mockUser("u6", "Eloïse Hosseini"), { can: 0, maybe: 0 }, 10)}
      </UsersTable>

      <div className="mt-6">
        <ExpandableAdminCard
          tone="amber"
          eyebrow="Inactive players"
          summary={`5 players at 0% availability for ${INACTIVE_AFTER_DAYS}+ days — they return to the table on any new mark, RSVP, or recorded match`}
          expanded={showInactive}
          onToggle={() => setShowInactive((v) => !v)}
        >
          <UsersTable loading={false} empty={false} deleteMode={false}>
            {row(mockUser("u7", "Linda Weiß"), { can: 0, maybe: 0 }, 119)}
            {row(mockUser("u8", "Johanna Bodner"), { can: 0, maybe: 0 }, 113)}
            {row(mockUser("u9", "Jens Schäfer"), { can: 0, maybe: 0 }, 47)}
            {row(mockUser("u10", "Paul Keppner"), { can: 0, maybe: 0 }, 30)}
            {row(mockUser("u11", "Aydan Guliyeva"), { can: 0, maybe: 0 }, 18)}
          </UsersTable>
        </ExpandableAdminCard>
      </div>
    </div>
  );
}
