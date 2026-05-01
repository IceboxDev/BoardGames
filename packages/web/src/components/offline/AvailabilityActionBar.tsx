import { Button } from "../ui/Button";

type Mode = "view" | "edit" | "lock";

type Props = {
  mode: Mode;
  markedCount: number;
  saving: boolean;
  error: string | null;
  showLockInButton: boolean;
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
  onEdit,
  onCancel,
  onSave,
  onEnterLockMode,
  onExitLockMode,
}: Props) {
  return (
    <div className="relative shrink-0 flex flex-col items-center gap-2 border-t border-white/5 bg-surface-950/90 px-4 py-2 backdrop-blur">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {mode === "view" ? (
        <div className="flex w-full max-w-md items-center gap-2">
          <Button variant="primary" size="lg" onClick={onEdit} className="flex-1 whitespace-nowrap">
            Change my availability
          </Button>
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
      {showLockInButton && (
        <button
          type="button"
          onClick={onEnterLockMode}
          aria-label="Enter lock-in mode"
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-400/10"
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
      )}
    </div>
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
