// Group news: one member's best move since the previous rating run.
//
// Everyone sees the same card — the subject reads it in second person and
// everyone else reads it by name. It is deliberately shown to unranked members
// too: a spotlight is the clearest possible picture of what there is to play
// toward, and it names nobody who lost ground.

import type { SkillPlayerRef, SpotlightEvent, SpotlightPayload } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { ArrowUpIcon, FlameIcon } from "../../icons";
import { Avatar } from "../../ui/Avatar.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import trophyGold from "./assets/trophy-1.svg";
import trophySilver from "./assets/trophy-2.svg";
import trophyBronze from "./assets/trophy-3.svg";
import { toBoardRows } from "./board-rows.ts";
import { GreetingShell } from "./GreetingShell.tsx";
import {
  type SpotlightVoice,
  spotlightCopy,
  spotlightLine,
  spotlightStat,
} from "./greeting-copy.ts";
import { LeaderboardList } from "./LeaderboardList.tsx";
import { TraitIcon } from "./TraitIcon.tsx";
import { ordinal, traitLabel } from "./trait-copy.ts";

const PODIUM: Record<number, { src: string; label: string }> = {
  1: { src: trophyGold, label: "Gold trophy" },
  2: { src: trophySilver, label: "Silver trophy" },
  3: { src: trophyBronze, label: "Bronze trophy" },
};

/** The trophy for a podium finish, the trait glyph otherwise. */
function Emblem({ event }: { event: SpotlightEvent }): ReactNode {
  const podium =
    (event.kind === "trait-climb" || event.kind === "game-climb") && PODIUM[event.to]
      ? PODIUM[event.to]
      : null;
  if (podium) {
    return (
      <img
        src={podium.src}
        alt={podium.label}
        className="h-16 w-16 shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-300 to-accent-500 text-surface-950">
      {event.kind === "trait-climb" ? (
        <TraitIcon trait={event.trait} className="h-7 w-7" />
      ) : event.kind === "streak-lead" ? (
        <FlameIcon className="h-7 w-7" />
      ) : (
        <ArrowUpIcon className="h-7 w-7" />
      )}
    </div>
  );
}

/** "4th ↗ 1st" — the move itself, stated once, without a field size. */
function RankJump({ from, to }: { from: number | null; to: number }) {
  return (
    <span className="flex items-baseline gap-2 tabular-nums">
      {from !== null && (
        <>
          <span className="text-base font-semibold text-fg-muted line-through decoration-fg-muted/40">
            {ordinal(from)}
          </span>
          <ArrowUpIcon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 rotate-45 text-[var(--accent)]" />
        </>
      )}
      <span className="text-2xl font-black text-[var(--accent)]">{ordinal(to)}</span>
    </span>
  );
}

/** The heading over the proof board — the thing the rank is a rank IN. */
function proofLabel(event: SpotlightEvent): string | null {
  if (event.kind === "trait-climb") return `${traitLabel(event.trait)} leaderboard`;
  if (event.kind === "game-climb") return resolveGame(event.slug)?.title ?? event.slug;
  return null;
}

export function SpotlightModalView({
  payload,
  subjectUserId,
  viewerId,
  players,
  accentHex,
  onDismiss,
  onCta,
  switcher,
}: {
  payload: SpotlightPayload;
  subjectUserId: string;
  viewerId: string | null;
  players: Record<string, SkillPlayerRef>;
  accentHex: string | null | undefined;
  onDismiss: () => void;
  onCta: () => void;
  switcher?: ReactNode;
}) {
  const subject = players[subjectUserId];
  const firstName = subject?.name.split(" ")[0] ?? "Someone";
  const voice: SpotlightVoice = {
    voice: viewerId === subjectUserId ? "you" : "them",
    firstName,
  };
  const copy = spotlightCopy(payload.event, voice);
  const cover =
    payload.event.kind === "game-climb" ? resolveGame(payload.event.slug)?.thumbnail : undefined;
  const label = proofLabel(payload.event);
  const stat = spotlightStat(payload.event);
  const isClimb = payload.event.kind === "trait-climb" || payload.event.kind === "game-climb";
  const rows = toBoardRows(payload.proof?.rows ?? [], players, (r) => r.value);

  return (
    <GreetingShell
      accentHex={accentHex}
      eyebrow={copy.eyebrow}
      title={copy.title}
      subheader={
        <p className="text-sm text-fg-muted">
          The biggest move since the group's ratings were last updated.
        </p>
      }
      heroEyebrow={stat?.eyebrow ?? label ?? "Moving up"}
      heroTitle={
        isClimb && (payload.event.kind === "trait-climb" || payload.event.kind === "game-climb") ? (
          <RankJump from={payload.event.from} to={payload.event.to} />
        ) : (
          (stat?.stat ?? copy.title)
        )
      }
      heroDetail={copy.detail}
      emblem={<Emblem event={payload.event} />}
      coverSrc={cover}
      ctaLabel={voice.voice === "you" ? "See your stats" : `See ${firstName}'s stats`}
      onCta={onCta}
      onDismiss={onDismiss}
      switcher={switcher}
    >
      {rows.length > 0 && (
        <Surface variant="tile" padding="none" className="min-w-0 shrink-0 p-3">
          {/* The hero already names the board; this heading only dates it. */}
          <MicroLabel className="mb-1.5 flex min-w-0 items-center gap-1.5 font-semibold">
            {cover && <img src={cover} alt="" className="h-4 w-4 rounded object-cover" />}
            <span className="truncate">The board now</span>
          </MicroLabel>
          <LeaderboardList rows={rows} highlightUserId={subjectUserId} topN={rows.length} />
        </Surface>
      )}

      {payload.runnersUp.length > 0 && (
        <Surface variant="tile" padding="none" className="shrink-0 p-3">
          <MicroLabel className="mb-1.5 font-semibold">Also moving up</MicroLabel>
          <ul className="flex flex-col gap-1.5">
            {payload.runnersUp.map((r) => {
              const ref = players[r.userId];
              const name = ref?.name.split(" ")[0] ?? "A member";
              return (
                <li key={r.userId} className="flex items-center gap-2">
                  <Avatar name={ref?.name ?? name} image={ref?.image ?? null} size="xs" />
                  <span className="min-w-0 truncate text-2xs text-fg-secondary">
                    {spotlightLine(r.event, {
                      voice: viewerId === r.userId ? "you" : "them",
                      firstName: name,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </GreetingShell>
  );
}
