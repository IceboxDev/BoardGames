/**
 * Game sounds synthesized with WebAudio — no audio files ship. Each game
 * composes its voices from `tone` (see chess's and Connect 4's `logic/sound.ts`)
 * and keeps its own mute choice under its own key.
 */

let ctx: AudioContext | null = null;

/** The page's audio context (made on first use, resumed if the browser suspended it). */
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface ToneOptions {
  /** Seconds from now. */
  at?: number;
  /** Seconds the tone rings. */
  length: number;
  /** Peak gain. */
  gain: number;
  type?: OscillatorType;
}

/**
 * One damped tone, its pitch falling to 60%: a knock when short and low, a
 * chime when longer. A 4 ms attack keeps it from clicking.
 */
export function tone(
  ac: AudioContext,
  freq: number,
  { at = 0, length, gain, type = "triangle" }: ToneOptions,
): void {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t = ac.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + length);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A per-browser mute choice in localStorage (wrapped: storage can be unavailable). */
export function mutePreference(key: string): {
  read: () => boolean;
  write: (muted: boolean) => void;
} {
  return {
    read: () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    write: (muted) => {
      try {
        localStorage.setItem(key, muted ? "1" : "0");
      } catch {
        // Storage blocked: the choice lasts this page only.
      }
    },
  };
}
