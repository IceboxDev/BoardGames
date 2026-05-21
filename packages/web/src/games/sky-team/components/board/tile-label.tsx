import type { DieValue } from "@boardgames/core/games/sky-team/types";
import type { ReactNode } from "react";

/** Render an allowedValues array as a tile label — `[1,2]` → `"1/2"` with the
 *  slash typeset smaller, matching `sky-team-lab/index.html` `.tile small`. */
export function tileValueLabel(values: readonly DieValue[]): ReactNode {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return (
    <>
      {values[0]}
      <small>/</small>
      {values[values.length - 1]}
    </>
  );
}
