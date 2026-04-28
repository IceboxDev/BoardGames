import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { authClient, useSession } from "../lib/auth-client";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { data } = useSession();
  const user = data?.user as
    | { name?: string; email?: string; role?: string; onlineEnabled?: boolean }
    | undefined;

  const onlineUnlocked = Boolean(user?.onlineEnabled);
  const isAdmin = user?.role === "admin";

  async function handleSignOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 bg-grid">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <h1 className="text-sm font-semibold tracking-tight text-gray-200">Board Game Lab</h1>
        <div className="flex items-center gap-3 text-sm">
          {isAdmin && (
            <Link
              to="/admin"
              className="rounded-md px-3 py-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md px-3 py-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-12 text-center">
          <p className="text-xs uppercase tracking-widest text-accent-400">Welcome</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {user?.name ? user.name.split(" ")[0] : "Player"}
          </h2>
          <p className="mt-3 text-sm text-gray-500">Choose how you'd like to play.</p>
        </div>

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

        {!onlineUnlocked && (
          <p className="mt-8 text-center text-xs text-gray-500">
            Your account is signed in but online play hasn't been unlocked for you yet. The
            administrator can grant access from the admin panel.
          </p>
        )}
      </main>
    </div>
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
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="!h-auto flex-col items-start gap-1 px-6 py-6 text-left"
    >
      <span className="flex w-full items-center justify-between">
        <span className="text-xl font-semibold">{title}</span>
        {locked && <LockIcon />}
      </span>
      <span className="text-xs font-normal opacity-70">{subtitle}</span>
    </Button>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 opacity-70"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
