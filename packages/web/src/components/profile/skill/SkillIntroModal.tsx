// One-time "skill profiles are live" celebration takeover — a full Modal
// (game-picker style), not a banner. Unveils the viewer's own hexagon, their
// best TRUE fact as a medal centerpiece (game art when the fact is
// game-specific), and the relevant top-3 board with their row glowing.
// Every number is server-derived; the modal only celebrates it.
//
// Both the CTA and any dismissal acknowledge server-side, so it never
// reappears on another device.

import type {
  PlayerSkillResponse,
  SkillHighlightWire,
  SkillLeaderboardsResponse,
} from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { DEFAULT_ACCENT } from "../../../lib/accent.ts";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { reportPageView } from "../../../lib/page-views.ts";
import { fetchProfile } from "../../../lib/profile.ts";
import { qk } from "../../../lib/query-keys.ts";
import {
  ackSkillIntro,
  fetchPlayerSkill,
  fetchSkillIntro,
  fetchSkillLeaderboards,
} from "../../../lib/skills.ts";
import { ArrowRightIcon, SparkleIcon } from "../../icons";
import { Button } from "../../ui/Button.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Modal, ModalBody, ModalFooter } from "../../ui/Modal.tsx";
import { Select } from "../../ui/Select.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { HexSkillChart } from "../HexSkillChart.tsx";
import { LeaderboardList, type LeaderboardRow } from "./LeaderboardList.tsx";
import { Medal } from "./Medal.tsx";
import { highlightCopy, TRAIT_COPY } from "./trait-copy.ts";

// ── Presentational modal (dev preview renders this directly) ───────────

export function SkillIntroModalView({
  firstName = null,
  accentHex,
  highlight,
  skill,
  boards,
  onDismiss,
  onCta,
  switcher,
}: {
  firstName?: string | null;
  accentHex: string | null | undefined;
  highlight: SkillHighlightWire;
  skill: PlayerSkillResponse;
  boards: SkillLeaderboardsResponse | undefined;
  onDismiss: () => void;
  onCta: () => void;
  /** Admin-only dev tool: preview the modal as another member. */
  switcher?: ReactNode;
}) {
  const accent = accentHex ?? DEFAULT_ACCENT;
  const copy = highlightCopy(highlight);
  const game = highlight.kind === "game-first" ? resolveGame(highlight.slug) : undefined;

  // The board backing the claim (top 3 + the viewer's row via LeaderboardList).
  let boardRows: LeaderboardRow[] = [];
  let boardLabel = "";
  if (boards) {
    if (highlight.kind === "game-first") {
      const board = boards.games.find((b) => b.slug === highlight.slug);
      boardLabel = game?.title ?? highlight.slug;
      boardRows = (board?.entries ?? []).map((e) => ({
        userId: e.userId,
        name: boards.players[e.userId]?.name ?? "Unknown player",
        image: boards.players[e.userId]?.image ?? null,
        rank: e.rank,
        value: `${e.matches}×`,
      }));
    } else if (highlight.kind === "trait-first" || highlight.kind === "trait-top3") {
      const board = boards.traits.find((b) => b.trait === highlight.trait);
      boardLabel = `${TRAIT_COPY[highlight.trait].label} leaderboard`;
      boardRows = (board?.entries ?? []).map((e) => ({
        userId: e.userId,
        name: boards.players[e.userId]?.name ?? "Unknown player",
        image: boards.players[e.userId]?.image ?? null,
        rank: e.rank,
        value: String(e.score),
      }));
    }
  }

  const axes = skill.traits?.map((t) => ({
    label: TRAIT_COPY[t.trait].label,
    value: t.score / 100,
    provisional: t.provisional,
  }));
  const bestTrait =
    highlight.kind === "trait-strong" || highlight.kind === "top-trait" ? highlight : null;

  return (
    <Modal
      onClose={onDismiss}
      size="sm"
      eyebrow="New feature unlocked"
      eyebrowClassName="text-[var(--accent)]"
      title="Skill profiles are live"
      subheader={
        <p className="text-sm text-fg-muted">
          Every match ever recorded now powers six trait ratings, per-game rankings and the group's
          hall of fame.
        </p>
      }
      panelClassName="border border-[var(--accent)]/30"
      style={{ "--accent": accent } as CSSProperties}
    >
      <ModalBody gap="md">
        {/* Achievement banner — game art backdrop when the claim is a game. */}
        <Surface variant="tile" padding="none" className="relative shrink-0 overflow-hidden">
          {game && (
            <>
              <img
                src={game.thumbnail}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface-950/90 via-surface-950/60 to-transparent" />
            </>
          )}
          {!game && (
            <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--accent)]/25 blur-2xl" />
          )}
          <SparkleIcon className="absolute right-3 top-3 h-4 w-4 text-white/50" />
          <SparkleIcon className="absolute right-9 top-8 h-2.5 w-2.5 text-white/30" />

          <div className="relative flex items-center gap-4 p-4">
            <Medal highlight={highlight} />
            <div className="min-w-0 flex-1">
              <MicroLabel className="font-semibold text-[var(--accent)]">
                {firstName ? `${firstName}'s headline` : "Your headline"}
              </MicroLabel>
              <p className="mt-0.5 text-lg font-black leading-tight text-white">{copy.title}</p>
              <p className="mt-0.5 text-2xs text-fg-secondary">{copy.detail}</p>
            </div>
          </div>
        </Surface>

        {/* The proof: their own hexagon + the board backing the claim. */}
        <div className="grid shrink-0 gap-4 sm:grid-cols-5">
          <Surface
            variant="tile"
            padding="none"
            className="flex flex-col items-center p-3 sm:col-span-2"
          >
            <MicroLabel className="mb-1 font-semibold">Your skill profile</MicroLabel>
            {axes && (
              <div className="w-44 sm:w-40">
                <HexSkillChart skill={{ axes }} accentHex={accent} />
              </div>
            )}
          </Surface>
          <Surface variant="tile" padding="none" className="min-w-0 p-3 sm:col-span-3">
            {boardRows.length > 0 ? (
              <>
                <MicroLabel className="mb-1.5 flex items-center gap-1.5 font-semibold">
                  {game && (
                    <img src={game.thumbnail} alt="" className="h-4 w-4 rounded object-cover" />
                  )}
                  {boardLabel}
                </MicroLabel>
                <LeaderboardList rows={boardRows} highlightUserId={skill.userId} topN={3} />
              </>
            ) : (
              bestTrait && (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <MicroLabel className="font-semibold">
                    {TRAIT_COPY[bestTrait.trait].label}
                  </MicroLabel>
                  <p className="text-3xl font-black tabular-nums text-[var(--accent)]">
                    {bestTrait.score}
                  </p>
                  <p className="text-3xs text-fg-muted">score of 100</p>
                </div>
              )
            )}
          </Surface>
        </div>

        {switcher}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Later
        </Button>
        <Button size="sm" onClick={onCta}>
          See your stats
          <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── Data wrapper ───────────────────────────────────────────────────────

export default function SkillIntroModal({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useCurrentUser();
  // Admin dev tool: preview the modal exactly as another member will see it
  // (only while the modal is naturally due — the intro shows ONCE per user).
  const canPreview = isAdmin && import.meta.env.DEV;
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const targetId = (canPreview ? previewUserId : null) ?? userId;
  const [dismissed, setDismissed] = useState(false);

  const introQuery = useQuery({
    queryKey: qk.skillIntro(),
    queryFn: ({ signal }) => fetchSkillIntro(signal),
  });
  const show = !dismissed && introQuery.data?.show === true;

  // Activity beacon: the one-time greeting actually rendering is a real
  // "view" — mirrors the RsvpModal pattern for non-route surfaces.
  useEffect(() => {
    if (show) reportPageView("skill-intro");
  }, [show]);

  // The unveil needs the target's axes + the boards; fetched only once the
  // intro is actually due, and both stay warm for the stats page.
  const skillQuery = useQuery({
    queryKey: qk.skillPlayer(targetId),
    queryFn: ({ signal }) => fetchPlayerSkill(targetId, signal),
    enabled: show,
  });
  const boardsQuery = useQuery({
    queryKey: qk.skillLeaderboards(),
    queryFn: ({ signal }) => fetchSkillLeaderboards(signal),
    enabled: show,
  });
  const profileQuery = useQuery({
    queryKey: qk.profile(targetId),
    queryFn: ({ signal }) => fetchProfile(targetId, signal),
    enabled: show,
  });

  const ackMutation = useMutation({
    mutationFn: ackSkillIntro,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.skillIntro() }),
  });

  // When previewing another member, derive the headline from the target's
  // own ladder instead of the viewer-specific intro payload.
  const highlight =
    previewUserId !== null
      ? (skillQuery.data?.highlights[0] ?? null)
      : (introQuery.data?.highlight ?? null);
  const skill = skillQuery.data;
  if (!show || !skill) return null;

  const boards = boardsQuery.data;
  const switcher =
    canPreview && boards ? (
      <div className="flex items-center justify-center gap-2">
        <span className="text-3xs font-semibold uppercase tracking-pill text-fg-muted">
          Admin preview
        </span>
        <Select
          size="sm"
          block={false}
          value={targetId}
          onChange={(e) => setPreviewUserId(e.target.value === userId ? null : e.target.value)}
        >
          {Object.entries(boards.players)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
        </Select>
      </div>
    ) : undefined;

  if (!highlight) return null;

  return (
    <SkillIntroModalView
      firstName={profileQuery.data?.user.name.split(" ")[0] ?? null}
      accentHex={profileQuery.data?.profile.accentHex}
      highlight={highlight}
      skill={skill}
      boards={boards}
      switcher={switcher}
      onDismiss={() => {
        setDismissed(true);
        ackMutation.mutate();
      }}
      onCta={() => {
        setDismissed(true);
        ackMutation.mutate();
        navigate(`/u/${targetId}/skill`);
      }}
    />
  );
}
