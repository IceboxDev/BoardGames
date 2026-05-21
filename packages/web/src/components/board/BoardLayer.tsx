import type { ReactNode } from "react";

interface Props {
  /** Layer name for debugging (renders as `data-layer="…"`). */
  name: string;
  /** Documentation-only z-order hint. SVG paints in DOM order; place children accordingly. */
  z?: number;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
  children: ReactNode;
}

export default function BoardLayer({
  name,
  z,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
  children,
}: Props) {
  return (
    <g data-layer={name} data-z={z} aria-label={ariaLabel} aria-hidden={ariaHidden}>
      {children}
    </g>
  );
}
