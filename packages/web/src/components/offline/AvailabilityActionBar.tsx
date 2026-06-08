import { EyeIcon, PadlockIcon } from "../icons";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

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
          {/* Admin "view as player" toggle + lock-in entry. In-flow beside the
              main button on phone; absolutely pinned to the bar edges at sm+ so
              the main button stays centered (positioning lives in the buttons). */}
          {showAdminToggle && (
            <AdminToggleButton active={adminViewActive} onClick={onToggleAdminView} />
          )}
          <Button
            variant="primary"
            onClick={onEdit}
            className="flex-1 whitespace-nowrap px-4 py-2 text-sm sm:px-5 sm:py-3 sm:text-base"
          >
            Change my availability
          </Button>
          {showLockInButton && <LockInButton onClick={onEnterLockMode} />}
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
        <div className="flex w-full flex-col items-center gap-2 sm:max-w-md">
          <Button
            variant="primary"
            onClick={onExitLockMode}
            className="w-full whitespace-nowrap bg-amber-500 px-4 py-2 text-sm hover:bg-amber-400 sm:px-5 sm:py-3 sm:text-base"
          >
            Exit lock-in mode
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Chip
      pressed={active}
      tone="accent"
      variant="outlined"
      size="sm"
      onClick={onClick}
      aria-label={`${active ? "Disable" : "Enable"} admin view`}
      icon={<EyeIcon className="h-3.5 w-3.5" />}
      className="shrink-0 uppercase tracking-[0.16em] sm:absolute sm:left-3 sm:top-1/2 sm:-translate-y-1/2"
    >
      <span className="hidden sm:inline">{active ? "Admin" : "Player"}</span>
    </Chip>
  );
}

function LockInButton({ onClick }: { onClick: () => void }) {
  return (
    <Chip
      pressed
      tone="amber"
      variant="outlined"
      size="sm"
      ring={false}
      onClick={onClick}
      aria-label="Enter lock-in mode"
      icon={<PadlockIcon closed className="h-3.5 w-3.5" />}
      className="shrink-0 uppercase tracking-[0.16em] sm:absolute sm:right-3 sm:top-1/2 sm:-translate-y-1/2"
    >
      <span className="hidden sm:inline">Lock-in</span>
    </Chip>
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
