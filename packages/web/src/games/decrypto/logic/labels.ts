import type {
  DecryptoPlayerView,
  DecryptoVariant,
  Team,
} from "@boardgames/core/games/decrypto/types";

export function teamLabel(variant: DecryptoVariant, team: Team): string {
  if (variant === "interceptor") return team === 0 ? "The team" : "Interceptor";
  return team === 0 ? "White" : "Black";
}

export function teamShortLabel(variant: DecryptoVariant, team: Team): string {
  if (variant === "interceptor") return team === 0 ? "Team" : "Interceptor";
  return team === 0 ? "White" : "Black";
}

/** Display name for a seat: real player name, "You", or the GPT model label. */
export function seatLabel(
  view: DecryptoPlayerView,
  seat: number,
  playerNames: (string | null)[],
): string {
  if (seat === view.seat) return "You";
  const name = playerNames[seat];
  if (name) return name;
  const entry = view.seats.find((s) => s.seat === seat);
  if (entry?.isAi) return `GPT (${entry.model ?? "?"})`;
  return `Player ${seat + 1}`;
}
