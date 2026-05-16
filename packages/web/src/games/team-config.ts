/**
 * Per-game configuration for `kind: "teams"` matches. Tells the recording form
 * which optional inputs are relevant for the picked game (scores), and what
 * member-role chips to suggest if the game has named seats.
 *
 * Slugs not listed here fall back to: no scores, no role chips (free-text role
 * still allowed). Add or refine entries here as games come up.
 */
export type TeamGameConfig = {
  /** Show a score input per team. Off by default — Codenames / Captain Sonar
   *  / Resistance decide the win without points. */
  hasScores?: boolean;
  /** Suggested member-role chips. The form lets the admin pick from these for
   *  each team member. When unset (or empty), no role UI is rendered — many
   *  team games simply don't have named seats. */
  memberRoles?: string[];
  /**
   * Designates one role as the team's "lead" seat. Assigning the lead role to
   * a member auto-fills every other team member with the fallback role, so the
   * form matches the real seating rule. Codenames is the motivating case: one
   * Spymaster per team, everybody else is an Operative.
   */
  leadRole?: { primary: string; fallback: string };
  /**
   * When set, the form derives the winning team(s) from the scores instead of
   * letting the admin toggle them manually — same idea as the implicit winner
   * in free-for-all. Use "highest" for first-to-X games (Wavelength). Teams
   * sharing the top score all win, which handles natural ties.
   */
  autoWinner?: "highest" | "lowest";
};

// Codenames Original and Codenames Pictures use the exact same Spymaster/
// Operative team structure — only the clue medium differs. Define once,
// share between both slugs so a match recorded against one variant can be
// edited as the other without role chips disappearing.
const CODENAMES_TEAM_CONFIG: TeamGameConfig = {
  memberRoles: ["Spymaster", "Operative"],
  leadRole: { primary: "Spymaster", fallback: "Operative" },
};

export const TEAM_GAME_CONFIG: Record<string, TeamGameConfig> = {
  codenames: CODENAMES_TEAM_CONFIG,
  "codenames-pictures": CODENAMES_TEAM_CONFIG,
  "captain-sonar": {
    memberRoles: ["Captain", "First Mate", "Engineer", "Radio Operator"],
  },
  decrypto: {
    hasScores: true,
  },
  wavelength: {
    hasScores: true,
    autoWinner: "highest",
  },
  // The Resistance, wer-wars, wo-wars: no scores, no member roles by default.
};

export function teamConfigForSlug(slug: string | null): TeamGameConfig {
  if (!slug) return {};
  return TEAM_GAME_CONFIG[slug] ?? {};
}
