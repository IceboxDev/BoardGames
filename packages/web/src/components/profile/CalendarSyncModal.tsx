// Three-state modal driving the Calendar Sync flow.
//   A. never connected      → primary CTA generates a token (POST)
//   B. token in memory       → big read-only URL, Copy, Google/Apple/Outlook
//                              deep-links, Regenerate (back to confirm), Done
//   C. connected, no token   → Regenerate (confirm) and Disconnect
// The raw token is only ever in transient state on the client; refreshing
// the page drops it (which is exactly the security property we want — the
// user only ever sees their URL right after generation).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  buildCalendarDeepLinks,
  type CalendarFeedTokenResponse,
  disconnectCalendarFeed,
  fetchCalendarFeedStatus,
  generateCalendarFeedToken,
} from "../../lib/calendar-feed.ts";
import { formatRelativeTime } from "../../lib/date-format.ts";
import { qk } from "../../lib/query-keys.ts";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { Modal } from "../ui/Modal.tsx";

type Props = {
  onClose: () => void;
};

export default function CalendarSyncModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: qk.calendarFeed(),
    queryFn: ({ signal }) => fetchCalendarFeedStatus(signal),
  });

  // In-memory raw-token state. Lives only as long as the modal is open or
  // the user navigates away. Reflects the most recent POST response.
  const [justMinted, setJustMinted] = useState<CalendarFeedTokenResponse | null>(null);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateCalendarFeedToken(),
    onSuccess: (data) => {
      setJustMinted(data);
      setConfirmingRegen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: qk.calendarFeed() });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Couldn't generate. Try again.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectCalendarFeed(),
    onSuccess: () => {
      setJustMinted(null);
      setConfirmingRegen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: qk.calendarFeed() });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Couldn't disconnect. Try again.");
    },
  });

  const connected = Boolean(statusQuery.data?.connected);

  // Decide which screen to show. State B (just-minted) takes priority because
  // it owns the most precious thing — the raw token we'll never show again.
  const screen: "A" | "B" | "C" = justMinted !== null ? "B" : connected ? "C" : "A";

  return (
    <Modal onClose={onClose} size="md" eyebrow="Subscribe" title="Calendar Sync">
      {error && <ErrorAlert message={error} />}

      {screen === "A" && (
        <StateNeverConnected
          loading={generateMutation.isPending}
          onGenerate={() => generateMutation.mutate()}
        />
      )}

      {screen === "B" && justMinted && (
        <StateTokenInMemory
          minted={justMinted}
          regenLoading={generateMutation.isPending}
          confirmingRegen={confirmingRegen}
          onRegenStart={() => setConfirmingRegen(true)}
          onRegenConfirm={() => generateMutation.mutate()}
          onRegenCancel={() => setConfirmingRegen(false)}
          onDone={onClose}
        />
      )}

      {screen === "C" && (
        <StateConnected
          status={statusQuery.data ?? { connected: true, createdAt: null, lastAccessedAt: null }}
          regenLoading={generateMutation.isPending}
          disconnectLoading={disconnectMutation.isPending}
          confirmingRegen={confirmingRegen}
          onRegenStart={() => setConfirmingRegen(true)}
          onRegenConfirm={() => generateMutation.mutate()}
          onRegenCancel={() => setConfirmingRegen(false)}
          onDisconnect={() => disconnectMutation.mutate()}
        />
      )}
    </Modal>
  );
}

// ── State A: never connected ──────────────────────────────────────────

function StateNeverConnected({
  loading,
  onGenerate,
}: {
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-fg-secondary">
        Get a private link that adds every locked game night to your calendar — titles tell you when
        you still need to RSVP or pick games, descriptions list the host, attendees, and what you've
        been asked to bring.
      </p>
      <p className="text-xs text-fg-muted">
        Calendars refresh on their own schedule — Apple within ~1 hour, Google can take up to a day.
        Your URL is private; we'll show it once.
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onGenerate} loading={loading} disabled={loading}>
          Generate my calendar URL
        </Button>
      </div>
    </div>
  );
}

// ── State B: token in memory ──────────────────────────────────────────

function StateTokenInMemory({
  minted,
  regenLoading,
  confirmingRegen,
  onRegenStart,
  onRegenConfirm,
  onRegenCancel,
  onDone,
}: {
  minted: CalendarFeedTokenResponse;
  regenLoading: boolean;
  confirmingRegen: boolean;
  onRegenStart: () => void;
  onRegenConfirm: () => void;
  onRegenCancel: () => void;
  onDone: () => void;
}) {
  const links = buildCalendarDeepLinks({
    subscribeUrl: minted.subscribeUrl,
    webcalUrl: minted.webcalUrl,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-fg-muted">
        This is your private URL. We won't show it again — keep it somewhere safe, or just paste it
        into your calendar now.
      </p>
      <CopyField value={minted.subscribeUrl} ariaLabel="Calendar subscription URL" />

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={links.google} external size="sm">
          Add to Google
        </ButtonLink>
        <ButtonLink href={links.apple} external size="sm">
          Add to Apple
        </ButtonLink>
        <ButtonLink href={links.outlook} external size="sm">
          Add to Outlook
        </ButtonLink>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {confirmingRegen ? (
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <span>Confirm — the URL above will stop working.</span>
            <Button variant="ghost" size="sm" onClick={onRegenCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onRegenConfirm}
              loading={regenLoading}
              disabled={regenLoading}
            >
              Regenerate
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={onRegenStart}>
            Regenerate
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onDone}>
          I've saved it — done
        </Button>
      </div>
    </div>
  );
}

// ── State C: connected, no token ──────────────────────────────────────

function StateConnected({
  status,
  regenLoading,
  disconnectLoading,
  confirmingRegen,
  onRegenStart,
  onRegenConfirm,
  onRegenCancel,
  onDisconnect,
}: {
  status: { connected: boolean; createdAt: string | null; lastAccessedAt: string | null };
  regenLoading: boolean;
  disconnectLoading: boolean;
  confirmingRegen: boolean;
  onRegenStart: () => void;
  onRegenConfirm: () => void;
  onRegenCancel: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
        <p className="font-semibold">Connected</p>
        <p className="mt-1 text-xs text-emerald-200/80">
          {status.createdAt ? `Set up ${formatRelativeTime(status.createdAt)}.` : ""}{" "}
          {status.lastAccessedAt
            ? `Your calendar last fetched it ${formatRelativeTime(status.lastAccessedAt)}.`
            : "Your calendar hasn't fetched it yet."}
        </p>
      </div>

      <p className="text-xs text-fg-muted">
        We don't store your URL. If you lost it, regenerate — your calendar will pick up the new one
        within a few hours.
      </p>

      <div className="flex items-center justify-between gap-2 pt-2">
        {confirmingRegen ? (
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <span>Confirm — your current URL will stop working.</span>
            <Button variant="ghost" size="sm" onClick={onRegenCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onRegenConfirm}
              loading={regenLoading}
              disabled={regenLoading}
            >
              Regenerate
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={onRegenStart}>
            Regenerate URL
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          onClick={onDisconnect}
          loading={disconnectLoading}
          disabled={disconnectLoading}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────
