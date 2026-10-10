/** Move sounds — short wooden clicks, synthesized (lib/sound). */

import { audioContext, mutePreference, tone } from "../../../lib/sound/synth";

export type ChessSound = "move" | "capture" | "check" | "castle" | "low-time" | "end";

/** The mute choice, shared by chess and bughouse boards (toggled with `useMuted`). */
export const CHESS_MUTE_KEY = "chess:muted";
export const readMuted = mutePreference(CHESS_MUTE_KEY).read;

export function playSound(kind: ChessSound): void {
  const ac = audioContext();
  if (!ac) return;
  switch (kind) {
    case "move":
      tone(ac, 420, { length: 0.06, gain: 0.18 });
      break;
    case "capture":
      tone(ac, 300, { length: 0.09, gain: 0.25 });
      tone(ac, 520, { at: 0.02, length: 0.05, gain: 0.12 });
      break;
    case "castle":
      tone(ac, 420, { length: 0.06, gain: 0.16 });
      tone(ac, 420, { at: 0.09, length: 0.06, gain: 0.16 });
      break;
    case "check":
      tone(ac, 660, { length: 0.12, gain: 0.16 });
      tone(ac, 880, { at: 0.08, length: 0.14, gain: 0.12 });
      break;
    case "low-time":
      tone(ac, 990, { length: 0.08, gain: 0.1 });
      break;
    case "end":
      tone(ac, 523, { length: 0.25, gain: 0.14 });
      tone(ac, 659, { at: 0.12, length: 0.25, gain: 0.12 });
      tone(ac, 784, { at: 0.24, length: 0.4, gain: 0.12 });
      break;
  }
}

/** The sound for a move, from its SAN and whether it captured. */
export function soundForSan(san: string, captured: boolean): ChessSound {
  if (san.includes("#") || san.includes("+")) return "check";
  if (san.startsWith("O-O")) return "castle";
  return captured ? "capture" : "move";
}
