import type { SiteStatus } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { useSiteStatus } from "../../hooks/useSiteStatus.ts";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";
import {
  adminFetchMemorialPreview,
  adminFetchSiteLog,
  adminHibernate,
  adminWake,
} from "../../lib/site";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal";
import { AdminSection } from "./AdminSection";

const CONFIRM_WORD = "HIBERNATE";
const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : WHEN.format(d);
}

/**
 * The admin's switch for the whole site: hibernate it into the goodbye
 * screen, or wake it up again. Nothing is deleted either way (server:
 * lib/site-state.ts), which the confirmation spells out.
 */
export function SiteHibernationCard() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const statusQuery = useSiteStatus();
  const status = statusQuery.data;
  const asleep = status?.hibernated === true;

  const logQuery = useQuery({
    queryKey: qk.adminSiteLog(),
    queryFn: ({ signal }) => adminFetchSiteLog(signal),
  });
  const [confirming, setConfirming] = useState<"hibernate" | "wake" | null>(null);

  function settle(next: SiteStatus) {
    queryClient.setQueryData(qk.siteStatus(user?.id), next);
    void queryClient.invalidateQueries({ queryKey: ["site", "status"] });
    void queryClient.invalidateQueries({ queryKey: qk.adminSiteLog() });
    setConfirming(null);
  }
  const hibernateMutation = useMutation({ mutationFn: adminHibernate, onSuccess: settle });
  const wakeMutation = useMutation({ mutationFn: adminWake, onSuccess: settle });
  const waking = wakeMutation.status === "pending";

  const summary = !status
    ? "Checking…"
    : asleep
      ? `Hibernating since ${status?.since ? when(status.since) : "—"}. Everyone sees the goodbye screen; online members can still play.`
      : "Awake. Hibernating freezes the whole site into a goodbye screen — nothing is deleted.";

  return (
    <div className="flex flex-col gap-6">
      <AdminSection tone={asleep ? "amber" : "accent"} eyebrow="Site" summary={summary}>
        <div className="flex flex-wrap items-center gap-2">
          {asleep ? (
            <Button variant="primary" size="sm" onClick={() => setConfirming("wake")}>
              Wake the site
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirming("hibernate")}>
              Hibernate the site…
            </Button>
          )}
          <Link
            to="/goodbye"
            className="text-sm font-medium text-accent-300 transition-colors hover:text-accent-200"
          >
            Preview the goodbye screen →
          </Link>
        </div>
      </AdminSection>

      <AdminSection
        tone="accent"
        eyebrow="History"
        summary={
          !logQuery.data
            ? "Checking…"
            : logQuery.data.entries.length === 0
              ? "Never hibernated."
              : `${logQuery.data?.entries.length} change${logQuery.data?.entries.length === 1 ? "" : "s"}`
        }
      >
        {(logQuery.data?.entries.length ?? 0) > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
            {logQuery.data?.entries.map((e) => (
              <li key={`${e.at}-${e.action}`}>
                <span className="tabular-nums text-fg-muted">{when(e.at)}</span> ·{" "}
                {e.action === "hibernate" ? "Hibernated" : "Woken up"}
                {e.byName ? ` by ${e.byName}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </AdminSection>

      {confirming === "hibernate" && (
        <HibernateModal
          pending={hibernateMutation.isPending}
          error={errorMessageOf(hibernateMutation.error, "Hibernating failed")}
          onConfirm={() => hibernateMutation.mutate()}
          onClose={() => {
            hibernateMutation.reset();
            setConfirming(null);
          }}
        />
      )}
      {confirming === "wake" && (
        <Modal
          size="sm"
          title="Wake the site?"
          onClose={() => {
            wakeMutation.reset();
            setConfirming(null);
          }}
        >
          <ModalBody>
            <p className="text-sm text-fg-secondary">
              Everything comes back as it was: the calendar, RSVPs, profiles and history. Nights
              still ahead reappear in everyone's subscribed calendars.
            </p>
          </ModalBody>
          <ModalFooter
            start={
              wakeMutation.error ? (
                <ErrorAlert message={errorMessageOf(wakeMutation.error, "Waking failed") ?? ""} />
              ) : null
            }
          >
            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={waking}
              onClick={() => wakeMutation.mutate()}
            >
              {waking ? "Waking…" : "Wake the site"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

function HibernateModal({
  pending,
  error,
  onConfirm,
  onClose,
}: {
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const preview = useQuery({
    queryKey: qk.adminSitePreview(),
    queryFn: ({ signal }) => adminFetchMemorialPreview(signal),
  });
  const m = preview.data;
  const ready = typed.trim() === CONFIRM_WORD;

  return (
    <Modal size="md" eyebrow="Whole site" title="Hibernate the site?" onClose={onClose}>
      <ModalBody gap="md">
        <div className="flex flex-col gap-2 text-sm text-fg-secondary">
          <p className="font-medium text-fg-primary">What happens</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Every page shows the goodbye screen, for everyone.</li>
            <li>Upcoming nights leave everyone's subscribed calendars.</li>
            <li>Members without online access can't use anything else.</li>
            <li>Members with online access get one button into the online games.</li>
          </ul>
          <p className="mt-2 font-medium text-fg-primary">What doesn't</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>No account, night, RSVP, match or setting is deleted or changed.</li>
            <li>Waking the site restores everything exactly as it was.</li>
          </ul>
        </div>
        {m && (
          <p className="text-xs text-fg-muted">
            Frozen on the goodbye screen: {m.nights} nights · {m.matches} games recorded ·{" "}
            {m.onlineGames} played online · {m.members} members.
          </p>
        )}
        <Field label={`Type ${CONFIRM_WORD} to confirm`} htmlFor={inputId}>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </ModalBody>
      <ModalFooter start={error ? <ErrorAlert message={error} /> : null}>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" disabled={!ready || pending} onClick={onConfirm}>
          {pending ? "Hibernating…" : "Hibernate the site"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
