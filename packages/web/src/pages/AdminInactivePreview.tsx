import { useState } from "react";
import { InactiveToggleRow, UserRow, UsersTable } from "../components/admin";
import type { AdminUser } from "../components/admin/types";

// Dev-only preview of the admin table's inactive-players expander — active
// rows untagged, a barely-there "Show N inactive players" text row at the
// foot, and the archived rows (with their "Nd at 0%" tag) continuing the
// same table and sort direction when expanded. Mock rows, no auth/queries.
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

function Demo({ title, expandedInitially }: { title: string; expandedInitially: boolean }) {
  const [showInactive, setShowInactive] = useState(expandedInitially);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
      <UsersTable loading={false} empty={false} deleteMode={false}>
        {row(mockUser("u1", "Mantas Kandratavičius", "admin"), { can: 1, maybe: 0 })}
        {row(mockUser("u2", "Jaqueline Binder"), { can: 15, maybe: 4 })}
        {row(mockUser("u3", "Aydan Guliyeva"), { can: 12, maybe: 6 })}
        {row(mockUser("u4", "Eloïse Hosseini"), { can: 0, maybe: 0 })}
        {row(mockUser("u5", "Sarah Raines"), { can: 0, maybe: 0 })}
        <InactiveToggleRow
          count={4}
          expanded={showInactive}
          onToggle={() => setShowInactive((v) => !v)}
        />
        {showInactive && (
          <>
            {row(mockUser("u6", "Paul Keppner"), { can: 0, maybe: 0 }, 30)}
            {row(mockUser("u7", "Jens Schäfer"), { can: 0, maybe: 0 }, 47)}
            {row(mockUser("u8", "Johanna Bodner"), { can: 0, maybe: 0 }, 65)}
            {row(mockUser("u9", "Linda Weiß"), { can: 0, maybe: 0 }, 109)}
          </>
        )}
      </UsersTable>
    </div>
  );
}

export default function AdminInactivePreview() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 p-6">
      <Demo title="Collapsed (default)" expandedInitially={false} />
      <Demo title="Expanded" expandedInitially />
    </div>
  );
}
