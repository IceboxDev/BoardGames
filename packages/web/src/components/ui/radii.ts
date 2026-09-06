// ── Radius theme hooks ───────────────────────────────────────────────────
//
// THE canonical names for every themable corner. The classes themselves are
// the `rounded-card-*` / `rounded-ui-*` utilities declared in index.css, so
// the personalization engine can reshape corners site-wide from <html>:
//
//   --radius-ui-scale    scales control corners (buttons, inputs, chips,
//                        segmented tracks/options) proportionally.
//   --radius-card-scale  scales card/panel corners (Surface, InteractiveCard,
//                        SelectableCard, Modal, thumbnails) proportionally.
//
// Avatars are deliberately NOT in this list: profile pictures are generated
// pre-cropped to a circle, so they stay `rounded-full` under every theme (see
// Avatar.tsx). A themable `--avatar-radius` existed briefly and was removed.
//
// Scale factors — not absolute radii — so each site keeps its own base value
// and the md/lg/xl/2xl hierarchy survives theming (nested corners, like a
// SegmentedControl option one step inside its track, stay concentric). With
// the vars unset the factor is 1 and every corner renders exactly as the
// static class it replaced — pixel-identical.
//
// Bases follow the Tailwind scale: md=0.375rem, lg=0.5rem, xl=0.75rem,
// 2xl=1rem, 3xl=1.5rem. Intentionally-distinct shapes (rounded-full pills,
// Checkbox, Badge) do NOT route through here.
//
// Primitives import these constants so a renamed utility is a compile error
// in one place; hand-written chrome in feature code may use the class name
// directly — the `static-panel-radius` style-guard rule points it there.

export const RADIUS_UI_MD = "rounded-ui-md";
export const RADIUS_UI_LG = "rounded-ui-lg";

export const RADIUS_CARD_MD = "rounded-card-md";
export const RADIUS_CARD_LG = "rounded-card-lg";
export const RADIUS_CARD_XL = "rounded-card-xl";
export const RADIUS_CARD_2XL = "rounded-card-2xl";
export const RADIUS_CARD_3XL = "rounded-card-3xl";
