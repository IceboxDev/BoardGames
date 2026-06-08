import { useCallback, useEffect, useRef, useState } from "react";
import { SetupHeader, SetupLayout } from "../setup";
import { Button, ErrorAlert } from "../ui";

interface JoinRoomProps {
  title: string;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onBack: () => void;
  error?: string | null;
}

/**
 * Multiplayer entry point — pick "Create" or "Join". The player's name is
 * already known from the auth session (every visitor is signed in), so
 * there's no name prompt. The host clicks Create; joiners type the
 * 4-letter code their host shared.
 */
export function JoinRoom({ title, onCreateRoom, onJoinRoom, onBack, error }: JoinRoomProps) {
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "join") codeInputRef.current?.focus();
  }, [mode]);

  const handleJoin = useCallback(() => {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 4) return;
    onJoinRoom(code);
  }, [roomCode, onJoinRoom]);

  const canJoin = roomCode.trim().length === 4;

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle="Create a new room or join one with a code" />

      {error && <ErrorAlert message={error} className="mx-auto mb-4 w-full max-w-sm text-center" />}

      {mode === "choose" ? (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <Button variant="primary" size="lg" onClick={onCreateRoom}>
            Create Room
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setMode("join")}>
            Join Room
          </Button>
          <Button variant="link" onClick={onBack} className="mt-2">
            Back
          </Button>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg-secondary">
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
              className="w-full rounded-lg border border-white/10 bg-surface-800/60 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.3em] text-white placeholder:text-fg-disabled outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            />
          </label>
          <Button variant="primary" size="lg" disabled={!canJoin} onClick={handleJoin}>
            Join
          </Button>
          <Button variant="link" onClick={() => setMode("choose")} className="mt-1">
            Back
          </Button>
        </div>
      )}
    </SetupLayout>
  );
}
