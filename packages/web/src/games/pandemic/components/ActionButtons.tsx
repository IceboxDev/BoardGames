import { Button } from "../../../components/ui/Button";
import type { ActionButton, ActionKind } from "../action-buttons";

interface Props {
  buttons: ActionButton[];
  actionsRemaining: number;
  activeAction: ActionKind | null;
  onAction: (kind: ActionKind) => void;
}

/**
 * Right-hand action panel. Replaces the canvas-era `action-panel-layer.ts`
 * with real `<Button>` primitives so the buttons inherit the app's focus
 * ring, disabled styling, and a11y semantics for free.
 *
 * `activeAction` highlights the button whose action is currently in
 * destination-pick mode (e.g. user clicked Charter Flight; the city map
 * is showing legal destinations). The button itself stays visible so the
 * user can re-click to cancel.
 */
export default function ActionButtons({
  buttons,
  actionsRemaining,
  activeAction,
  onAction,
}: Props) {
  if (buttons.length === 0) return null;
  return (
    <aside
      aria-label="Player actions"
      className="pointer-events-auto flex w-44 flex-col gap-1.5 rounded-lg border border-white/10 bg-black/75 p-2 text-xs backdrop-blur-sm"
    >
      <header className="text-center text-[11px] font-semibold text-white">
        Actions: {actionsRemaining}/4
      </header>
      {buttons.map((b) => (
        <Button
          key={b.actionKind}
          variant={activeAction === b.actionKind ? "primary" : "secondary"}
          size="xs"
          block
          disabled={!b.enabled}
          onClick={() => onAction(b.actionKind)}
        >
          {b.label}
        </Button>
      ))}
    </aside>
  );
}
