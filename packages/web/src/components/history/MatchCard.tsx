import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  MatchRecord,
} from "@boardgames/core/history/types";
import {
  CLOCKTOWER_EDITIONS,
  detectClocktowerEdition,
} from "../../games/blood-on-the-clocktower/characters";
import { variantConfigForSlug } from "../../games/match-variants";
import { games } from "../../games/registry";
import { lowScoreWinsForSlug } from "../../games/score-config";
import { BookIcon, EditIcon, XIcon } from "../icons";
import { IconButton } from "../ui/IconButton";
import { AvatarBubble } from "./AvatarBubble";

type Props = {
  match: MatchRecord;
  isAdmin: boolean;
  /** Logged-in user id — that player's avatar gets a highlight ring. */
  currentUserId: string | null;
  onEdit?: (m: MatchRecord) => void;
  onDelete?: (m: MatchRecord) => void;
};

const THUMB_BY_SLUG = new Map(games.map((g) => [g.slug, g.thumbnail] as const));

export function MatchCard({ match, isAdmin, currentUserId, onEdit, onDelete }: Props) {
  const thumb = match.gameSlug ? THUMB_BY_SLUG.get(match.gameSlug) : undefined;
  const subtitle = deriveTitleSubtitle(match.outcome, match.gameSlug);
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-800 text-3xs font-semibold uppercase tracking-wider text-fg-muted">
          {match.gameTitle.slice(0, 2)}
        </div>
      )}

      {/* Title column is wider than before so long names like "One Night
          Ultimate Werewolf" stop truncating; a small italic subtitle line
          appears underneath when the game has a meaningful edition/scenario
          tag (BotC edition, Werewolf scenario). */}
      <div className="w-40 shrink-0 sm:w-56">
        <div className="truncate text-sm font-medium text-fg-primary">{match.gameTitle}</div>
        {subtitle && <div className="truncate text-3xs italic text-fg-muted">{subtitle}</div>}
      </div>

      <div className="min-w-0 flex-1">
        <CompactOutcome
          outcome={match.outcome}
          gameSlug={match.gameSlug}
          currentUserId={currentUserId}
        />
      </div>

      {isAdmin && (onEdit || onDelete) && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onEdit && (
            <IconButton
              variant="subtle"
              size="xs"
              aria-label="Edit"
              onClick={() => onEdit(match)}
              icon={<EditIcon className="h-3.5 w-3.5" />}
            />
          )}
          {onDelete && (
            <IconButton
              variant="danger"
              size="xs"
              aria-label="Delete"
              onClick={() => onDelete(match)}
              icon={<XIcon className="h-3.5 w-3.5" />}
            />
          )}
        </div>
      )}
    </article>
  );
}

// ── Subtitle (italic) under the game title ────────────────────────────

function deriveTitleSubtitle(outcome: MatchOutcome, gameSlug: string | null): string | null {
  // Persisted scenario tag — used by Werewolf, Codenames, Wavelength,
  // 7 Wonders, Exploding Kittens, etc. Each match kind carries its own optional
  // `scenario` field on the wire.
  if (outcome.kind !== "one-vs-many" && outcome.scenario) return outcome.scenario;
  // Fixed-variant games (e.g. Bandit) always show their single option's label
  // even when nothing is persisted on the outcome.
  const variant = variantConfigForSlug(gameSlug);
  if (variant?.fixed && variant.options[0]) return variant.options[0].label;
  // BotC also derives the edition from assigned characters as a fallback for
  // legacy records that didn't persist `scenario`.
  if (outcome.kind === "teams" && gameSlug === "blood-on-the-clocktower") {
    const roles = outcome.teams.flatMap((t) => t.members.map((m) => m.role));
    const edition = detectClocktowerEdition(roles);
    if (!edition) return null;
    return CLOCKTOWER_EDITIONS.find((e) => e.id === edition)?.label ?? null;
  }
  return null;
}

// ── Team-color (initials) helpers ─────────────────────────────────────

type Accent = "good" | "evil" | "village" | "wolf" | "tanner" | "neutral";

function teamAccents(outcome: MatchOutcomeTeams, gameSlug: string | null): Accent[] {
  if (gameSlug === "blood-on-the-clocktower") {
    return outcome.teams.map((_, i) => (i === 0 ? "good" : i === 1 ? "evil" : "neutral"));
  }
  if (gameSlug === "one-night-ultimate-werewolf") {
    return outcome.teams.map((t) => {
      const first = (t.members[0]?.role ?? "").toLowerCase();
      if (first === "werewolf" || first === "werewolves") return "wolf";
      if (first === "tanner") return "tanner";
      return "village";
    });
  }
  return outcome.teams.map(() => "neutral");
}

// ── Outcome variants ──────────────────────────────────────────────────

type OutcomeProps = {
  outcome: MatchOutcome;
  gameSlug: string | null;
  currentUserId: string | null;
};

function CompactOutcome({ outcome, gameSlug, currentUserId }: OutcomeProps) {
  switch (outcome.kind) {
    case "free-for-all":
      return (
        <FreeForAllInline outcome={outcome} gameSlug={gameSlug} currentUserId={currentUserId} />
      );
    case "teams":
      return <TeamsInline outcome={outcome} gameSlug={gameSlug} currentUserId={currentUserId} />;
    case "last-standing":
      return <LastStandingInline outcome={outcome} currentUserId={currentUserId} />;
    case "coop":
      return <CoopInline outcome={outcome} currentUserId={currentUserId} />;
    case "one-vs-many":
      return <OneVsManyInline outcome={outcome} currentUserId={currentUserId} />;
  }
}

function FreeForAllInline({
  outcome,
  gameSlug,
  currentUserId,
}: {
  outcome: MatchOutcomeFreeForAll;
  gameSlug: string | null;
  currentUserId: string | null;
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
          <AvatarBubble
            name={p.displayName}
            tone={p.score === winningScore ? "winner" : "loser"}
            isMe={p.userId === currentUserId}
          />
          <span className="text-xs tabular-nums text-fg-muted">{p.score}</span>
        </span>
      ))}
    </div>
  );
}

function TeamsInline({
  outcome,
  gameSlug,
  currentUserId,
}: {
  outcome: MatchOutcomeTeams;
  gameSlug: string | null;
  currentUserId: string | null;
}) {
  const winners = new Set(outcome.winnerTeamIndices);
  const hasScore = outcome.teams.some((t) => typeof t.score === "number");
  const accents = teamAccents(outcome, gameSlug);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {outcome.teams.map((t, i) => {
        const isWinner = winners.has(i);
        const accent = accents[i];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: teams have no stable id; not reorderable.
          <span key={i} className="inline-flex items-center gap-1">
            <span className="inline-flex -space-x-1.5">
              {t.members.map((m) => (
                <AvatarBubble
                  key={m.userId}
                  name={m.displayName}
                  tone={isWinner ? "winner" : "loser"}
                  accent={accent}
                  isMe={m.userId === currentUserId}
                  title={m.role ? `${m.displayName} — ${m.role}` : m.displayName}
                />
              ))}
            </span>
            {hasScore && typeof t.score === "number" && (
              <span className="text-xs tabular-nums text-fg-muted">{t.score}</span>
            )}
            {i < outcome.teams.length - 1 && (
              <span className="text-3xs uppercase tracking-wider text-fg-disabled">vs</span>
            )}
          </span>
        );
      })}
      {outcome.moderator && (
        <Storyteller moderator={outcome.moderator} currentUserId={currentUserId} />
      )}
    </div>
  );
}

function Storyteller({
  moderator,
  currentUserId,
}: {
  moderator: NonNullable<MatchOutcomeTeams["moderator"]>;
  currentUserId: string | null;
}) {
  const title = moderator.role
    ? `${moderator.displayName} — Storyteller (${moderator.role})`
    : `${moderator.displayName} — Storyteller`;
  return (
    <span className="inline-flex items-center gap-1 border-l border-white/5 pl-2" title={title}>
      <span className="relative inline-flex">
        <AvatarBubble
          name={moderator.displayName}
          tone="muted"
          title={title}
          isMe={moderator.userId === currentUserId}
        />
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
        <span className="text-3xs uppercase tracking-wider text-fg-muted">{moderator.role}</span>
      )}
    </span>
  );
}

function LastStandingInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeLastStanding;
  currentUserId: string | null;
}) {
  const survivors = outcome.players.filter((p) => p.eliminationOrder === undefined);
  const eliminated = outcome.players
    .filter((p) => p.eliminationOrder !== undefined)
    .sort((a, b) => (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex -space-x-1.5">
        {survivors.map((p) => (
          <AvatarBubble
            key={p.userId}
            name={p.displayName}
            tone="winner"
            isMe={p.userId === currentUserId}
          />
        ))}
      </span>
      {eliminated.length > 0 && (
        <>
          <span className="text-fg-disabled">·</span>
          <span className="inline-flex -space-x-1.5">
            {eliminated.map((p) => (
              <AvatarBubble
                key={p.userId}
                name={p.displayName}
                tone="muted"
                isMe={p.userId === currentUserId}
              />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function CoopInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeCoop;
  currentUserId: string | null;
}) {
  const won = outcome.outcome === "win";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${
          won ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
        }`}
      >
        {won ? "Won" : "Lost"}
      </span>
      <span className="inline-flex -space-x-1.5">
        {outcome.participants.map((p) => (
          <AvatarBubble
            key={p.userId}
            name={p.displayName}
            tone={won ? "winner" : "loser"}
            isMe={p.userId === currentUserId}
          />
        ))}
      </span>
    </div>
  );
}

function OneVsManyInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeOneVsMany;
  currentUserId: string | null;
}) {
  const soloWon = outcome.winnerSide === "solo";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1">
        <AvatarBubble
          name={outcome.solo.displayName}
          tone={soloWon ? "winner" : "loser"}
          isMe={outcome.solo.userId === currentUserId}
          title={
            outcome.solo.roleLabel
              ? `${outcome.solo.displayName} — ${outcome.solo.roleLabel}`
              : outcome.solo.displayName
          }
        />
        {outcome.solo.roleLabel && (
          <span className="text-3xs uppercase tracking-wider text-fg-muted">
            {outcome.solo.roleLabel}
          </span>
        )}
      </span>
      <span className="text-3xs uppercase tracking-wider text-fg-disabled">vs</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex -space-x-1.5">
          {outcome.team.members.map((m) => (
            <AvatarBubble
              key={m.userId}
              name={m.displayName}
              tone={!soloWon ? "winner" : "loser"}
              isMe={m.userId === currentUserId}
            />
          ))}
        </span>
        {outcome.team.roleLabel && (
          <span className="text-3xs uppercase tracking-wider text-fg-muted">
            {outcome.team.roleLabel}
          </span>
        )}
      </span>
    </div>
  );
}
