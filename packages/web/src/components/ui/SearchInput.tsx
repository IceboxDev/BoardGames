import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { SearchIcon } from "../icons";
import { Input } from "./Input";

// ── SearchInput ──────────────────────────────────────────────────────────
//
// An `Input` with the leading magnifier. Six list screens had each positioned
// the icon by hand (left-2.5 vs left-3, h-3.5 vs h-4 vs default, pl-8 vs
// pl-9); this is the one geometry. `type="search"` so browsers that draw a
// native clear affordance may, and assistive tech announces the role.
//
// Takes every `Input` prop. Size the field from the OUTSIDE via
// `containerClassName` (`flex-1`, `sm:max-w-xs`, `w-full sm:w-64`) — the
// wrapper is the positioning context for the icon, so width belongs on it.

type SearchInputProps = Omit<ComponentProps<typeof Input>, "type" | "width"> & {
  containerClassName?: string;
};

export function SearchInput({ containerClassName, className, ...rest }: SearchInputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
      />
      <Input type="search" className={cn("pl-8", className)} {...rest} />
    </div>
  );
}
