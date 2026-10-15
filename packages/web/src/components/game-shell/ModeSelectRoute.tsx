import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { ModeSelect } from "../multiplayer";

/**
 * Route element rendered at the `/play/:slug` index — the mode picker. Every
 * game shows the same layout: its solo-group card (`def.soloMode`) and its
 * extra-mode card (`def.extraMode`, "Coming soon" unless `def.extraModePath`) — Singleplayer in the
 * middle when it is either of them — the one
 * Multiplayer card (disabled while `def.multiplayerComingSoon`), Match
 * History, plus How to Play and AI Tournament when the game has a rulebook /
 * tournament results.
 */
export default function ModeSelectRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  const slug = def.slug;

  return (
    <ModeSelect
      title={def.title}
      soloMode={def.soloMode ?? "singleplayer"}
      extraMode={def.extraMode}
      onExtra={def.extraModePath ? () => navigate(`/play/${slug}/${def.extraModePath}`) : undefined}
      onSolo={() => navigate(`/play/${slug}/solo`)}
      onMultiplayer={() => navigate(`/play/${slug}/mp/join`)}
      multiplayerComingSoon={def.multiplayerComingSoon}
      onRules={def.rulesUrl ? () => navigate(`/play/${slug}/rules`) : undefined}
      onMatchHistory={() => navigate(`/play/${slug}/match-history`)}
      onTournament={def.tournamentResults ? () => navigate(`/play/${slug}/tournament`) : undefined}
    />
  );
}
