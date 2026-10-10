/** Disc sounds — a plastic clack as a disc lands, a rattle as a pop drops a column, a chime at four in a row (lib/sound). */

import { audioContext, tone } from "../../../lib/sound/synth";

export type Connect4Sound = "drop" | "pop" | "win";

export const CONNECT4_MUTE_KEY = "connect4:muted";

/** `delay` (s) lets the clack land with the drop animation. */
export function playSound(sound: Connect4Sound, delay = 0): void {
  const ac = audioContext();
  if (!ac) return;
  switch (sound) {
    case "drop":
      tone(ac, 420, { at: delay, length: 0.07, gain: 0.22, type: "square" });
      tone(ac, 260, { at: delay + 0.05, length: 0.06, gain: 0.12, type: "square" });
      break;
    case "pop":
      for (let i = 0; i < 3; i++) {
        tone(ac, 330 - i * 40, { at: i * 0.05, length: 0.05, gain: 0.14, type: "square" });
      }
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => {
        tone(ac, f, { at: i * 0.09, length: 0.3, gain: 0.12 });
      });
      break;
  }
}
