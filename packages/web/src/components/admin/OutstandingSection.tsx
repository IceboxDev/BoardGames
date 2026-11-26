import {
  type AdminMemberNote,
  MEMBER_NOTE_MAX,
  type OutstandingItem,
} from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminCreateMemberNote,
  adminDeleteMemberNote,
  adminFetchMemberNotes,
  adminFetchOutstanding,
  adminUpdateMemberNote,
} from "../../lib/admin";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ClockIcon,
  FlagIcon,
  HostIcon,
  MegaphoneIcon,
  PadlockIcon,
  PlusIcon,
  StackIcon,
  StarIcon,
  TrashIcon,
  TruckIcon,
  UsersIcon,
} from "../icons";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ErrorAlert } from "../ui/ErrorAlert";
import { IconButton } from "../ui/IconButton";
import { Input } from "../ui/Input";
import { MicroLabel } from "../ui/Label";
import { outstandingLabel, reminderText } from "./outstanding-copy";
import type { AdminUser } from "./types";

// ── Outstanding ───────────────────────────────────────────────────────
//
// Below the availability calendar: everything this member still owes the
// group (blank days, RSVPs, picks, an EXIT box, the purchase poll, host
// details, their collection — computed on the server, see
// lib/member-outstanding.ts) and the admins' own notes on what else they
// owe. "Copy reminder" turns all of it into one message to send them.

const ICONS: Record<OutstandingItem["kind"], ReactNode> = {
  rsvp: <UsersIcon className="h-3.5 w-3.5" />,
  invite: <MegaphoneIcon className="h-3.5 w-3.5" />,
  vote: <StarIcon className="h-3.5 w-3.5" />,
  "stale-votes": <ClockIcon className="h-3.5 w-3.5" />,
  "exit-vote": <PadlockIcon className="h-3.5 w-3.5" />,
  "purchase-vote": <TruckIcon className="h-3.5 w-3.5" />,
  "host-details": <HostIcon className="h-3.5 w-3.5" />,
  collection: <StackIcon className="h-3.5 w-3.5" />,
};

/** Where the admin goes to see the item for themselves. */
function itemHref(item: OutstandingItem): string | null {
  if ("dateKey" in item) return `/offline?date=${item.dateKey}`;
  if (item.kind === "purchase-vote") return "/admin?tab=vote";
  return null;
}

function itemKey(item: OutstandingItem): string {
  return "dateKey" in item ? `${item.kind}@${item.dateKey}` : item.kind;
}

export function OutstandingSection({ user, blankDays }: { user: AdminUser; blankDays: number }) {
  const outstandingQuery = useQuery({
    queryKey: qk.adminOutstanding(),
    queryFn: ({ signal }) => adminFetchOutstanding(signal),
  });
  const notesQuery = useQuery({
    queryKey: qk.adminMemberNotes(user.id),
    queryFn: ({ signal }) => adminFetchMemberNotes(user.id, signal),
  });
  const items = outstandingQuery.data?.members[user.id]?.items ?? [];
  const notes = notesQuery.data ?? [];
  const openNotes = notes.filter((n) => n.doneAt === null);
  const count = items.length + openNotes.length + (blankDays > 0 ? 1 : 0);

  const [copied, setCopied] = useState(false);
  const reminder = reminderText({
    name: user.name || "",
    blankDays,
    items,
    notes,
    origin: window.location.origin,
  });
  async function copyReminder() {
    if (!reminder) return;
    try {
      await navigator.clipboard.writeText(reminder);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-label="Outstanding"
      className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line pt-3"
    >
      <div className="flex shrink-0 items-center gap-2">
        <MicroLabel as="h3" className="font-semibold">
          Outstanding
        </MicroLabel>
        {count > 0 && (
          <Badge tone="amber" shape="pill">
            {count}
          </Badge>
        )}
        <Button
          variant="secondary"
          size="xs"
          className="ml-auto"
          disabled={!reminder}
          onClick={copyReminder}
          title={reminder ?? "Nothing to remind them of"}
        >
          {copied ? "Copied" : "Copy reminder"}
        </Button>
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {outstandingQuery.isError ? (
          <ErrorAlert message="Could not load what they owe" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {blankDays > 0 && (
              <ItemRow
                icon={<FlagIcon className="h-3.5 w-3.5" />}
                title={`${blankDays} ${blankDays === 1 ? "day" : "days"} still blank`}
                detail="Availability over the next 6 weeks"
              />
            )}
            {items.map((item) => {
              const { title, detail } = outstandingLabel(item);
              return (
                <ItemRow
                  key={itemKey(item)}
                  icon={ICONS[item.kind]}
                  title={title}
                  detail={detail}
                  href={itemHref(item)}
                />
              );
            })}
            {outstandingQuery.isSuccess && items.length === 0 && blankDays === 0 && (
              <li className="px-1 text-xs text-fg-muted">
                All caught up — nothing the app can see.
              </li>
            )}
          </ul>
        )}

        <NotesBlock userId={user.id} notes={notes} loading={notesQuery.isPending} />
      </div>
    </section>
  );
}

function ItemRow({
  icon,
  title,
  detail,
  href,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  href?: string | null;
}) {
  const body = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-fg-primary">{title}</span>
        {detail && <span className="block truncate text-3xs text-fg-muted">{detail}</span>}
      </span>
      {href && <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-fg-muted" />}
    </>
  );
  const chrome = "flex items-center gap-2.5 rounded-card-lg bg-fill-soft px-2.5 py-1.5";
  return (
    <li>
      {href ? (
        <Link to={href} className={`${chrome} transition-colors hover:bg-fill`}>
          {body}
        </Link>
      ) : (
        <div className={chrome}>{body}</div>
      )}
    </li>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────

function NotesBlock({
  userId,
  notes,
  loading,
}: {
  userId: string;
  notes: AdminMemberNote[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const notesKey = qk.adminMemberNotes(userId);
  const setNotes = (update: (prev: AdminMemberNote[]) => AdminMemberNote[]) =>
    queryClient.setQueryData<AdminMemberNote[]>(notesKey, (prev) => update(prev ?? []));
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: notesKey });
    // The users table's chase count reads open notes too.
    void queryClient.invalidateQueries({ queryKey: qk.adminOutstanding() });
  };

  const create = useMutation({
    mutationFn: (text: string) => adminCreateMemberNote(userId, text),
    onSuccess: (note) => {
      setNotes((prev) => [note, ...prev]);
      setDraft("");
      setError(null);
    },
    onError: setError,
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { text?: string; done?: boolean } }) =>
      adminUpdateMemberNote(userId, id, patch),
    onMutate: ({ id, patch }) => {
      setError(null);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                text: patch.text ?? n.text,
                doneAt:
                  patch.done === undefined
                    ? n.doneAt
                    : patch.done
                      ? (n.doneAt ?? new Date().toISOString())
                      : null,
              }
            : n,
        ),
      );
    },
    onError: setError,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminDeleteMemberNote(userId, id),
    onMutate: (id) => {
      setError(null);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    },
    onError: setError,
    onSettled: settle,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text) create.mutate(text);
  };

  const open = notes.filter((n) => n.doneAt === null);
  const done = notes.filter((n) => n.doneAt !== null);

  return (
    <div className="flex flex-col gap-1.5">
      <MicroLabel as="h3" className="font-semibold">
        Your notes
      </MicroLabel>
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MEMBER_NOTE_MAX}
          placeholder="Something else they owe…"
          aria-label="New note"
          className="py-1.5 text-xs"
        />
        <IconButton
          type="submit"
          variant="bordered"
          size="sm"
          aria-label="Add note"
          disabled={!draft.trim() || create.isPending}
          icon={<PlusIcon className="h-3.5 w-3.5" />}
        />
      </form>
      {error != null && (
        <ErrorAlert message={errorMessageOf(error, "Could not save the note") ?? ""} />
      )}
      {!loading && open.length === 0 && done.length === 0 && (
        <p className="px-1 text-3xs text-fg-muted">
          Only admins see these. Tick one off once it's settled.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {open.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            onToggle={() => update.mutate({ id: note.id, patch: { done: true } })}
            onEdit={(text) => update.mutate({ id: note.id, patch: { text } })}
            onDelete={() => remove.mutate(note.id)}
          />
        ))}
      </ul>
      {done.length > 0 && (
        <div>
          {/* biome-ignore lint/correctness/noRestrictedElements: bespoke text expander — the same footnote toggle as DevicesSection */}
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="-mx-1 flex cursor-pointer items-center gap-1 rounded-ui-md px-1 py-1 text-2xs font-semibold uppercase tracking-label text-fg-muted transition-colors hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <ChevronDownIcon
              className={`h-3 w-3 transition-transform ${showDone ? "" : "-rotate-90"}`}
            />
            Done ({done.length})
          </button>
          {showDone && (
            <ul className="flex flex-col gap-1">
              {done.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  onToggle={() => update.mutate({ id: note.id, patch: { done: false } })}
                  onEdit={(text) => update.mutate({ id: note.id, patch: { text } })}
                  onDelete={() => remove.mutate(note.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  onToggle,
  onEdit,
  onDelete,
}: {
  note: AdminMemberNote;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const done = note.doneAt !== null;

  const commit = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== note.text) onEdit(next);
    else setText(note.text);
  };

  return (
    <li className="group flex items-center gap-2 rounded-card-lg bg-fill-soft px-2.5 py-1.5">
      <Checkbox
        checked={done}
        onChange={onToggle}
        aria-label={done ? `Reopen: ${note.text}` : `Tick off: ${note.text}`}
      />
      {editing ? (
        <Input
          autoFocus
          value={text}
          maxLength={MEMBER_NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setText(note.text);
              setEditing(false);
            }
          }}
          aria-label="Edit note"
          className="py-1 text-xs"
        />
      ) : (
        // biome-ignore lint/correctness/noRestrictedElements: the note's text is its own edit affordance
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={note.createdByName ? `Noted by ${note.createdByName}` : undefined}
          className={`min-w-0 flex-1 cursor-text text-left text-xs ${
            done ? "text-fg-muted line-through" : "text-fg-primary"
          }`}
        >
          {note.text}
        </button>
      )}
      <IconButton
        variant="subtle"
        size="xs"
        aria-label={`Delete note: ${note.text}`}
        onClick={onDelete}
        icon={<TrashIcon className="h-3 w-3" />}
      />
    </li>
  );
}
