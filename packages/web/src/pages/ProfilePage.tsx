import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightIcon, LockIcon, UserIcon, UsersIcon } from "../components/icons";
import CalendarSyncCard from "../components/profile/CalendarSyncCard";
import CalendarSyncModal from "../components/profile/CalendarSyncModal";
import { TopNav, TopNavLink } from "../components/TopNav";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { PageShell } from "../components/ui/PageShell";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { authClient } from "../lib/auth-client";

export default function ProfilePage() {
  const navigate = useNavigate();
  // `useCurrentUser` is the only sanctioned read of session state — it
  // narrows the untyped better-auth payload through `SessionUserSchema`
  // so the fields we touch here (`name`, `onlineMode`, `isAdmin`) are
  // guaranteed to match the wire-protocol contract.
  const { user, isAdmin } = useCurrentUser();
  const userId = user?.id ?? null;
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  // Online mode 'online' or 'both' unlocks multiplayer; 'offline' keeps it
  // locked. (The button itself is always shown; only `locked` flips.)
  const onlineUnlocked = user?.onlineMode !== undefined && user.onlineMode !== "offline";
  // Profiles are an offline-players feature — hidden from online-only users.
  const profilesVisible = user?.onlineMode !== "online";

  async function handleSignOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <PageShell
      layout="centered"
      topNav={
        <TopNav>
          {isAdmin && <TopNavLink to="/admin">Admin</TopNavLink>}
          <TopNavLink onClick={handleSignOut}>Sign out</TopNavLink>
        </TopNav>
      }
    >
      <div className="w-full max-w-3xl">
        <PageHeader
          align="center"
          size="xl"
          eyebrow="Welcome"
          title={user?.name ? user.name.split(" ")[0] : "Player"}
          subtitle="Choose how you'd like to play."
          className="mb-12"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeButton
            title="Online"
            subtitle={onlineUnlocked ? "Multiplayer & live games" : "Locked — ask the admin"}
            locked={!onlineUnlocked}
            onClick={() => navigate("/games")}
            accent
          />
          <ModeButton
            title="Offline"
            subtitle="Plan in-person game nights"
            onClick={() => navigate("/offline")}
          />
        </div>

        {profilesVisible && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NavCard
              icon={<UserIcon className="h-4 w-4" />}
              title="My profile"
              subtitle="Library, stats & badges"
              onClick={() => userId && navigate(`/u/${userId}`)}
            />
            <NavCard
              icon={<UsersIcon className="h-4 w-4" />}
              title="Players"
              subtitle="Browse the group"
              onClick={() => navigate("/players")}
            />
          </div>
        )}

        <CalendarSyncCard onClick={() => setSyncModalOpen(true)} />

        {!onlineUnlocked && (
          <p className="mt-8 text-center text-xs text-fg-muted">
            Your account is signed in but online play hasn't been unlocked for you yet. The
            administrator can grant access from the admin panel.
          </p>
        )}
      </div>

      {syncModalOpen && <CalendarSyncModal onClose={() => setSyncModalOpen(false)} />}
    </PageShell>
  );
}

type ModeButtonProps = {
  title: string;
  subtitle: string;
  locked?: boolean;
  accent?: boolean;
  onClick?: () => void;
};

function ModeButton({ title, subtitle, locked, accent, onClick }: ModeButtonProps) {
  const disabled = locked || !onClick;
  return (
    <Button
      type="button"
      variant={accent && !disabled ? "primary" : "secondary"}
      align="start"
      block
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="px-6 py-6 text-left"
    >
      <span className="flex w-full flex-col items-start gap-1">
        <span className="flex w-full items-center justify-between">
          <span className="text-xl font-semibold">{title}</span>
          {locked && <LockIcon />}
        </span>
        <span className="text-xs font-normal opacity-70">{subtitle}</span>
      </span>
    </Button>
  );
}

type NavCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
};

function NavCard({ icon, title, subtitle, onClick }: NavCardProps) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: card-shaped clickable surface, mirrors CalendarSyncCard
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-surface-900/60 px-5 py-4 text-left transition-all duration-300 hover:border-white/15 hover:bg-surface-900"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-fg-secondary transition-colors group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg-primary group-hover:text-white">
          {title}
        </span>
        <span className="block text-xs text-fg-muted">{subtitle}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-300" />
    </button>
  );
}
