import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  MatchRecord,
} from "@boardgames/core/history/types";
import { games } from "../../games/registry";
import { lowScoreWinsForSlug } from "../../games/score-config";
import { BookIcon } from "../icons";
import { AvatarBubble } from "./AvatarBubble";

type Props = {
  match: MatchRecord;
  isAdmin: boolean;
  onEdit?: (m: MatchRecord) => void;
  onDelete?: (m: MatchRecord) => void;
};

const THUMB_BY_SLUG = new Map(games.map((g) => [g.slug, g.thumbnail] as const));

export function MatchCard({ match, isAdmin, onEdit, onDelete }: Props) {
  const thumb = match.gameSlug ? THUMB_BY_SLUG.get(match.gameSlug) : undefined;
  return (
    <article className="group flex items-center gap-3 rounded-lg bg-surface-900/40 px-2.5 py-1.5 text-sm transition hover:bg-surface-900/70">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-10 w-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-800 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {match.gameTitle.slice(0, 2)}
        </div>
      )}

      <div className="w-32 shrink-0 truncate text-sm font-medium text-gray-100 sm:w-44">
        {match.gameTitle}
      </div>

      <div className="min-w-0 flex-1">
        <CompactOutcome outcome={match.outcome} gameSlug={match.gameSlug} />
      </div>

      {isAdmin && (onEdit || onDelete) && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(match)}
              aria-label="Edit"
              className="rounded p-1 text-gray-400 hover:bg-surface-800 hover:text-gray-100"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687 1.688a1.875 1.875 0 010 2.652L7.575 19.8a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L14.21 4.487a1.875 1.875 0 012.652 0z"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(match)}
              aria-label="Delete"
              className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CompactOutcome({ outcome, gameSlug }: { outcome: MatchOutcome; gameSlug: string | null }) {
  switch (outcome.kind) {
    case "free-for-all":
      return <FreeForAllInline outcome={outcome} gameSlug={gameSlug} />;
    case "teams":
      return <TeamsInline outcome={outcome} />;
    case "last-standing":
      return <LastStandingInline outcome={outcome} />;
    case "coop":
      return <CoopInline outcome={outcome} />;
    case "one-vs-many":
      return <OneVsManyInline outcome={outcome} />;
  }
}

function FreeForAllInline({
  outcome,
  gameSlug,
}: {
  outcome: MatchOutcomeFreeForAll;
  gameSlug: string | null;
}) {
  const lowestWins = lowScoreWinsForSlug(gameSlug);
  const sorted = [...outcome.players].sort((a, b) =>
    lowestWins ? a.score - b.score : b.score - a.score,
  );
  const winningScore = sorted.length > 0 ? sorted[0].score : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {sorted.map((p) => (
        <span key={p.userId} className="inline-flex items-center gap-1">
          <AvatarBubble name={p.displayName} tone={p.score === winningScore ? "winner" : "loser"} />
          <span className="text-xs tabular-nums text-gray-500">{p.score}</span>
        </span>
      ))}
    </div>
  );
}

function TeamsInline({ outcome }: { outcome: MatchOutcomeTeams }) {
  const winners = new Set(outcome.winnerTeamIndices);
  const hasScore = outcome.teams.some((t) => typeof t.score === "number");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {outcome.teams.map((t, i) => {
        const isWinner = winners.has(i);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: teams have no stable id; not reorderable.
          <span key={i} className="inline-flex items-center gap-1">
            <span className="inline-flex -space-x-1.5">
              {t.members.map((m) => (
                <AvatarBubble
                  key={m.userId}
                  name={m.displayName}
                  tone={isWinner ? "winner" : "loser"}
                  title={m.role ? `${m.displayName} — ${m.role}` : m.displayName}
                />
              ))}
            </span>
            {hasScore && typeof t.score === "number" && (
              <span className="text-xs tabular-nums text-gray-500">{t.score}</span>
            )}
            {i < outcome.teams.length - 1 && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-gray-600">vs</span>
            )}
          </span>
        );
      })}
      {outcome.moderator && <Storyteller moderator={outcome.moderator} />}
    </div>
  );
}

function Storyteller({ moderator }: { moderator: NonNullable<MatchOutcomeTeams["moderator"]> }) {
  const title = moderator.role
    ? `${moderator.displayName} — Storyteller (${moderator.role})`
    : `${moderator.displayName} — Storyteller`;
  return (
    <span className="inline-flex items-center gap-1 border-l border-white/5 pl-2" title={title}>
      <span className="relative inline-flex">
        <AvatarBubble name={moderator.displayName} tone="muted" title={title} />
        {/* Book icon overlay so the Storyteller reads as "runs the game", not
            as just another loser-toned player. Pinned to the bottom-right of
            the avatar with a small ring matching the row background. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-surface-900 text-indigo-300 ring-1 ring-white/10"
        >
          <BookIcon className="h-2.5 w-2.5" />
        </span>
      </span>
      {moderator.role && (
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{moderator.role}</span>
      )}
    </span>
  );
}

function LastStandingInline({ outcome }: { outcome: MatchOutcomeLastStanding }) {
  const survivors = outcome.players.filter((p) => p.eliminationOrder === undefined);
  const eliminated = outcome.players
    .filter((p) => p.eliminationOrder !== undefined)
    .sort((a, b) => (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex -space-x-1.5">
        {survivors.map((p) => (
          <AvatarBubble key={p.userId} name={p.displayName} tone="winner" />
        ))}
      </span>
      {eliminated.length > 0 && (
        <>
          <span className="text-gray-700">·</span>
          <span className="inline-flex -space-x-1.5">
            {eliminated.map((p) => (
              <AvatarBubble key={p.userId} name={p.displayName} tone="muted" />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function CoopInline({ outcome }: { outcome: MatchOutcomeCoop }) {
  const won = outcome.outcome === "win";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          won ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
        }`}
      >
        {won ? "Won" : "Lost"}
      </span>
      <span className="inline-flex -space-x-1.5">
        {outcome.participants.map((p) => (
          <AvatarBubble key={p.userId} name={p.displayName} tone={won ? "winner" : "loser"} />
        ))}
      </span>
    </div>
  );
}

function OneVsManyInline({ outcome }: { outcome: MatchOutcomeOneVsMany }) {
  const soloWon = outcome.winnerSide === "solo";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1">
        <AvatarBubble
          name={outcome.solo.displayName}
          tone={soloWon ? "winner" : "loser"}
          title={
            outcome.solo.roleLabel
              ? `${outcome.solo.displayName} — ${outcome.solo.roleLabel}`
              : outcome.solo.displayName
          }
        />
        {outcome.solo.roleLabel && (
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            {outcome.solo.roleLabel}
          </span>
        )}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-gray-600">vs</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex -space-x-1.5">
          {outcome.team.members.map((m) => (
            <AvatarBubble
              key={m.userId}
              name={m.displayName}
              tone={!soloWon ? "winner" : "loser"}
            />
          ))}
        </span>
        {outcome.team.roleLabel && (
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            {outcome.team.roleLabel}
          </span>
        )}
      </span>
    </div>
  );
}
