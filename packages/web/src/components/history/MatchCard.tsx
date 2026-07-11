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
import { isPointlessFreeForAll, lowScoreWinsForSlug } from "../../games/score-config";
import { BookIcon, EditIcon, XIcon } from "../icons";
import { IconButton } from "../ui/IconButton";
import { MicroLabel } from "../ui/Label";
import { AvatarBubble } from "./AvatarBubble";
import { conditionMeta, isDndSlug, resolutionOf } from "./dnd";

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
    <article className="group relative flex flex-col gap-1.5 rounded-lg bg-surface-900/40 px-2.5 py-1.5 text-sm transition hover:bg-surface-900/70 sm:flex-row sm:items-center sm:gap-3">
      {/* Thumb + title share one row on phone; `sm:contents` dissolves this
          wrapper at sm+ so they rejoin the article's single-row flow. */}
      <div className="flex min-w-0 items-center gap-3 sm:contents">
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

        {/* Fills the row beside the thumb on phone; fixed-width column at sm+ so
            long names like "One Night Ultimate Werewolf" stop truncating. */}
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <div className="truncate text-sm font-medium text-fg-primary">{match.gameTitle}</div>
          {subtitle && <div className="truncate text-3xs italic text-fg-muted">{subtitle}</div>}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <CompactOutcome
          outcome={match.outcome}
          gameSlug={match.gameSlug}
          currentUserId={currentUserId}
        />
      </div>

      {isAdmin && (onEdit || onDelete) && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 sm:static sm:shrink-0">
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
  // Fixed-variant games (Bandit, Lovecraft Letter) have exactly one version, so
  // its label always wins — even over a persisted `scenario`. (Lovecraft Letter
  // used to store the win condition in `scenario`; it now lives on the winner's
  // `role`, and the subtitle is just the edition.)
  // D&D subtitle is the campaign / one-shot name.
  if (outcome.kind === "coop" && isDndSlug(gameSlug) && outcome.campaign) return outcome.campaign;
  const variant = variantConfigForSlug(gameSlug);
  if (variant?.fixed && variant.options[0]) return variant.options[0].label;
  // Persisted scenario tag — used by Werewolf, Codenames, Wavelength,
  // 7 Wonders, Exploding Kittens, etc. Each match kind carries its own optional
  // `scenario` field on the wire.
  if (outcome.kind !== "one-vs-many" && outcome.scenario) return outcome.scenario;
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
  // The Resistance: team 0 = Resistance Operatives (green/good), team 1 = Spies
  // (red/evil) — same good-vs-evil colouring as Clocktower.
  if (gameSlug === "the-resistance") {
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
      return isPointlessFreeForAll(gameSlug) ? (
        <PointlessFfaInline outcome={outcome} currentUserId={currentUserId} />
      ) : (
        <FreeForAllInline outcome={outcome} gameSlug={gameSlug} currentUserId={currentUserId} />
      );
    case "teams":
      return <TeamsInline outcome={outcome} gameSlug={gameSlug} currentUserId={currentUserId} />;
    case "last-standing":
      return gameSlug === "dungeon-mayhem" ? (
        <DungeonMayhemInline outcome={outcome} currentUserId={currentUserId} />
      ) : (
        <LastStandingInline outcome={outcome} currentUserId={currentUserId} />
      );
    case "coop":
      return isDndSlug(gameSlug) ? (
        <DndInline outcome={outcome} currentUserId={currentUserId} />
      ) : (
        <CoopInline outcome={outcome} gameSlug={gameSlug} currentUserId={currentUserId} />
      );
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
  // An explicit `rank` means a score tie was broken into a strict order — honour
  // it so the tie-break winner alone shows the winner tone, in placement order.
  const rankMode = outcome.players.some((p) => p.rank !== undefined);
  const sorted = [...outcome.players].sort((a, b) =>
    rankMode
      ? (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY)
      : lowestWins
        ? a.score - b.score
        : b.score - a.score,
  );
  const winningScore = sorted.length > 0 ? sorted[0].score : null;
  const isWinner = (p: MatchOutcomeFreeForAll["players"][number]) =>
    rankMode ? p.rank === 1 : p.score === winningScore;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {sorted.map((p) => (
        <span key={p.userId} className="inline-flex items-center gap-1">
          <AvatarBubble
            name={p.displayName}
            tone={isWinner(p) ? "winner" : "loser"}
            isMe={p.userId === currentUserId}
          />
          <span className="text-xs tabular-nums text-fg-muted">{p.score}</span>
        </span>
      ))}
    </div>
  );
}

// Point-less free-for-all (Villainous, Lovecraft Letter). No scores — show each
// player, winner-first with the gold winner tone; a per-player role (Villainous
// villain) shows as a small label when present. The scenario (edition / win
// condition) renders as the subtitle above.
function PointlessFfaInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeFreeForAll;
  currentUserId: string | null;
}) {
  // New records mark the sole winner with `rank: 1`. Legacy score-based records
  // (from before Villainous went point-less) fall back to highest score so they
  // still surface a winner.
  const hasRank = outcome.players.some((p) => p.rank === 1);
  const topScore = outcome.players.reduce(
    (max, p) => Math.max(max, p.score),
    Number.NEGATIVE_INFINITY,
  );
  const isWinner = (p: MatchOutcomeFreeForAll["players"][number]) =>
    hasRank ? p.rank === 1 : p.score === topScore;

  const sorted = [...outcome.players].sort((a, b) => {
    const aWin = isWinner(a) ? 0 : 1;
    const bWin = isWinner(b) ? 0 : 1;
    if (aWin !== bWin) return aWin - bWin;
    return a.displayName.localeCompare(b.displayName);
  });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {sorted.map((p) => (
        <span key={p.userId} className="inline-flex items-center gap-1">
          <AvatarBubble
            name={p.displayName}
            tone={isWinner(p) ? "winner" : "loser"}
            isMe={p.userId === currentUserId}
            title={p.role ? `${p.displayName} — ${p.role}` : p.displayName}
          />
          {p.role && <MicroLabel>{p.role}</MicroLabel>}
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
              <MicroLabel className="text-fg-disabled" inheritColor>
                vs
              </MicroLabel>
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
          className="absolute -bottom-1 -right-1 inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-surface-900 text-accent-300 ring-1 ring-white/10"
        >
          <BookIcon className="h-2.5 w-2.5" />
        </span>
      </span>
      {moderator.role && <MicroLabel>{moderator.role}</MicroLabel>}
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

// Dungeon Mayhem: an elimination game recorded as last-standing. Mirrors
// PointlessFfaInline — show each player with the hero they played; survivors (last
// hero standing) get the gold winner tone and lead the row, the eliminated
// follow in reverse-knockout order. Sets in play (scenario) render as the
// subtitle above.
function DungeonMayhemInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeLastStanding;
  currentUserId: string | null;
}) {
  const isWinner = (p: MatchOutcomeLastStanding["players"][number]) =>
    p.eliminationOrder === undefined;
  const sorted = [...outcome.players].sort((a, b) => {
    const aWin = isWinner(a) ? 0 : 1;
    const bWin = isWinner(b) ? 0 : 1;
    if (aWin !== bWin) return aWin - bWin;
    // Both eliminated: whoever lasted longer (higher eliminationOrder) leads.
    if (a.eliminationOrder !== undefined && b.eliminationOrder !== undefined) {
      return b.eliminationOrder - a.eliminationOrder;
    }
    return a.displayName.localeCompare(b.displayName);
  });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {sorted.map((p) => (
        <span key={p.userId} className="inline-flex items-center gap-1">
          <AvatarBubble
            name={p.displayName}
            tone={isWinner(p) ? "winner" : "loser"}
            isMe={p.userId === currentUserId}
            title={p.role ? `${p.displayName} — ${p.role}` : p.displayName}
          />
          {p.role && <MicroLabel>{p.role}</MicroLabel>}
        </span>
      ))}
    </div>
  );
}

function CoopInline({
  outcome,
  gameSlug,
  currentUserId,
}: {
  outcome: MatchOutcomeCoop;
  gameSlug: string | null;
  currentUserId: string | null;
}) {
  // Scored co-ops (Just One) have no win/loss — show the score + flavour tier.
  if (outcome.score !== undefined) {
    // Preview shows the score only; the flavour tier lives in the form / detail.
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex -space-x-1.5">
          {outcome.participants.map((p) => (
            <AvatarBubble
              key={p.userId}
              name={p.displayName}
              tone="winner"
              isMe={p.userId === currentUserId}
            />
          ))}
        </span>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-amber-300">
          {outcome.score}
          {gameSlug === "just-one" ? " / 13" : ""}
        </span>
      </div>
    );
  }
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

function DndInline({
  outcome,
  currentUserId,
}: {
  outcome: MatchOutcomeCoop;
  currentUserId: string | null;
}) {
  const resolution = resolutionOf(outcome);
  const badge =
    resolution === "win"
      ? { text: "Won", cls: "bg-emerald-500/15 text-emerald-300" }
      : resolution === "loss"
        ? { text: "Lost", cls: "bg-rose-500/15 text-rose-300" }
        : { text: "Ongoing", cls: "bg-sky-500/15 text-sky-300" };
  // Avatar tone: winners glow, a wipe dims the party; an ongoing session is muted.
  const tone = resolution === "win" ? "winner" : resolution === "loss" ? "loser" : "muted";
  const casualties = outcome.participants.filter((p) => p.condition);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${badge.cls}`}
      >
        {badge.text}
      </span>
      <span className="inline-flex -space-x-1.5">
        {outcome.participants.map((p) => {
          const cond = p.condition ? conditionMeta(p.condition) : null;
          return (
            <AvatarBubble
              key={p.userId}
              name={p.displayName}
              tone={tone}
              isMe={p.userId === currentUserId}
              title={cond ? `${p.displayName} — ${cond.full}` : p.displayName}
            />
          );
        })}
      </span>
      {casualties.map((p) => {
        const cond = conditionMeta(p.condition as NonNullable<typeof p.condition>);
        return (
          <span
            key={p.userId}
            title={cond ? `${p.displayName} — ${cond.full}` : undefined}
            className="inline-flex items-center gap-0.5 text-3xs text-fg-muted"
          >
            <span aria-hidden="true">{cond?.icon}</span>
            {p.displayName}
          </span>
        );
      })}
      {outcome.moderator && (
        <DungeonMaster moderator={outcome.moderator} currentUserId={currentUserId} />
      )}
    </div>
  );
}

// The Dungeon Master, shown exactly like Blood on the Clocktower's Storyteller:
// a muted avatar with a book-icon overlay marking "runs the game", set off from
// the party by a divider. Reuses the same visual language as {@link Storyteller}.
function DungeonMaster({
  moderator,
  currentUserId,
}: {
  moderator: NonNullable<MatchOutcomeCoop["moderator"]>;
  currentUserId: string | null;
}) {
  const title = `${moderator.displayName} — Dungeon Master`;
  return (
    <span className="inline-flex items-center gap-1 border-l border-white/5 pl-2" title={title}>
      <span className="relative inline-flex">
        <AvatarBubble
          name={moderator.displayName}
          tone="muted"
          title={title}
          isMe={moderator.userId === currentUserId}
        />
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-surface-900 text-accent-300 ring-1 ring-white/10"
        >
          <BookIcon className="h-2.5 w-2.5" />
        </span>
      </span>
      <MicroLabel>DM</MicroLabel>
    </span>
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
        {outcome.solo.roleLabel && <MicroLabel>{outcome.solo.roleLabel}</MicroLabel>}
      </span>
      <MicroLabel className="text-fg-disabled" inheritColor>
        vs
      </MicroLabel>
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
        {outcome.team.roleLabel && <MicroLabel>{outcome.team.roleLabel}</MicroLabel>}
      </span>
    </div>
  );
}
