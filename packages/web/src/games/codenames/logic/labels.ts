import { SEAT_NAMES, TEAM_NAMES } from "@boardgames/core/games/codenames/seating";
import type { CodenamesPlayerView, KeyEntry, Team } from "@boardgames/core/games/codenames/types";
import type { CoverTone } from "../components/WordGrid";

export const TEAM_TEXT: Record<Team, string> = { 0: "text-cn-red", 1: "text-cn-blue" };
export const TEAM_BG: Record<Team, string> = { 0: "bg-cn-red", 1: "bg-cn-blue" };

export const TEAM_TONE: Record<Team, CoverTone> = { 0: "red", 1: "blue" };

/** Whether another person sits on the viewer's team — someone to chat or point with. */
export function hasHumanTeammate(view: CodenamesPlayerView): boolean {
  return (
    view.team !== null &&
    view.seats.some((s) => s.team === view.team && s.seat !== view.seat && !s.ai)
  );
}

export function teamName(team: Team): string {
  return TEAM_NAMES[team];
}

export function toneOf(entry: KeyEntry): CoverTone {
  if (entry === "bystander") return "tan";
  if (entry === "assassin") return "ink";
  return entry === 0 ? "red" : "blue";
}

/** A seat as the table reads it: the person's name, else its role name. */
export function seatLabel(seat: number, names: readonly (string | null)[]): string {
  return names[seat] ?? SEAT_NAMES[seat] ?? `Seat ${seat + 1}`;
}

/** Two-letter initials for a pointer chip. */
export function initials(label: string): string {
  const parts = label.split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : label.slice(0, 2);
  return letters.toUpperCase();
}

export const RESULT_TEXT: Record<KeyEntry | "own" | "opponent", string> = {
  0: "Red agent",
  1: "Blue agent",
  own: "own agent",
  opponent: "opponent's agent",
  bystander: "bystander",
  assassin: "the assassin",
};
