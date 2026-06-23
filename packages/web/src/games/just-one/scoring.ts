// Just One is a cooperative word-guessing game with no winner — the team banks
// 0–13 points and reads a flavour tier. Single source of truth for the score
// range and the tier text, shared by the match-history form (JustOneForm) and
// the match card (MatchCard).

export const JUST_ONE_MAX_SCORE = 13;

/** Every recordable score, 0..13 — used to render the picker chips. */
export const JUST_ONE_SCORES = Array.from({ length: JUST_ONE_MAX_SCORE + 1 }, (_, i) => i);

/**
 * The official outcome blurb for a Just One score. Bands (from the rulebook):
 * 0–3, 4–6, 7–8, 9–10, then 11 / 12 / 13 individually.
 */
export function justOneTier(score: number): string {
  if (score <= 3) return "Eek… What happened?";
  if (score <= 6) return "Not bad. You could certainly do better.";
  if (score <= 8) return "Average. It's a good start. Try again!";
  if (score <= 10) return "Good. A first step towards glory?";
  if (score === 11) return "Very good! You should be proud!";
  if (score === 12) return "Impressive! You are almost champions!";
  return "Incredible! A perfect score!"; // 13 (or anything above, defensively)
}
