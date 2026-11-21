import type { DecryptoVariant, Team } from "@boardgames/core/games/decrypto/types";

export function teamLabel(variant: DecryptoVariant, team: Team): string {
  if (variant === "interceptor") return team === 0 ? "The team" : "Interceptor";
  return team === 0 ? "White" : "Black";
}
