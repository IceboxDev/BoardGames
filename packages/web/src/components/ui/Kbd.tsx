import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// Keyboard hint — the little "Space" / "←" / "Esc" key next to an action so a
// shortcut is discoverable without a help screen. Display-only: it never
// takes a click, and it always sits beside the control it explains.

type KbdProps = {
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
};

export function Kbd({ size = "xs", className, children }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[1.6em] items-center justify-center rounded-ui-md border border-line border-b-2 border-b-line-strong bg-fill px-1 font-mono font-medium text-fg-secondary",
        size === "xs" ? "h-4 text-3xs" : "h-5 text-2xs",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
