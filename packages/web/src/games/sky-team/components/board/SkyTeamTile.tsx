import type { DieValue, PlayerIndex } from "@boardgames/core/games/sky-team/types";
import type { ReactNode } from "react";

export type TileVariant = "pilot" | "copilot" | "mixed";

export { tileValueLabel } from "./tile-label";

interface Props {
  variant: TileVariant;
  /** Static label rendered when no die is placed (e.g. "1/2", "Engine"). */
  label?: ReactNode;
  /** When provided, replaces the label with a placed-die chip. */
  placedDie?: { color: "blue" | "orange"; value: DieValue; owner?: PlayerIndex } | null;
  /** Pulse with the legal-target ring when truthy. */
  selectable?: boolean;
  /** Make the tile act as a button when an onSelect is provided. */
  onSelect?: () => void;
  /** Optional SVG/icon to render inside the tile (used by mixed-coffee tiles). */
  children?: ReactNode;
  "aria-label"?: string;
}

/**
 * One Sky Team control-panel tile — pilot navy, copilot orange, or mixed
 * 50/50 — with optional switch indicator and placed-die chip. Matches
 * `sky-team-lab/board.css` `.tile` 1:1 (same gradients, shadows, ink colors).
 *
 * Sizing comes from the surrounding `.cockpit-tile-shell` container; the tile
 * always fills it 100% × 100% and uses `cqi` units internally so chrome
 * scales with the board.
 */
export default function SkyTeamTile({
  variant,
  label,
  placedDie,
  selectable,
  onSelect,
  children,
  "aria-label": ariaLabel,
}: Props) {
  const classes = [
    "cockpit-tile",
    `cockpit-tile--${variant}`,
    onSelect ? "cockpit-tile--interactive" : "",
    selectable ? "cockpit-tile--selectable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {placedDie ? (
        <span className={`cockpit-placed-die cockpit-placed-die--${placedDie.color}`}>
          {placedDie.value}
        </span>
      ) : (
        label
      )}
      {children}
    </>
  );

  if (onSelect) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: game-piece tile carries its own gradient/shadow/ink chrome; <Button> would override them.
      <button
        type="button"
        className={classes}
        onClick={onSelect}
        aria-label={ariaLabel}
        aria-pressed={placedDie != null}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} role="img" aria-label={ariaLabel}>
      {content}
    </span>
  );
}
