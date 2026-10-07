import {
  ISSUES_FOR,
  MESSAGE_REQUIRED,
  type MyReport,
  REPORT_MESSAGE_MAX,
  type ReportIssue,
  type ReportSurface,
  type ReportTarget,
  SPOILS_ANSWER,
} from "@boardgames/core/protocol";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  Chip,
  ErrorAlert,
  FieldGroup,
  Modal,
  ModalBody,
  ModalFooter,
  SegmentedControl,
  SelectableCard,
  Textarea,
} from "../../../../components/ui";
import { errorMessageOf } from "../../../../lib/error-message";
import { districtByN } from "../../bands";
import { useMyReports, useReportMutations } from "../../hooks/useMyReports";
import { CAPTURES_KEYS_ATTR } from "../../keys";
import { useTrainerPaths } from "../../paths";
import { ISSUE_COPY } from "./issues";

// The report form: what's being reported (so there's no doubt), what kind
// of problem (one pick, each with a hint), which language it's in, and the
// details. Reporting the same issue again edits your open report rather
// than filing a duplicate — picking an issue you've already reported here
// switches the form to that report, with Withdraw beside Update.

export interface ReportContext {
  target: ReportTarget;
  /** What the member is looking at: the question text, or the article's title. */
  title: string;
  /** District 1–12. */
  category: number;
  surface: ReportSurface;
  /** Preselect an issue (the timeline's "Report wrong date"). */
  presetIssue?: ReportIssue;
  /** Before a study card is revealed: leave out issues that give the answer away. */
  hideSpoilers?: boolean;
  /** The language on screen, as the default for "which language". */
  language: "en" | "de" | "both";
}

const LANGUAGES = [
  { value: "en" as const, label: "English" },
  { value: "de" as const, label: "Deutsch" },
  { value: "both" as const, label: "Both" },
];

type Props = {
  context: ReportContext;
  onClose: () => void;
};

export function ReportDialog({ context, onClose }: Props) {
  const { target } = context;
  const d = districtByN(context.category);
  const paths = useTrainerPaths();
  const { openFor } = useMyReports();
  const { create, withdraw } = useReportMutations();
  const open = openFor(target.id);
  const messageId = useId();

  const issues = useMemo(
    () =>
      ISSUES_FOR[target.kind].filter(
        (i) => !context.hideSpoilers || !SPOILS_ANSWER.has(i) || i === context.presetIssue,
      ),
    [target.kind, context.hideSpoilers, context.presetIssue],
  );

  const startWith = (issue: ReportIssue | null): MyReport | null =>
    issue ? (open.find((r) => r.issue === issue) ?? null) : (open[0] ?? null);
  const initial = startWith(context.presetIssue ?? null);
  const [editing, setEditing] = useState<MyReport | null>(initial);
  const [issue, setIssue] = useState<ReportIssue | null>(
    initial?.issue ?? context.presetIssue ?? null,
  );
  const [language, setLanguage] = useState(initial?.language ?? context.language);
  const [message, setMessage] = useState(initial?.message ?? "");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState<"sent" | "updated" | "withdrawn" | null>(null);

  const pick = (next: ReportIssue) => {
    setIssue(next);
    const existing = open.find((r) => r.issue === next) ?? null;
    setEditing(existing);
    if (existing) {
      setLanguage(existing.language);
      setMessage(existing.message ?? "");
    }
  };

  const trimmed = message.trim();
  const needsMessage = issue !== null && MESSAGE_REQUIRED.has(issue);
  const problem =
    issue === null
      ? "Pick what's wrong."
      : needsMessage && trimmed === ""
        ? "Say what's wrong — it's the only way to know."
        : trimmed.length > REPORT_MESSAGE_MAX
          ? `Keep it under ${REPORT_MESSAGE_MAX} characters.`
          : null;

  const submit = () => {
    setTouched(true);
    if (problem || issue === null) return;
    create.mutate(
      { target, issue, language, message: trimmed, surface: context.surface },
      { onSuccess: (res) => setSent(res.updated ? "updated" : "sent") },
    );
  };

  const remove = () => {
    if (!editing) return;
    withdraw.mutate(editing.id, { onSuccess: () => setSent("withdrawn") });
  };

  const error = errorMessageOf(create.error ?? withdraw.error, "That didn't go through.");
  const what = target.kind === "question" ? "question" : "article";

  if (sent) {
    return (
      <Modal onClose={onClose} size="sm" density="compact" title="Report a problem">
        <ModalBody>
          <div
            {...{ [CAPTURES_KEYS_ATTR]: "" }}
            className="flex flex-col items-center gap-3 py-4 text-center"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckIcon className="h-5 w-5" />
            </span>
            <p className="text-base font-semibold text-fg-strong">
              {sent === "withdrawn"
                ? "Report withdrawn"
                : sent === "updated"
                  ? "Report updated"
                  : "Thanks — report sent"}
            </p>
            <p className="max-w-sm text-sm text-fg-secondary">
              {sent === "withdrawn"
                ? "It's off the review list."
                : "It's on the review list. You'll see the outcome — and any note — in Your reports."}
            </p>
            {sent !== "withdrawn" && (
              <Link
                to={paths.reports}
                onClick={onClose}
                className="text-sm font-medium text-accent-300 hover:text-accent-200"
              >
                Your reports →
              </Link>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      density="compact"
      eyebrow={`${d.label} · ${d.en}`}
      title={`Report a problem with this ${what}`}
      subheader={
        <p className="line-clamp-3 border-l-2 border-line-strong pl-3 text-sm text-fg-secondary">
          {context.title}
        </p>
      }
    >
      <ModalBody>
        {/* While this form is open, the screen behind it takes no shortcuts. */}
        <span {...{ [CAPTURES_KEYS_ATTR]: "" }} hidden />
        {open.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-fg-muted">You've reported here:</span>
            {open.map((r) => (
              <Chip
                key={r.id}
                pressed={editing?.id === r.id}
                tone="amber"
                size="xs"
                shape="pill"
                onClick={() => pick(r.issue)}
              >
                {ISSUE_COPY[r.issue].label}
              </Chip>
            ))}
            {editing && (
              <Button
                variant="link"
                size="xs"
                onClick={() => {
                  setEditing(null);
                  setIssue(null);
                  setMessage("");
                }}
              >
                Report something else
              </Button>
            )}
          </div>
        )}

        <FieldGroup label="What's wrong?">
          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Kind of problem">
            {issues.map((i) => {
              const already = open.some((r) => r.issue === i);
              return (
                <li key={i}>
                  <SelectableCard
                    variant="tile"
                    orientation="horizontal"
                    padding="sm"
                    className="h-full"
                    selected={issue === i}
                    onClick={() => pick(i)}
                    title={ISSUE_COPY[i].label}
                    description={ISSUE_COPY[i].hint}
                    trailing={
                      already ? (
                        <Badge tone="amber" size="xs">
                          Reported
                        </Badge>
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </FieldGroup>

        <FieldGroup label="Which language?">
          <SegmentedControl
            options={LANGUAGES}
            value={language}
            onChange={setLanguage}
            size="sm"
            shape="pill"
            selectionMode="toggle"
            aria-label="Which language"
          />
        </FieldGroup>

        <FieldGroup
          label={needsMessage ? "Details" : "Details (optional)"}
          hint={`${trimmed.length} / ${REPORT_MESSAGE_MAX}`}
        >
          <Textarea
            id={messageId}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={issue ? ISSUE_COPY[issue].placeholder : "Pick what's wrong first."}
            invalid={touched && problem !== null && issue !== null}
            maxLength={REPORT_MESSAGE_MAX + 200}
          />
        </FieldGroup>

        {touched && problem && <p className="text-xs text-rose-300">{problem}</p>}
        {error && <ErrorAlert message={error} />}
      </ModalBody>
      <ModalFooter
        start={
          editing && (
            <Button variant="ghost" tone="rose" onClick={remove} loading={withdraw.isPending}>
              Withdraw report
            </Button>
          )
        }
      >
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={create.isPending}>
          {editing ? "Update report" : "Send report"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
