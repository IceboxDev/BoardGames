// Options a lobby starts with when the room was opened for something specific
// (a Duet campaign mission). Keyed by room code in sessionStorage, so the
// host's refresh keeps them; a guest never reads them (only the host's options
// are sent at start, and the server checks them again).

const KEY = (roomCode: string) => `lobby-preset:${roomCode}`;

export function setLobbyPreset(roomCode: string, config: unknown): void {
  try {
    sessionStorage.setItem(KEY(roomCode), JSON.stringify(config));
  } catch {
    // Private mode / storage off: the lobby falls back to the defaults.
  }
}

/** The preset for this room, or undefined. Still validated by the game's own schema at start. */
export function readLobbyPreset(roomCode: string): unknown {
  try {
    const raw = sessionStorage.getItem(KEY(roomCode));
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}
