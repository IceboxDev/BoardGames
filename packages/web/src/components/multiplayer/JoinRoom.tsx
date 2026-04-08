import { useCallback, useEffect, useRef, useState } from "react";
import { SetupHeader, SetupLayout } from "../setup";

const PLAYER_NAME_KEY = "boardgames-player-name";

interface JoinRoomProps {
  title: string;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onBack: () => void;
  error?: string | null;
}

export function JoinRoom({ title, onCreateRoom, onJoinRoom, onBack, error }: JoinRoomProps) {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) ?? "");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "join") codeInputRef.current?.focus();
  }, [mode]);

  const saveName = useCallback((name: string) => {
    setPlayerName(name);
    if (name.trim()) localStorage.setItem(PLAYER_NAME_KEY, name.trim());
  }, []);

  const handleCreate = useCallback(() => {
    const name = playerName.trim();
    if (!name) return;
    onCreateRoom(name);
  }, [playerName, onCreateRoom]);

  const handleJoin = useCallback(() => {
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!name || code.length !== 4) return;
    onJoinRoom(code, name);
  }, [playerName, roomCode, onJoinRoom]);

  const canCreate = playerName.trim().length > 0;
  const canJoin = playerName.trim().length > 0 && roomCode.trim().length === 4;

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle="Play with friends on your local network" />

      {/* Player name (always shown) */}
      <label className="mx-auto mb-6 block w-full max-w-sm">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Your Name
        </span>
        <input
          type="text"
          value={playerName}
          onChange={(e) => saveName(e.target.value)}
          placeholder="Enter your name..."
          maxLength={20}
          className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
        />
      </label>

      {error && (
        <div className="mx-auto mb-4 w-full max-w-sm rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {mode === "choose" ? (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            Create Room
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className="rounded-lg border border-gray-700 bg-gray-800/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-gray-600 hover:bg-gray-800/60"
          >
            Join Room
          </button>
          <button
            type="button"
            onClick={onBack}
            className="mt-2 text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
              Room Code
            </span>
            <input
              ref={codeInputRef}
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canJoin) handleJoin();
              }}
              placeholder="ABCD"
              maxLength={4}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.3em] text-white placeholder-gray-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            />
          </label>
          <button
            type="button"
            disabled={!canJoin}
            onClick={handleJoin}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            Join
          </button>
          <button
            type="button"
            onClick={() => setMode("choose")}
            className="mt-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            Back
          </button>
        </div>
      )}
    </SetupLayout>
  );
}
