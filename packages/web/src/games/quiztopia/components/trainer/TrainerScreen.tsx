import type { ReactNode } from "react";
import { cn } from "../../../../lib/cn";

// The scroll container every trainer / wiki screen renders into. The play
// area's Layout is fixed-height with overflow hidden (the D&D tool pattern),
// so each screen owns its own scroll — and the night gradient behind the
// city, so the skyline reads the same on the hub, the card and the archive.

const TRAINER_BG = "bg-gradient-to-b from-surface-900 to-surface-950";

type Props = {
  children: ReactNode;
  className?: string;
};

export function TrainerScreen({ children, className }: Props) {
  return (
    <div className={cn("relative z-raised h-full overflow-y-auto", TRAINER_BG, className)}>
      {children}
    </div>
  );
}
