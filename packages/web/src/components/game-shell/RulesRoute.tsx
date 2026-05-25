import { Navigate, useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { RulesViewer } from "../rules/RulesViewer";

/**
 * Full-screen rulebook viewer at `/play/:slug/rules`.
 *
 * Living at its own URL (rather than a state-toggled overlay) is what makes
 * Back behave: both the browser/OS Back button AND the in-app top-nav Back
 * arrow return to the mode-select menu, because `Layout.backTarget` already
 * maps any `/play/:slug/<screen>` to `/play/:slug`. Closing pops this entry
 * (`navigate(-1)`), identical to pressing Back; `RulesViewer` guards against a
 * double dismiss so it can never pop twice and skip past the menu.
 *
 * A game without a rulebook has nothing to show — bounce straight to the menu.
 */
export default function RulesRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  if (!def.rulesUrl) return <Navigate to={`/play/${def.slug}`} replace />;
  return <RulesViewer url={def.rulesUrl} onClose={() => navigate(-1)} />;
}
