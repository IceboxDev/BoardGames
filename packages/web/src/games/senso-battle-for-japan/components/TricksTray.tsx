import { MicroLabel } from "../../../components/ui";
import { SensoCardBack } from "./SensoCard";

/**
 * Fills the fan slot while the hand is empty (rewards / bonus): the conflicts
 * this seat won, face down, like the physical pile in front of a player.
 * `GameScreen` renders `fanActions` only when `fan` is set, so this keeps the
 * reward controls on screen.
 */
export default function TricksTray({ count }: { count: number }) {
  const shown = Math.min(count, 7);
  return (
    <div className="flex h-24 items-center justify-center gap-4">
      <MicroLabel>Conflicts won</MicroLabel>
      <div className="flex items-end">
        {Array.from({ length: shown }, (_, i) => (
          <SensoCardBack
            // biome-ignore lint/suspicious/noArrayIndexKey: identical face-down stacks
            key={i}
            size="mini"
            className={i > 0 ? "-ml-5" : undefined}
          />
        ))}
      </div>
      <span className="text-lg font-bold tabular-nums text-fg-strong">{count}</span>
    </div>
  );
}
