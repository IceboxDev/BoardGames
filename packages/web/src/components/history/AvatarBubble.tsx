/**
 * Compact avatar bubble for participants in match-history rows.
 *
 * ── Relationship to `ui/Avatar` ──────────────────────────────────────────
 * This is NOT a duplicate of `Avatar`, and it deliberately does not wrap it.
 * `Avatar` answers "who is this person" — it shows their photo when they have
 * one, else a tinted monogram. `AvatarBubble` answers "how did this person do
 * in this match" — its entire surface is a data channel (background gradient =
 * tone × team, ring = team, caret = you), which a photo would obliterate at
 * 24px. Two components, two questions.
 *
 * What they DO share is the identity rule: both derive their monogram from
 * `initialsFromName` (first + last initial), so the same person never renders
 * as "A" here and "AB" there. That helper is the single source of truth; do not
 * re-implement `name[0]` anywhere.
 *
 * Visual encoding is split across non-overlapping CSS axes so the signals
 * never fight each other:
 *
 *   1. Background gradient — driven by tone × team. Winners get a warm gold
 *      gradient with a corner tint in the team's hue; losers get a dark base
 *      with a team-coloured corner sweep. Pure tone fallback (no team) keeps
 *      the original gold/dark palette.
 *   2. Ring (1px outer halo) — team colour. Replaces the tone's neutral ring
 *      so the team identity reads from a quick glance at the silhouette.
 *   3. Initials colour — stays in the tone's natural palette (amber-50 for
 *      winners, light gray for losers). No more emerald letters fighting the
 *      gold winner background.
 *   4. Self-highlight — a tiny white arrow tucked below the bubble pointing
 *      up at it. Sits outside the ring so it never crowds the team colour and
 *      reads as "this is you" regardless of tone or team.
 */

import { initialsFromName } from "../../lib/names.ts";

type Tone = "winner" | "loser" | "muted";
type Accent = "good" | "evil" | "village" | "wolf" | "tanner" | "neutral";
type TeamAccent = Exclude<Accent, "neutral">;

const SIZE_CLASS = {
  sm: "h-6 w-6 text-3xs",
  md: "h-7 w-7 text-2xs",
} as const;

// Winner gold gradient — saturated enough to read as actual gold, not muted
// amber. The team accent only sweeps into the bottom-right at low opacity so
// it tints rather than competes with the gold.
const WINNER_BG: Record<Accent, string> = {
  good: "bg-gradient-to-br from-amber-200/55 via-amber-400/45 to-emerald-500/28",
  village: "bg-gradient-to-br from-amber-200/55 via-amber-400/45 to-emerald-500/28",
  evil: "bg-gradient-to-br from-amber-200/55 via-amber-400/45 to-rose-500/28",
  wolf: "bg-gradient-to-br from-amber-200/55 via-amber-400/45 to-rose-500/28",
  tanner: "bg-gradient-to-br from-amber-200/55 via-amber-400/45 to-fuchsia-500/28",
  neutral: "bg-gradient-to-br from-amber-200/55 via-amber-400/50 to-amber-600/40",
};

// Loser dark base with a team-coloured corner so losers identify their team
// even at the smallest size. Neutral stays flat dark.
const LOSER_BG: Record<Accent, string> = {
  good: "bg-gradient-to-br from-emerald-900/55 via-surface-800 to-surface-800",
  village: "bg-gradient-to-br from-emerald-900/55 via-surface-800 to-surface-800",
  evil: "bg-gradient-to-br from-rose-900/55 via-surface-800 to-surface-800",
  wolf: "bg-gradient-to-br from-rose-900/55 via-surface-800 to-surface-800",
  tanner: "bg-gradient-to-br from-fuchsia-900/55 via-surface-800 to-surface-800",
  neutral: "bg-surface-800",
};

const MUTED_BG = "bg-surface-900";

const TONE_TEXT: Record<Tone, string> = {
  winner: "text-amber-50",
  loser: "text-fg-primary",
  muted: "text-fg-muted",
};

// Ring colour expresses team affiliation; falls back to a neutral tone ring
// when no team is in play.
const TEAM_RING: Record<TeamAccent, string> = {
  good: "ring-1 ring-emerald-400/70",
  village: "ring-1 ring-emerald-400/70",
  evil: "ring-1 ring-rose-400/70",
  wolf: "ring-1 ring-rose-400/70",
  tanner: "ring-1 ring-fuchsia-400/70",
};

const TONE_RING_FALLBACK: Record<Tone, string> = {
  winner: "ring-1 ring-amber-400/60",
  loser: "ring-1 ring-white/15",
  muted: "ring-1 ring-white/5",
};

type Props = {
  name: string;
  tone?: Tone;
  size?: keyof typeof SIZE_CLASS;
  /** Tooltip override; defaults to the full name. */
  title?: string;
  /** Marks the bubble as the logged-in user. Adds an outer accent halo. */
  isMe?: boolean;
  /** Team-alignment colour applied to the ring + a tint in the background. */
  accent?: Accent;
};

export function AvatarBubble({
  name,
  tone = "loser",
  size = "md",
  title,
  isMe = false,
  accent = "neutral",
}: Props) {
  const bg = tone === "winner" ? WINNER_BG[accent] : tone === "loser" ? LOSER_BG[accent] : MUTED_BG;
  const ring = accent !== "neutral" ? TEAM_RING[accent] : TONE_RING_FALLBACK[tone];
  return (
    <span
      title={isMe ? `${title ?? name} (you)` : (title ?? name)}
      role="img"
      aria-label={isMe ? `${name} (you)` : name}
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-bold ${SIZE_CLASS[size]} ${bg} ${ring} ${TONE_TEXT[tone]}`}
    >
      <span aria-hidden="true">{initialsFromName(name)}</span>
      {isMe && (
        // Small white caret sitting just below the bubble, pointing up at it.
        // SVG (not unicode) so its size and stroke stay consistent across
        // browsers and fonts.
        <svg
          aria-hidden="true"
          viewBox="0 0 8 6"
          className="pointer-events-none absolute -bottom-[6px] left-1/2 h-1.5 w-2 -translate-x-1/2 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
          fill="currentColor"
        >
          <polygon points="4,0 8,6 0,6" />
        </svg>
      )}
    </span>
  );
}
