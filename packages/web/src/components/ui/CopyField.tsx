import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "./Button";

// Read-only copy-to-clipboard field: a selectable URL/token plus a Copy
// button with a self-resetting "Copied" state. The admin reset-link modal and
// the calendar-sync modal each hand-built this widget with different chrome,
// different reset delays, and (in one case) a timeout leaked on unmount. The
// raw <input> here IS the primitive — it's a display surface, not a form
// control, so it deliberately doesn't compose ui/Input.

type CopyFieldProps = {
  value: string;
  /** Accessible name for the field ("Password reset link"). */
  ariaLabel: string;
  /** Monospace the value (tokens, one-time links). */
  mono?: boolean;
};

export function CopyField({ value, ariaLabel, mono = false }: CopyFieldProps) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-950/60 px-2 py-1.5">
      <input
        type="text"
        readOnly
        value={value}
        aria-label={ariaLabel}
        // Focus-select so the value stays manually copyable when the
        // clipboard API is blocked.
        onFocus={(e) => e.currentTarget.select()}
        className={`min-w-0 flex-1 truncate bg-transparent px-2 text-xs text-fg-primary outline-none ${
          mono ? "font-mono" : ""
        }`}
      />
      <Button variant="secondary" size="sm" onClick={() => void copy(value)} className="shrink-0">
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
