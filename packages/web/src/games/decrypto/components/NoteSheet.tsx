import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { teamLabel } from "../logic/labels";

// The public deduction board — both teams' revealed clues grouped under the
// digit they encoded. Your own team's columns are additionally headed by the
// actual keywords (only you and your teammates can see those).

function TeamSheet({ view, team }: { view: DecryptoPlayerView; team: Team }) {
  const isMine = team === view.team && view.myKeywords !== null;
  const columns = view.noteSheet[team];
  const interceptorSheet = view.variant === "interceptor" && team === 1;
  if (interceptorSheet) return null; // the interceptor has no keywords or clues

  return (
    <Surface variant="raised" padding="sm" className="min-w-0 flex-1">
      <div className="mb-2 flex items-baseline justify-between">
        <h3
          className={cn(
            "text-xs font-bold uppercase tracking-label",
            isMine ? "text-accent-300" : "text-fg-secondary",
          )}
        >
          {teamLabel(view.variant, team)}
          {isMine && " (your team)"}
        </h3>
      </div>
      <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
        {columns.map((clues, digitIdx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: columns ARE the digits 1-4
            key={digitIdx}
            className="min-w-0 rounded-lg bg-surface-800/50 p-1 sm:p-1.5"
          >
            <div className="mb-1 border-b border-white/10 pb-1 text-center">
              <span className="text-sm font-black text-white">{digitIdx + 1}</span>
              {isMine && view.myKeywords && (
                <p className="truncate text-3xs font-semibold uppercase tracking-tight text-accent-200">
                  {view.myKeywords[digitIdx]}
                </p>
              )}
            </div>
            <ul className="flex flex-col gap-0.5">
              {clues.map((entry) => (
                <li
                  key={`${entry.round}-${entry.clue}`}
                  className="truncate text-3xs leading-snug text-fg-secondary"
                  title={`round ${entry.round}: ${entry.clue}`}
                >
                  {entry.clue}
                </li>
              ))}
              {clues.length === 0 && <li className="text-3xs text-fg-disabled">—</li>}
            </ul>
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function NoteSheet({ view }: { view: DecryptoPlayerView }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row">
      <TeamSheet view={view} team={view.team} />
      <TeamSheet view={view} team={view.team === 0 ? 1 : 0} />
    </div>
  );
}
