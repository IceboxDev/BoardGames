// ── Radius theme hooks ───────────────────────────────────────────────────
//
// THE canonical definitions for every themable corner in the ui/ primitives.
// Components reference these constants instead of static rounded-* utilities,
// so the personalization engine can reshape corners site-wide from <html>:
//
//   --radius-ui-scale    scales control corners (buttons, inputs, chips,
//                        segmented tracks/options) proportionally.
//   --radius-card-scale  scales card/panel corners (Surface, InteractiveCard,
//                        SelectableCard) proportionally.
//   --avatar-radius      swaps the avatar shape wholesale (e.g. 30% squircle).
//
// Scale factors — not absolute radii — so each site keeps its own base value
// and the md/lg/xl/2xl hierarchy survives theming (nested corners, like a
// SegmentedControl option one step inside its track, stay concentric). With
// the vars unset the factor is 1 (avatar: full round) and every corner
// renders exactly as the original static class did — pixel-identical.
//
// Bases follow the Tailwind scale: md=0.375rem, lg=0.5rem, xl=0.75rem,
// 2xl=1rem. Intentionally-distinct shapes (rounded-full pills, Checkbox,
// Badge) do NOT route through here. No spaces inside the arbitrary values —
// Tailwind won't parse a bracketed candidate containing them.
//
// Follow-up once the theme-engine unit lands: promote these to @theme tokens
// in index.css (that file is owned by the engine unit, not this one).

export const RADIUS_UI_MD = "rounded-[calc(var(--radius-ui-scale,1)*0.375rem)]";
export const RADIUS_UI_LG = "rounded-[calc(var(--radius-ui-scale,1)*0.5rem)]";

export const RADIUS_CARD_MD = "rounded-[calc(var(--radius-card-scale,1)*0.375rem)]";
export const RADIUS_CARD_LG = "rounded-[calc(var(--radius-card-scale,1)*0.5rem)]";
export const RADIUS_CARD_XL = "rounded-[calc(var(--radius-card-scale,1)*0.75rem)]";
export const RADIUS_CARD_2XL = "rounded-[calc(var(--radius-card-scale,1)*1rem)]";

export const AVATAR_RADIUS = "rounded-[var(--avatar-radius,9999px)]";
