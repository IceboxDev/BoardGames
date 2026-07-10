import type { CSSProperties } from "react";
import { initialsFromName } from "../../lib/names.ts";

// Avatar primitive: renders the user's `image` when present, otherwise an
// initials monogram (first + last initial, via the shared `initialsFromName`).
// Avatars are generated/assigned out-of-band and stored on `user.image`.
// Optional `accentHex` tints the monogram + ring to the user's profile accent.
//
// Every surface that IDENTIFIES a person routes through here: ProfileHeader,
// PlayerCard, the RSVP attendee list, and the D&D party roster. The one
// deliberate exception is `history/AvatarBubble`, whose surface encodes match
// outcome and team rather than identity — see its header comment.
//
// Callers whose payload carries no `image` (the calendar `Attendee` wire type)
// simply get the monogram; when the server starts sending `image` on those
// endpoints, they light up here with no call-site change.

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

type AvatarProps = {
  name: string;
  image?: string | null;
  accentHex?: string | null;
  size?: AvatarSize;
  /** Add an accent ring around the avatar. */
  ring?: boolean;
  className?: string;
};

const SIZE: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-3xs",
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

export function Avatar({
  name,
  image,
  accentHex,
  size = "md",
  ring = false,
  className = "",
}: AvatarProps) {
  const sizeCls = SIZE[size];
  const ringCls = ring
    ? "ring-2 ring-[var(--avatar-accent)]/60 ring-offset-2 ring-offset-surface-950"
    : "";
  const style = { "--avatar-accent": accentHex ?? "#6366f1" } as CSSProperties;

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        loading="lazy"
        decoding="async"
        style={style}
        className={`${sizeCls} ${ringCls} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={style}
      className={`${sizeCls} ${ringCls} inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--avatar-accent)]/20 font-bold uppercase text-[var(--avatar-accent)] ${className}`}
    >
      {initialsFromName(name)}
    </span>
  );
}
