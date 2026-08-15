import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { Chip } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { teamShortLabel } from "../logic/labels";
import { mapDecryptoLog } from "../logic/log-mapper";
import { TeamChat } from "./TeamChat";

// Phone-only surfaces (`lg:hidden`). GameScreen's collapsibleSidebars mode
// hides both sidebars below `lg`, so everything they carried — score, the
// viewer's keywords, team chat, and the history log — re-surfaces here in a
// compact form designed to hold together down to 360px.

function MiniPips({ count, tone }: { count: number; tone: "emerald" | "rose" }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            i < count ? (tone === "emerald" ? "bg-emerald-400" : "bg-rose-400") : "bg-surface-700",
          )}
        />
      ))}
    </span>
  );
}

function TeamMini({ view, team }: { view: DecryptoPlayerView; team: Team }) {
  const tokens = view.tokens[team];
  if (!tokens) return null;
  const isMine = team === view.team;
  const interceptorRow = view.variant === "interceptor" && team === 1;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-1",
        isMine ? "bg-surface-800/70" : "bg-surface-800/30",
      )}
    >
      <span
        className={cn(
          "text-3xs font-bold uppercase tracking-tight",
          isMine ? "text-accent-300" : "text-fg-secondary",
        )}
      >
        {teamShortLabel(view.variant, team)}
      </span>
      <span className="flex items-center gap-1" title="Interceptions">
        <span className="text-3xs text-emerald-300/80">I</span>
        <MiniPips count={tokens.interceptions} tone="emerald" />
      </span>
      {!interceptorRow && (
        <span className="flex items-center gap-1" title="Miscommunications">
          <span className="text-3xs text-rose-300/80">M</span>
          <MiniPips count={tokens.miscommunications} tone="rose" />
        </span>
      )}
    </div>
  );
}

/** Round + both teams' token pips in one wrapping row. */
export function MobileScoreStrip({ view }: { view: DecryptoPlayerView }) {
  const warnings: string[] = [];
  view.tokens.forEach((t, team) => {
    const label = teamShortLabel(view.variant, team as Team);
    const interceptorRow = view.variant === "interceptor" && team === 1;
    if (t.interceptions === 1) {
      warnings.push(`${label}: 1 ${interceptorRow ? "token" : "interception"} from victory`);
    }
    if (!interceptorRow && t.miscommunications === 1) {
      warnings.push(`${label}: 1 miscommunication from defeat`);
    }
  });

  return (
    <div className="flex flex-col gap-1 lg:hidden">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="rounded-lg bg-surface-800/50 px-2 py-1 text-3xs font-bold text-white">
          R {Math.max(view.round, 1)}/{view.maxRounds}
        </span>
        <TeamMini view={view} team={0} />
        <TeamMini view={view} team={1} />
      </div>
      {warnings.length > 0 && (
        <p className="text-center text-3xs font-semibold text-amber-300/90">
          {warnings.join(" · ")}
        </p>
      )}
    </div>
  );
}

/** The viewer's numbered keywords as a wrapping chip row. */
export function MobileKeywords({ view }: { view: DecryptoPlayerView }) {
  if (!view.myKeywords) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 lg:hidden">
      {view.myKeywords.map((word, i) => (
        <span
          key={word}
          className="inline-flex items-baseline gap-1 rounded-md bg-surface-800/50 px-1.5 py-0.5"
        >
          <span className="text-3xs font-black text-accent-300">{i + 1}</span>
          <span className="text-2xs font-semibold uppercase tracking-tight text-white">{word}</span>
        </span>
      ))}
    </div>
  );
}

/** Collapsible Chat / History dock at the bottom of the phone board. */
export function MobileDock({
  view,
  playerNames,
  onChat,
}: {
  view: DecryptoPlayerView;
  playerNames: (string | null)[];
  onChat: (text: string) => void;
}) {
  const [open, setOpen] = useState<"chat" | "history" | null>(null);
  const teamSize = view.seats.filter((s) => s.team === view.team).length;
  const hasChat = teamSize >= 2 && view.phase !== "gameOver";

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="flex justify-center gap-2">
        {hasChat && (
          <Chip
            pressed={open === "chat"}
            tone="accent"
            size="xs"
            onClick={() => setOpen(open === "chat" ? null : "chat")}
            className="uppercase"
          >
            💬 Chat{view.chat.length > 0 ? ` (${view.chat.length})` : ""}
          </Chip>
        )}
        <Chip
          pressed={open === "history"}
          tone="accent"
          size="xs"
          onClick={() => setOpen(open === "history" ? null : "history")}
          className="uppercase"
        >
          📜 History
        </Chip>
      </div>

      {open === "chat" && hasChat && (
        <TeamChat view={view} playerNames={playerNames} onChat={onChat} listClassName="max-h-44" />
      )}
      {open === "history" && (
        <div className="max-h-64 overflow-y-auto rounded-lg bg-surface-900/60 p-3">
          <ActionLog blocks={mapDecryptoLog(view)} />
        </div>
      )}
    </div>
  );
}
