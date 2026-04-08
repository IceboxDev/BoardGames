import { useEffect, useState } from "react";

interface AiThinkingIndicatorProps {
  message: string;
  /** Show a live elapsed timer alongside the message. */
  showTimer?: boolean;
  /** Timestamp (Date.now()) when the timer started. Required if showTimer is true. */
  startTime?: number;
}

export function AiThinkingIndicator({ message, showTimer, startTime }: AiThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!showTimer || !startTime) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(id);
  }, [showTimer, startTime]);

  const secs = (elapsed / 1000).toFixed(1);

  return (
    <div className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-center text-xs font-medium text-amber-400">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      <span>{message}</span>
      {showTimer && startTime ? (
        <span className="ml-1.5 tabular-nums text-amber-500">({secs}s)</span>
      ) : null}
    </div>
  );
}

export function WaitingIndicator({ message = "Waiting for opponent..." }: { message?: string }) {
  return (
    <div className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-center text-xs font-medium text-amber-400">
      {message}
    </div>
  );
}
