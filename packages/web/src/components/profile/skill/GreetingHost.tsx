// The greeting queue's one mount point — app-wide, via GreetingGate in the
// root shell.
//
// The server decides what a viewer owes a look at — at most one thing, ever —
// so this component has no priority logic of its own: it renders whatever
// `GET /api/greetings` names, acknowledges on dismiss OR on the CTA (so it
// never reappears on another device), and hides optimistically so the card
// doesn't linger while the ack is in flight. Every ack carries the viewer's
// response ("later" vs "cta") for the activity trail; the purchase-vote
// REMINDER's ack is log-only server-side, so it returns next app open until
// the votes are spent. The voting modal itself is NOT a greeting: the vote
// cards open it via local state, so submitting votes can't unmount the
// screen the player is standing on.

import type { GreetingAckAction } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { ackGreeting, fetchGreeting } from "../../../lib/greetings.ts";
import { reportPageView } from "../../../lib/page-views.ts";
import { fetchProfile } from "../../../lib/profile.ts";
import { qk } from "../../../lib/query-keys.ts";
import { fetchPlayerSkill, fetchSkillLeaderboards } from "../../../lib/skills.ts";
import { ArrivalTakeoverView } from "../../arrivals/ArrivalTakeoverView.tsx";
import { ctaDestination } from "../../arrivals/arrival-copy.ts";
import { toArrivalCards } from "../../arrivals/arrival-view-model.ts";
import {
  PurchaseVoteAnnounceModal,
  PurchaseVoteReminderModal,
} from "../../purchase-vote/PurchaseVoteGreetingCards.tsx";
import { PurchaseVoteModal } from "../../purchase-vote/PurchaseVoteModal.tsx";
import { Select } from "../../ui/Select.tsx";
import { ackBody, greetingKey } from "./greeting-ack.ts";
import { SkillIntroModalView } from "./SkillIntroModal.tsx";
import { SpotlightModalView } from "./SpotlightModal.tsx";

export default function GreetingHost({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useCurrentUser();
  // Admin dev tool: preview the intro exactly as another member will see it
  // (only while it is naturally due — the intro shows ONCE per user).
  const canPreview = isAdmin && import.meta.env.DEV;
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // The voting modal, opened by the purchase-vote cards' CTAs. Owned here
  // (not by the greeting) so greeting refetches can't unmount it.
  const [voteOpen, setVoteOpen] = useState(false);

  const greetingQuery = useQuery({
    queryKey: qk.greetings(),
    queryFn: ({ signal }) => fetchGreeting(signal),
    // A nag must re-evaluate on every app open — never serve it from a warm
    // cache (the persister also excludes this key, see App.tsx).
    staleTime: 0,
  });
  const served = greetingQuery.data?.greeting ?? null;
  const greeting =
    served !== null && greetingKey(served) !== dismissedKey && !voteOpen ? served : null;
  const show = greeting !== null;

  // Activity beacon: a greeting actually rendering is a real "view" — mirrors
  // the RsvpModal pattern for non-route surfaces.
  useEffect(() => {
    if (!greeting) return;
    reportPageView(
      greeting.kind === "spotlight"
        ? "skill-spotlight"
        : greeting.kind === "skill-intro"
          ? "skill-intro"
          : greeting.kind,
    );
  }, [greeting]);

  const ackMutation = useMutation({
    mutationFn: ackGreeting,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.greetings() }),
  });

  // The intro unveils the viewer's own hexagon and the board behind their
  // claim; fetched only once it is actually due, and both stay warm for the
  // stats page. A spotlight needs neither — its card carries its own proof.
  const introDue = greeting?.kind === "skill-intro";
  const targetId = (canPreview && introDue ? previewUserId : null) ?? userId;
  const skillQuery = useQuery({
    queryKey: qk.skillPlayer(targetId),
    queryFn: ({ signal }) => fetchPlayerSkill(targetId, signal),
    enabled: introDue,
  });
  const boardsQuery = useQuery({
    queryKey: qk.skillLeaderboards(),
    queryFn: ({ signal }) => fetchSkillLeaderboards(signal),
    enabled: introDue,
  });
  // A spotlight takes the SUBJECT's accent: it is their news, and the CTA
  // lands on their page, so the card should already be their colour. The intro
  // is about the viewer, so it takes theirs. Vote greetings take the winning
  // GAME's accent (or none) and need no profile fetch.
  const skillKind = greeting?.kind === "skill-intro" || greeting?.kind === "spotlight";
  const accentOwnerId = greeting?.kind === "spotlight" ? greeting.subjectUserId : targetId;
  const profileQuery = useQuery({
    queryKey: qk.profile(accentOwnerId),
    queryFn: ({ signal }) => fetchProfile(accentOwnerId, signal),
    enabled: show && skillKind,
  });

  if (voteOpen) {
    return <PurchaseVoteModal onClose={() => setVoteOpen(false)} />;
  }
  if (!greeting) return null;

  const accentHex = profileQuery.data?.profile.accentHex;
  // Every ack carries the response ("later" = clicked away, "cta" = followed
  // the button) so the admin activity trail shows outcomes, not just views.
  // The reminder's ack is log-only server-side — it still returns next visit.
  const close = (action: GreetingAckAction, then?: () => void) => () => {
    setDismissedKey(greetingKey(greeting));
    ackMutation.mutate(ackBody(greeting, action));
    then?.();
  };

  if (greeting.kind === "purchase-vote-announce") {
    return (
      <PurchaseVoteAnnounceModal
        greeting={greeting}
        onDismiss={close("later")}
        onCta={close("cta", () => setVoteOpen(true))}
      />
    );
  }

  if (greeting.kind === "purchase-vote-reminder") {
    return (
      <PurchaseVoteReminderModal
        greeting={greeting}
        onDismiss={close("later")}
        onCta={close("cta", () => setVoteOpen(true))}
      />
    );
  }

  if (greeting.kind === "arrival") {
    // The takeover is about the purchasers and the games, not the viewer;
    // it resolves titles, accents and photo URLs from the wire greeting.
    const cards = toArrivalCards(greeting);
    return (
      <ArrivalTakeoverView
        cards={cards}
        totals={greeting.totals}
        viewerId={userId}
        onDismiss={close("later")}
        onCta={close("cta", () => navigate(ctaDestination(cards, userId)))}
      />
    );
  }

  if (greeting.kind === "spotlight") {
    return (
      <SpotlightModalView
        payload={greeting.payload}
        subjectUserId={greeting.subjectUserId}
        viewerId={userId}
        players={greetingQuery.data?.players ?? {}}
        accentHex={accentHex}
        onDismiss={close("later")}
        onCta={close("cta", () => navigate(`/u/${greeting.subjectUserId}/skill`))}
      />
    );
  }

  const skill = skillQuery.data;
  const boards = boardsQuery.data;
  // When previewing another member, their own ladder replaces the viewer's.
  const highlight = previewUserId !== null ? (skill?.highlights[0] ?? null) : greeting.highlight;
  if (!skill || !highlight) return null;

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

  return (
    <SkillIntroModalView
      firstName={profileQuery.data?.user.name.split(" ")[0] ?? null}
      accentHex={accentHex}
      highlight={highlight}
      skill={skill}
      boards={boards}
      switcher={switcher}
      onDismiss={close("later")}
      onCta={close("cta", () => navigate(`/u/${targetId}/skill`))}
    />
  );
}
