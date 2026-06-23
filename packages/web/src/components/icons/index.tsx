// Centralized icon set. Every icon is a small functional component that
// inherits color via `currentColor` and accepts a `className` for sizing.
// Adding a new icon? Drop it here so the same SVG isn't redefined across
// modals, cards, and lists. Pure presentational — no event handlers, no
// state, no aria; the parent labels the icon's container.

type IconProps = {
  className?: string;
};

const STROKE_BASE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function XIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 3l10 10M13 3l-10 10" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M10 3l-5 5 5 5" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function CheckIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2.5}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export function StarIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78L1.58 7.62l5.82-.85L10 1.5z" />
    </svg>
  );
}

export function FlameIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.4 1.6c-.3-.4-.9-.5-1.3-.2-.3.2-.5.6-.4 1 .3 1.7-.2 3-1.3 4-1.4 1.2-2.4 2.8-2.4 4.7 0 2.5 2 4.5 4 4.5s4-2 4-4.5c0-1.1-.4-2.1-1-2.9.7.3 1.5.4 2.3.2.4-.1.7-.5.7-.9 0-.3-.2-.6-.5-.7-1.7-.7-3.1-2.4-4.1-5.2zM8 12.5c-1 0-1.7-.8-1.7-1.7 0-.7.4-1.3 1-1.6.2.6.7 1 1.3 1 .4 0 .8-.2 1-.5.4.3.7.7.7 1.2 0 .9-.7 1.7-1.7 1.7z" />
    </svg>
  );
}

export function ClockIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  );
}

export function PinIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M8 14s5-4.5 5-8.5A5 5 0 0 0 3 5.5C3 9.5 8 14 8 14z" />
      <circle cx="8" cy="6" r="1.6" />
    </svg>
  );
}

export function HostIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M2 14l6-11 6 11" />
      <path d="M5 14V9h6v5" />
    </svg>
  );
}

export function BookIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 2.5h7.5A1.5 1.5 0 0 1 12 4v9.5H4.5A1.5 1.5 0 0 1 3 12V2.5z" />
      <path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H12" />
    </svg>
  );
}

export function PadlockIcon({
  closed = true,
  className = "h-4 w-4",
}: IconProps & { closed?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.8}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.5" />
      {closed ? (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      ) : (
        <path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" />
      )}
    </svg>
  );
}

export function StackIcon({ className = "h-3 w-3" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <rect x="3" y="6" width="10" height="7" rx="1" />
      <path d="M5 6V4.5h8V11" />
    </svg>
  );
}

export function LockIcon({ className = "h-4 w-4 opacity-70" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function GalleryIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.25" />
      <rect x="11" y="3" width="6" height="6" rx="1.25" />
      <rect x="3" y="11" width="6" height="6" rx="1.25" />
      <rect x="11" y="11" width="6" height="6" rx="1.25" />
    </svg>
  );
}

/**
 * Right-pointing arrow used as the title-row affordance on catalog/gallery
 * cards. Inherits color and lives in the same currentColor family as the
 * other icons; callers compose hover translate/color animations on the
 * surrounding link.
 */
export function ArrowRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Down-chevron used as expand/collapse affordance on the family card title
 * row. Toggles its rotation via a `rotate-180` class from the caller.
 */
export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Mode / setup glyphs. Filled, role-named icons used by the mode picker and
 * setup screens (AI opponent, solo, trainer, multiplayer, tournament).
 * Extracted from the inline SVGs that previously lived in ModeSelect so the
 * same paths aren't redefined per screen.
 */
export function BotIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 110 2h-1v1a3 3 0 01-3 3H7a3 3 0 01-3-3v-1H3a1 1 0 110-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM9.5 13a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
    </svg>
  );
}

export function UserIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

export function UsersIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

export function TrainerIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
    </svg>
  );
}

export function TrophyIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.659c0 2.457.82 4.776 2.312 6.644A17.1 17.1 0 009 11.874V15H7a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2v-3.126a17.1 17.1 0 002.688-2.396A11.413 11.413 0 0016 3.834v-.66a.75.75 0 00-.629-.739A33.668 33.668 0 0010 1zM5.5 3.06a31.17 31.17 0 019 0v.774a9.913 9.913 0 01-2.012 5.78A15.59 15.59 0 0110 11.96a15.59 15.59 0 01-2.488-2.346A9.913 9.913 0 015.5 3.834V3.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Pencil edit icon used by row-level inline-edit `<IconButton>` actions. */
export function EditIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M16.862 4.487l1.687 1.688a1.875 1.875 0 010 2.652L7.575 19.8a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L14.21 4.487a1.875 1.875 0 012.652 0z" />
    </svg>
  );
}

/** Trash / delete icon used by row-level destructive inline actions. */
export function TrashIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" />
    </svg>
  );
}

/** Plus glyph for stepper "+ Add" buttons and increment controls. */
export function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

/** Minus glyph for stepper decrement controls. */
export function MinusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Eye icon — admin "view as player" toggle. */
export function EyeIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={2.2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Shuffle icon used by setup screens to randomize role / opponent previews.
 * Different from the bigger PadlockIcon already in this file.
 */
export function ShuffleIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M16 3h5v5" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
      <path d="M16 21h5v-5" />
      <path d="M3 3l5.5 5.5" />
      <path d="M21 16L14.5 9.5" />
    </svg>
  );
}

// Six-dot drag affordance. Filled (not stroked) so it reads as a handle, not a
// glyph. Used by the admin match-reorder rows in the history screen.
export function GripVerticalIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="4" r="1.25" />
      <circle cx="10" cy="4" r="1.25" />
      <circle cx="6" cy="8" r="1.25" />
      <circle cx="10" cy="8" r="1.25" />
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="10" cy="12" r="1.25" />
    </svg>
  );
}

// Key — the admin "generate password-reset link" affordance.
export function KeyIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      strokeWidth={1.6}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <circle cx="5.5" cy="5.5" r="3" />
      <path d="M7.7 7.7 L13.5 13.5" />
      <path d="M11.5 11.5 L13 10" />
    </svg>
  );
}

// Four-point sparkle — the "skill profile coming soon" placeholder and other
// generated/aspirational affordances on the profile page.
export function SparkleIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 1.5c.3 2.7 1.3 3.7 4 4-2.7.3-3.7 1.3-4 4-.3-2.7-1.3-3.7-4-4 2.7-.3 3.7-1.3 4-4zM4.5 11c.2 1.6.8 2.2 2.3 2.4-1.5.2-2.1.8-2.3 2.4-.2-1.6-.8-2.2-2.3-2.4 1.5-.2 2.1-.8 2.3-2.4z" />
    </svg>
  );
}

// Heart — the wishlist section glyph (distinct from the favorites StarIcon).
export function HeartIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 17.5l-1.1-1C4.9 12.86 2.5 10.68 2.5 7.94 2.5 5.9 4.1 4.3 6.15 4.3c1.16 0 2.27.54 3 1.39.73-.85 1.84-1.39 3-1.39 2.05 0 3.65 1.6 3.65 3.64 0 2.74-2.4 4.92-6.4 8.56l-1.1 1z" />
    </svg>
  );
}

// Camera — the "change profile picture" affordance on the avatar.
export function CameraIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      strokeWidth={1.8}
      aria-hidden="true"
      {...STROKE_BASE}
    >
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
