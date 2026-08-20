// The greeting queue's one mount point.
//
// The server decides what a viewer owes a look at — at most one thing, ever —
// so this component has no priority logic of its own: it renders whatever
// `GET /api/skills/greeting` names, acknowledges on dismiss OR on the CTA (so
// it never reappears on another device), and hides optimistically so the card
// doesn't linger while the ack is in flight.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { reportPageView } from "../../../lib/page-views.ts";
import { fetchProfile } from "../../../lib/profile.ts";
import { qk } from "../../../lib/query-keys.ts";
import {
  ackGreeting,
  fetchGreeting,
  fetchPlayerSkill,
  fetchSkillLeaderboards,
} from "../../../lib/skills.ts";
import { Select } from "../../ui/Select.tsx";
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
  const [dismissed, setDismissed] = useState(false);

  const greetingQuery = useQuery({
    queryKey: qk.greeting(),
    queryFn: ({ signal }) => fetchGreeting(signal),
  });
  const greeting = dismissed ? null : (greetingQuery.data?.greeting ?? null);
  const show = greeting !== null;

  // Activity beacon: a greeting actually rendering is a real "view" — mirrors
  // the RsvpModal pattern for non-route surfaces.
  useEffect(() => {
    if (greeting) reportPageView(greeting.kind === "spotlight" ? "skill-spotlight" : "skill-intro");
  }, [greeting]);

  const ackMutation = useMutation({
    mutationFn: ackGreeting,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.greeting() }),
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
  // is about the viewer, so it takes theirs.
  const accentOwnerId = greeting?.kind === "spotlight" ? greeting.subjectUserId : targetId;
  const profileQuery = useQuery({
    queryKey: qk.profile(accentOwnerId),
    queryFn: ({ signal }) => fetchProfile(accentOwnerId, signal),
    enabled: show,
  });

  if (!greeting) return null;

  const accentHex = profileQuery.data?.profile.accentHex;
  const close = (then?: () => void) => () => {
    setDismissed(true);
    ackMutation.mutate(
      greeting.kind === "spotlight"
        ? { kind: "spotlight", id: greeting.id }
        : { kind: "skill-intro" },
    );
    then?.();
  };

  if (greeting.kind === "spotlight") {
    return (
      <SpotlightModalView
        payload={greeting.payload}
        subjectUserId={greeting.subjectUserId}
        viewerId={userId}
        players={greetingQuery.data?.players ?? {}}
        accentHex={accentHex}
        onDismiss={close()}
        onCta={close(() => navigate(`/u/${greeting.subjectUserId}/skill`))}
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
      onDismiss={close()}
      onCta={close(() => navigate(`/u/${targetId}/skill`))}
    />
  );
}
