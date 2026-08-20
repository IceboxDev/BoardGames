// Skill ratings: recompute, then decide what the group hears about it.
//
// The two halves are deliberately separate. Recompute is cheap, safe and
// repeatable — it refits every rating from the full history. Publishing puts a
// card in front of every member and is not, so the candidates are only ever
// OFFERED here; nothing goes out until a Publish button is pressed. Copy in
// the preview comes from the same helper the modal uses, so what the admin
// reads is exactly what ships.

import type { AdminSkillStateResponse, SpotlightCandidate } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminPublishGreeting,
  adminRecomputeSkills,
  adminRetractGreeting,
  fetchAdminSkillState,
} from "../../lib/admin.ts";
import { formatRelativeTime } from "../../lib/date-format.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { spotlightLine } from "../profile/skill/greeting-copy.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { MicroLabel } from "../ui/Label.tsx";
import { Surface } from "../ui/Surface.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";
import { ExpandableAdminCard } from "./ExpandableAdminCard.tsx";

/** One-line status for the collapsed card. */
function summarize(state: AdminSkillStateResponse | undefined): string {
  if (!state) return "Loading…";
  if (!state.computedAt) return "Never computed — run it once to light up the hall of fame";
  const when = formatRelativeTime(state.computedAt);
  const ranked = `${state.eligibleCount} ranked`;
  if (!state.stale) return `Up to date · ${ranked} · last run ${when}`;
  const n = state.matchesChangedSince;
  return `${n} match${n === 1 ? "" : "es"} recorded since the last run · ${ranked}`;
}

function nameOf(state: AdminSkillStateResponse, userId: string): string {
  return state.players[userId]?.name ?? "A member";
}

function CandidateRow({
  candidate,
  state,
  onPublish,
  publishing,
}: {
  candidate: SpotlightCandidate;
  state: AdminSkillStateResponse;
  onPublish: () => void;
  publishing: boolean;
}) {
  const name = nameOf(state, candidate.subjectUserId);
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
      <span className="min-w-0 truncate text-xs text-fg-secondary">
        {spotlightLine(candidate.event, { voice: "them", firstName: name.split(" ")[0] })}
      </span>
      <Button size="xs" variant="secondary" onClick={onPublish} loading={publishing}>
        Publish
      </Button>
    </li>
  );
}

// ── Presentational card (the dev preview renders this directly) ────────

export function SkillRatingsCardView({
  state,
  expanded,
  onToggle,
  onRecompute,
  onPublish,
  onRetract,
  recomputing = false,
  publishingKey = null,
  retracting = false,
  notice = null,
  error = null,
}: {
  state: AdminSkillStateResponse | undefined;
  expanded: boolean;
  onToggle: () => void;
  onRecompute: () => void;
  onPublish: (candidateKey: string) => void;
  onRetract: (id: number) => void;
  recomputing?: boolean;
  publishingKey?: string | null;
  retracting?: boolean;
  notice?: string | null;
  error?: string | null;
}) {
  return (
    <ExpandableAdminCard
      tone="accent"
      eyebrow="Skill ratings"
      summary={summarize(state)}
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={onRecompute} loading={recomputing}>
            Recompute now
          </Button>
          <p className="text-2xs text-fg-muted">
            Refits every rating from the full history. Announces nothing on its own.
          </p>
        </div>

        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
        {error && <ErrorAlert message={error} />}

        {state && state.candidates.length > 0 && (
          <Surface variant="tile" padding="none" className="p-3">
            <MicroLabel className="mb-2 font-semibold">
              Worth announcing — biggest move first
            </MicroLabel>
            <ul className="flex flex-col gap-1.5">
              {state.candidates.slice(0, 8).map((candidate) => (
                <CandidateRow
                  key={candidate.key}
                  candidate={candidate}
                  state={state}
                  publishing={publishingKey === candidate.key}
                  onPublish={() => onPublish(candidate.key)}
                />
              ))}
            </ul>
            <p className="mt-2 text-3xs text-fg-muted">
              Publishing shows one card to every member, once. A newer one replaces an older one
              nobody has seen yet.
            </p>
          </Surface>
        )}

        {state && state.candidates.length === 0 && state.computedAt && (
          <p className="text-2xs text-fg-muted">
            {state.baselineComputedAt
              ? "Nothing has moved since the previous run — nothing to announce."
              : "No previous run to compare against yet. The next recompute can produce a spotlight."}
          </p>
        )}

        {state?.live && (
          <Surface variant="tile" padding="none" className="p-3">
            <MicroLabel className="mb-1.5 font-semibold">Showing to the group now</MicroLabel>
            <p className="text-xs text-fg-secondary">
              {spotlightLine(state.live.payload.event, {
                voice: "them",
                firstName: nameOf(state, state.live.subjectUserId).split(" ")[0],
              })}
            </p>
            <p className="mt-1 text-3xs text-fg-muted">
              Published {formatRelativeTime(state.live.createdAt)} · seen by {state.live.seenBy}
            </p>
            <Button
              size="xs"
              variant="danger"
              className="mt-2"
              loading={retracting}
              onClick={() => {
                if (state.live) onRetract(state.live.id);
              }}
            >
              Retract
            </Button>
          </Surface>
        )}
      </div>
    </ExpandableAdminCard>
  );
}

// ── Data wrapper ───────────────────────────────────────────────────────

export function SkillRatingsCard() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  const stateQuery = useQuery({
    queryKey: qk.adminSkills(),
    queryFn: ({ signal }) => fetchAdminSkillState(signal),
    enabled: expanded,
  });
  const state = stateQuery.data;

  // Every action returns the whole state, so one setter keeps the card honest
  // instead of patching pieces of it.
  const applyState = (next: AdminSkillStateResponse) => {
    queryClient.setQueryData(qk.adminSkills(), next);
    // The member-facing surfaces now disagree with the server.
    void queryClient.invalidateQueries({ queryKey: ["skills"] });
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const recomputeMutation = useMutation({
    mutationFn: adminRecomputeSkills,
    onSuccess: (next) => {
      applyState(next);
      setNotice(
        next.candidates.length === 0
          ? "Ratings refreshed. Nothing moved, so there is nothing to announce."
          : `Ratings refreshed — ${next.candidates.length} move${next.candidates.length === 1 ? "" : "s"} worth announcing.`,
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: adminPublishGreeting,
    onSuccess: (next) => {
      applyState(next);
      setNotice(
        next.live
          ? `Now showing to everyone: ${nameOf(next, next.live.subjectUserId)}.`
          : "Published.",
      );
    },
    onSettled: () => setPublishingKey(null),
  });

  const retractMutation = useMutation({
    mutationFn: adminRetractGreeting,
    onSuccess: async () => {
      setNotice("Spotlight pulled. Members who already saw it are unaffected.");
      await queryClient.invalidateQueries({ queryKey: qk.adminSkills() });
    },
  });

  const error = errorMessageOf(
    stateQuery.error ?? recomputeMutation.error ?? publishMutation.error ?? retractMutation.error,
    "Skill rating action failed",
  );

  return (
    <>
      <SkillRatingsCardView
        state={state}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onRecompute={() => {
          setNotice(null);
          recomputeMutation.mutate();
        }}
        onPublish={(candidateKey) => {
          setNotice(null);
          setPublishingKey(candidateKey);
          publishMutation.mutate(candidateKey);
        }}
        onRetract={async (id) => {
          const ok = await confirm({
            title: "Pull this spotlight?",
            description:
              "It stops appearing for anyone who hasn't seen it yet. Members who already dismissed it are unaffected.",
            confirmLabel: "Pull it",
            variant: "danger",
          });
          if (ok) retractMutation.mutate(id);
        }}
        recomputing={recomputeMutation.isPending}
        publishingKey={publishingKey}
        retracting={retractMutation.isPending}
        notice={notice}
        error={error}
      />
      {confirmDialog}
    </>
  );
}
