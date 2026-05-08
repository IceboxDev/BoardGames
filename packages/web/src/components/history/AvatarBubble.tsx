/**
 * Compact avatar bubble for participants in match-history rows. Mirrors the
 * style of `AttendeesView`'s host/attendee avatars, but uses a two-letter
 * monogram (first letter of first name + first letter of last name) so two
 * users sharing a first initial don't collapse onto each other.
 */

type Tone = "winner" | "loser" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  winner: "bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/60",
  loser: "bg-surface-800 text-gray-300 ring-1 ring-white/10",
  muted: "bg-surface-800 text-gray-500 ring-1 ring-white/5",
};

const SIZE_CLASS = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-7 w-7 text-[11px]",
} as const;

type Props = {
  name: string;
  tone?: Tone;
  size?: keyof typeof SIZE_CLASS;
  /** Tooltip override; defaults to the full name. */
  title?: string;
};

export function AvatarBubble({ name, tone = "loser", size = "md", title }: Props) {
  return (
    <span
      title={title ?? name}
      role="img"
      aria-label={name}
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    return (w.length === 1 ? w : w.slice(0, 2)).toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}
