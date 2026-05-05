import { Button } from "../ui/Button";

type Mode = "view" | "edit" | "lock";

type Props = {
  mode: Mode;
  markedCount: number;
  saving: boolean;
  error: string | null;
  showLockInButton: boolean;
  /** Admin-only debug toggle: render the calendar as if the user were a regular player. */
  showAdminToggle: boolean;
  adminViewActive: boolean;
  onToggleAdminView: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onEnterLockMode: () => void;
  onExitLockMode: () => void;
};

export function AvailabilityActionBar({
  mode,
  markedCount,
  saving,
  error,
  showLockInButton,
  showAdminToggle,
  adminViewActive,
  onToggleAdminView,
  onEdit,
  onCancel,
  onSave,
  onEnterLockMode,
  onExitLockMode,
}: Props) {
  return (
    <div className="relative shrink-0 flex flex-col items-center gap-2 border-t border-white/5 bg-surface-950/90 px-2 py-2 backdrop-blur sm:px-4">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {mode === "view" ? (
        <div className="flex w-full items-center gap-2 sm:max-w-md">
          {/* Mobile: inline admin toggle. Sits in the row so it can't collide
              with the main button. Hidden on sm+ — the absolute-positioned
              version below takes over there. */}
          {showAdminToggle && (
            <AdminToggleButton
              active={adminViewActive}
              onClick={onToggleAdminView}
              variant="inline"
            />
          )}
          <Button
            variant="primary"
            onClick={onEdit}
            className="flex-1 whitespace-nowrap px-4 py-2 text-sm sm:px-5 sm:py-3 sm:text-base"
          >
            Change my availability
          </Button>
          {showLockInButton && <LockInButton onClick={onEnterLockMode} variant="inline" />}
        </div>
      ) : mode === "edit" ? (
        <div className="flex w-full max-w-md items-center gap-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 whitespace-nowrap"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onSave}
            loading={saving}
            className="flex-1 whitespace-nowrap"
          >
            {saveLabel(markedCount)}
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onExitLockMode}
            className="w-full whitespace-nowrap bg-amber-500 hover:bg-amber-400"
          >
            Exit lock-in mode
          </Button>
        </div>
      )}
      {/* Desktop: absolute-positioned admin toggle so the centered main button
          stays perfectly centered regardless of side-button widths. */}
      {showAdminToggle && mode === "view" && (
        <AdminToggleButton
          active={adminViewActive}
          onClick={onToggleAdminView}
          variant="floating"
        />
      )}
      {showLockInButton && mode === "view" && (
        <LockInButton onClick={onEnterLockMode} variant="floating" />
      )}
    </div>
  );
}

function AdminToggleButton({
  active,
  onClick,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  variant: "inline" | "floating";
}) {
  const positionClass =
    variant === "floating"
      ? "absolute left-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
      : "inline-flex sm:hidden";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${active ? "Disable" : "Enable"} admin view`}
      aria-pressed={active}
      className={`${positionClass} shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition sm:px-2.5 ${
        active
          ? "border-accent-400/60 bg-accent-500/15 text-accent-300 hover:bg-accent-500/25"
          : "border-white/15 text-gray-400 hover:border-white/30 hover:bg-white/5"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="hidden sm:inline">{active ? "Admin" : "Player"}</span>
    </button>
  );
}

function LockInButton({
  onClick,
  variant,
}: {
  onClick: () => void;
  variant: "inline" | "floating";
}) {
  const positionClass =
    variant === "floating"
      ? "absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
      : "inline-flex sm:hidden";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Enter lock-in mode"
      className={`${positionClass} shrink-0 items-center gap-1.5 rounded-md border border-amber-400/30 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-400/10 sm:px-2.5`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="9" rx="1.5" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span className="hidden sm:inline">Lock-in</span>
    </button>
  );
}

function saveLabel(n: number): string {
  if (n === 0) return "Save: ghosting all of you";
  if (n === 1) return "Wow, generous";
  if (n === 2) return "Really pushing it";
  if (n === 3) return "Bare minimum vibes";
  if (n === 4) return "Almost a real human";
  return `Save ${n} days`;
}
