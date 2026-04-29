import { Button } from "../ui/Button";

type Mode = "view" | "edit";

type Props = {
  mode: Mode;
  markedCount: number;
  saving: boolean;
  error: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
};

export function AvailabilityActionBar({
  mode,
  markedCount,
  saving,
  error,
  onEdit,
  onCancel,
  onSave,
}: Props) {
  return (
    <div className="sticky bottom-0 mt-3 flex shrink-0 flex-col items-center gap-2 border-t border-white/5 bg-surface-950/90 px-4 py-3 backdrop-blur sm:py-4">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {mode === "view" ? (
        <Button variant="primary" size="lg" onClick={onEdit}>
          Change my availability
        </Button>
      ) : (
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
            disabled={markedCount === 0}
            className="flex-1 whitespace-nowrap"
          >
            {saveLabel(markedCount)}
          </Button>
        </div>
      )}
    </div>
  );
}

function saveLabel(n: number): string {
  if (n === 0) return "Pick at least one day";
  if (n === 1) return "Wow, generous";
  if (n === 2) return "Really pushing it";
  if (n === 3) return "Bare minimum vibes";
  if (n === 4) return "Almost a real human";
  return `Save ${n} days`;
}
