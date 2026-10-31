import type { ReactNode } from "react";
import { cn } from "../../../../lib/cn";

// The scroll container every trainer / wiki screen renders into. The play
// area's Layout is fixed-height with overflow hidden (the D&D tool pattern),
// so each screen owns its own scroll — on one flat sheet of paper, so the
// newspaper's fades and rules sit on the same colour everywhere.

const TRAINER_BG = "bg-surface-900";

type Props = {
  children: ReactNode;
  className?: string;
};

export function TrainerScreen({ children, className }: Props) {
  return (
    // overflow-x-hidden: nothing may pan the screen sideways on a phone.
    <div
      className={cn(
        "relative z-raised h-full overflow-y-auto overflow-x-hidden",
        TRAINER_BG,
        className,
      )}
    >
      {children}
    </div>
  );
}
