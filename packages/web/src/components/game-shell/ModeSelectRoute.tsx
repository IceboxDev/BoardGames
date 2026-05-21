import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { ModeSelect } from "../multiplayer";

/**
 * Route element rendered at the `/play/:slug` index. Each capability the
 * game exposes (mp, match history, tournament) becomes a navigation
 * callback; `ModeSelect` decides which buttons to show based on which
 * callbacks it receives.
 *
 * Multiplayer is shown for every remote-mode game (today: all of them).
 * If a future local-only game is added, the button can be gated on
 * `def.mode === "remote"` once `ModeSelect`'s `onMultiplayer` prop is
 * made optional. Tracking that future change here so it stays a single-
 * line edit.
 */
export default function ModeSelectRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  const slug = def.slug;

  return (
    <ModeSelect
      title={def.title}
      subtitle={undefined}
      soloLabel={def.soloLabel}
      rulesUrl={def.rulesUrl}
      onSolo={() => navigate(`/play/${slug}/solo`)}
      onMultiplayer={() => navigate(`/play/${slug}/mp/join`)}
      onMatchHistory={
        def.hasMatchHistory ? () => navigate(`/play/${slug}/match-history`) : undefined
      }
      onTournament={def.hasTournament ? () => navigate(`/play/${slug}/tournament`) : undefined}
    />
  );
}
