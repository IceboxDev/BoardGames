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
   *  each team member; free-text is always allowed. */
  memberRoles?: string[];
};

export const TEAM_GAME_CONFIG: Record<string, TeamGameConfig> = {
  codenames: {
    memberRoles: ["Spymaster", "Operative"],
  },
  "captain-sonar": {
    memberRoles: ["Captain", "First Mate", "Engineer", "Radio Operator"],
  },
  decrypto: {
    hasScores: true,
  },
  wavelength: {
    hasScores: true,
  },
  // The Resistance, wer-wars, wo-wars: no scores, no member roles by default.
};

export function teamConfigForSlug(slug: string | null): TeamGameConfig {
  if (!slug) return {};
  return TEAM_GAME_CONFIG[slug] ?? {};
}
