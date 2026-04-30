import { Button } from "../ui/Button";

type Mode = "view" | "edit" | "lock";

type Props = {
  mode: Mode;
  markedCount: number;
  saving: boolean;
  error: string | null;
  isAdmin: boolean;
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
  isAdmin,
  onEdit,
  onCancel,
  onSave,
  onEnterLockMode,
  onExitLockMode,
}: Props) {
  return (
    <div className="sticky bottom-0 mt-3 flex shrink-0 flex-col items-center gap-2 border-t border-white/5 bg-surface-950/90 px-4 py-3 backdrop-blur sm:py-4">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {mode === "view" ? (
        <div className="flex w-full max-w-md items-center gap-2">
          <Button variant="primary" size="lg" onClick={onEdit} className="flex-1 whitespace-nowrap">
            Change my availability
          </Button>
          {isAdmin && (
            <button
              type="button"
              onClick={onEnterLockMode}
              className="shrink-0 rounded-md border border-amber-400/40 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200 transition hover:bg-amber-400/10"
            >
              Lock mode
            </button>
          )}
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
            Exit lock mode
          </Button>
        </div>
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
