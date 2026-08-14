import { ROOM_CODE_LENGTH } from "@boardgames/core/protocol/ws/room";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SetupHeader, SetupLayout } from "../setup";
import { Button, ErrorAlert, Field, Input } from "../ui";

interface JoinRoomProps {
  title: string;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  /** Games with a BGA bridge (`def.bgaConnect`) get a third option here. */
  onConnectBga?: () => void;
  onBack: () => void;
  error?: string | null;
}

/**
 * Multiplayer entry point — pick "Create" or "Join" (plus "Connect to BGA"
 * for games with a bridge). The player's name is already known from the auth
 * session (every visitor is signed in), so there's no name prompt. The host
 * clicks Create; joiners type the code their host shared.
 */
export function JoinRoom({
  title,
  onCreateRoom,
  onJoinRoom,
  onConnectBga,
  onBack,
  error,
}: JoinRoomProps) {
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const codeInputRef = useRef<HTMLInputElement>(null);
  const codeId = useId();

  useEffect(() => {
    if (mode === "join") codeInputRef.current?.focus();
  }, [mode]);

  const handleJoin = useCallback(() => {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) return;
    onJoinRoom(code);
  }, [roomCode, onJoinRoom]);

  const canJoin = roomCode.trim().length === ROOM_CODE_LENGTH;

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
          {onConnectBga && (
            <Button variant="secondary" size="lg" onClick={onConnectBga}>
              Connect to BGA
            </Button>
          )}
          <Button variant="link" onClick={onBack} className="mt-2">
            Back
          </Button>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <Field label="Room Code" htmlFor={codeId}>
            {/* The standard <Input> wearing a display treatment (oversized,
                centered, `tracking-code`). It keeps the app-wide accent focus
                ring — this field used to be the only input in the app with an
                emerald ring-1 focus. */}
            <Input
              ref={codeInputRef}
              id={codeId}
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canJoin) handleJoin();
              }}
              placeholder="ABCDEF"
              maxLength={ROOM_CODE_LENGTH}
              className="bg-surface-800/60 px-4 py-3 text-center text-2xl font-bold uppercase tracking-code text-white placeholder:text-fg-disabled"
            />
          </Field>
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
