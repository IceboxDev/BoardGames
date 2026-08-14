// ── Tones ────────────────────────────────────────────────────────────────
//
// THE tone vocabulary. Every primitive that takes a color-role prop types it
// from here, so "rose means the same rose everywhere" is a compiler guarantee
// instead of five near-identical unions that drift (ChipTone / SegmentedTone /
// BadgeTone / EyebrowTone were four separate declarations before this file).
//
//   Tone     — the full palette, including display-only hues (purple / orange /
//              cyan) and the no-color "neutral".
//   CoreTone — the interactive subset every stateful control supports
//              (Chip, SegmentedControl, SelectableCard active states).
//
// Naming rule: the no-color member is ALWAYS "neutral" (never "muted",
// "default", or "plain") and the destructive hue is ALWAYS "rose" (variants
// like Button's `danger` are aliases that resolve to it).
//
// The class maps below are the shared *recipes*. Component-specific
// treatments (SelectableCard's hover border, IconButton's ghost text) stay in
// their components — but typed on these unions — so adding a tone here
// surfaces every map that needs the new entry as a compile error.

export type Tone =
  | "accent"
  | "amber"
  | "sky"
  | "emerald"
  | "rose"
  | "purple"
  | "orange"
  | "cyan"
  | "neutral";

export type CoreTone = Extract<Tone, "accent" | "amber" | "sky" | "emerald" | "rose">;

// Soft "bubble" fill — low-opacity tint + light text. Status pills (Badge),
// icon bubbles (EmptyState), achievement bubbles. Color classes are written
// as full literals: Tailwind cannot see a class assembled at runtime.
export const TONE_BUBBLE: Record<Tone, string> = {
  accent: "bg-accent-500/15 text-accent-300",
  amber: "bg-amber-400/20 text-amber-200",
  sky: "bg-sky-400/15 text-sky-200",
  emerald: "bg-emerald-500/15 text-emerald-300",
  rose: "bg-rose-500/15 text-rose-300",
  purple: "bg-purple-500/15 text-purple-300",
  orange: "bg-orange-500/15 text-orange-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  neutral: "bg-white/[0.06] text-fg-secondary",
};

// Hairline advisory ring in the tone's hue (Badge `ring`, Chip active ring).
export const TONE_RING: Record<Tone, string> = {
  accent: "ring-1 ring-accent-400/40",
  amber: "ring-1 ring-amber-400/40",
  sky: "ring-1 ring-sky-400/40",
  emerald: "ring-1 ring-emerald-400/40",
  rose: "ring-1 ring-rose-400/40",
  purple: "ring-1 ring-purple-400/40",
  orange: "ring-1 ring-orange-400/40",
  cyan: "ring-1 ring-cyan-400/40",
  neutral: "ring-1 ring-white/10",
};

// Strong emphasis ring — SegmentedControl's `emphasizeActive` switches.
export const TONE_RING_STRONG: Record<CoreTone, string> = {
  accent: "ring-1 ring-accent-400/60",
  amber: "ring-1 ring-amber-300/60",
  sky: "ring-1 ring-sky-300/60",
  emerald: "ring-1 ring-emerald-300/60",
  rose: "ring-1 ring-rose-300/60",
};

// Pressed/selected fill for interactive controls. Chip and SegmentedControl
// previously each declared this map "mirroring" the other and had already
// drifted on accent/amber/sky/emerald; this is the single canonical recipe.
export const TONE_ACTIVE: Record<CoreTone, string> = {
  accent: "bg-accent-500/20 text-accent-100",
  amber: "bg-amber-500/20 text-amber-200",
  sky: "bg-sky-400/20 text-sky-100",
  emerald: "bg-emerald-500/20 text-emerald-100",
  rose: "bg-rose-500/20 text-rose-100",
};

// Glow shadow per tone — thin wrapper over the `--shadow-glow-*` tokens.
export const TONE_GLOW: Record<CoreTone | "cyan", string> = {
  accent: "shadow-glow-accent",
  amber: "shadow-glow-amber",
  sky: "shadow-glow-sky",
  emerald: "shadow-glow-emerald",
  rose: "shadow-glow-rose",
  cyan: "shadow-glow-cyan",
};

// Plain colored text per tone — Eyebrow kickers, tinted captions.
export const TONE_TEXT: Record<CoreTone | "neutral", string> = {
  accent: "text-accent-400",
  amber: "text-amber-300",
  sky: "text-sky-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  neutral: "text-fg-muted",
};
