import type {
  ChatMessage,
  TimelineEntry,
  Whisper,
} from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, SegmentedControl, Select } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { useBotc } from "../context";

// The right rail: the town square's chat, private whispers, and the story so
// far. A player sees their own whispers and only THAT others whispered; the
// Storyteller reads every thread.

type Tab = "town" | "whispers" | "story";

const STORYTELLER = 0;

function nameOf(names: readonly string[], seat: number): string {
  if (seat === STORYTELLER) return "Storyteller";
  return names[seat] ?? `Player ${seat}`;
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Keeps a list scrolled to its newest line while the reader is at the bottom. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the list grows
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function Composer({
  placeholder,
  disabled,
  onSend,
  children,
}: {
  placeholder: string;
  disabled?: string | null;
  onSend: (text: string) => void;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };
  return (
    <form onSubmit={submit} className="flex shrink-0 flex-col gap-2 border-t border-line pt-2">
      {children}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ?? placeholder}
          disabled={Boolean(disabled)}
          maxLength={500}
          aria-label={placeholder}
        />
        <Button type="submit" size="sm" disabled={Boolean(disabled) || !text.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}

function Messages({
  items,
  names,
  you,
  empty,
}: {
  items: readonly (ChatMessage | Whisper)[];
  names: readonly string[];
  you: number;
  empty: string;
}) {
  const ref = useStickToBottom(items.length);
  return (
    <div ref={ref} className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      {items.length === 0 && <p className="text-sm text-fg-muted">{empty}</p>}
      {items.map((m) => (
        <p key={m.id} className="text-sm leading-snug">
          <span
            className={cn(
              "font-semibold",
              m.from === STORYTELLER
                ? "text-amber-300"
                : m.from === you
                  ? "text-accent-300"
                  : "text-fg-strong",
            )}
          >
            {nameOf(names, m.from)}
            {"to" in m ? ` → ${nameOf(names, m.to)}` : ""}
          </span>{" "}
          <span className="text-fg-primary">{m.text}</span>{" "}
          <span className="text-xs text-fg-disabled">{time(m.at)}</span>
        </p>
      ))}
    </div>
  );
}

function Story({ timeline }: { timeline: readonly TimelineEntry[] }) {
  const ref = useStickToBottom(timeline.length);
  return (
    <div ref={ref} className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      {timeline.length === 0 && <p className="text-sm text-fg-muted">Nothing has happened yet.</p>}
      {timeline.map((e) => (
        <p
          key={e.id}
          className={cn(
            "text-sm leading-snug",
            e.kind === "phase" ? "font-semibold text-amber-200" : "text-fg-primary",
            e.retracted && "text-fg-disabled line-through",
          )}
          title={e.retracted ? "The Storyteller took this back" : undefined}
        >
          {e.text}
        </p>
      ))}
    </div>
  );
}

/** Who a player's whisper threads are with: the Storyteller, then everyone else. */
function threadKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function WhisperTab() {
  const { view, act } = useBotc();
  const isSt = view.role === "storyteller";
  const people = view.names.map((_, i) => i).filter((i) => i !== view.you);
  const [to, setTo] = useState<number>(isSt ? (people[0] ?? 1) : STORYTELLER);
  const whispers = view.whispers;

  // The Storyteller reads threads between any pair; a player, their own.
  const threads = useMemo(() => {
    const map = new Map<string, Whisper[]>();
    for (const w of whispers) {
      const key = threadKey(w.from, w.to);
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return map;
  }, [whispers]);
  const [open, setOpen] = useState<string | null>(null);
  const openKey = open ?? threadKey(view.you, to);
  const shown = threads.get(openKey) ?? [];

  const night = view.phase.kind === "night";
  const disabled =
    view.stage === "over" || isSt || to === STORYTELLER
      ? null
      : !view.config.whispers
        ? "Whispers are off in this game"
        : !view.chatSettings.whispersOpen
          ? "The Storyteller has closed whispers"
          : night
            ? "The town is asleep"
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {isSt && threads.size > 0 && (
        <Select
          size="sm"
          value={open ?? ""}
          onChange={(e) => setOpen(e.target.value || null)}
          aria-label="Thread"
        >
          <option value="">My whispers with {nameOf(view.names, to)}</option>
          {[...threads.keys()].map((key) => {
            const [a, b] = key.split("-").map(Number);
            return (
              <option key={key} value={key}>
                {nameOf(view.names, a ?? 0)} ↔ {nameOf(view.names, b ?? 0)} (
                {threads.get(key)?.length})
              </option>
            );
          })}
        </Select>
      )}
      <Messages items={shown} names={view.names} you={view.you} empty="No whispers yet." />
      {view.role === "player" && view.whisperTicker.length > 0 && (
        <p className="text-xs text-fg-muted">
          Lately:{" "}
          {view.whisperTicker
            .slice(-3)
            .map((w) => `${nameOf(view.names, w.from)} ↔ ${nameOf(view.names, w.to)}`)
            .join(" · ")}
        </p>
      )}
      <Composer
        placeholder={`Whisper to ${nameOf(view.names, to)}`}
        disabled={disabled}
        onSend={(text) => {
          setOpen(null);
          act({ kind: "whisper", to, text });
        }}
      >
        <Select
          size="sm"
          value={String(to)}
          onChange={(e) => {
            setTo(Number(e.target.value));
            setOpen(null);
          }}
          aria-label="Whisper to"
        >
          {people.map((p) => (
            <option key={p} value={p}>
              {nameOf(view.names, p)}
            </option>
          ))}
        </Select>
      </Composer>
    </div>
  );
}

export function ChatRail() {
  const { view, act } = useBotc();
  const [tab, setTab] = useState<Tab>("town");
  const night = view.phase.kind === "night";
  const townDisabled =
    view.role === "storyteller" || view.stage === "over"
      ? null
      : !view.chatSettings.publicOpen
        ? "The Storyteller has closed the square"
        : night && !view.config.publicChatAtNight
          ? "The town is asleep"
          : null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SegmentedControl
        options={[
          { value: "town", label: "Town" },
          { value: "whispers", label: "Whispers" },
          { value: "story", label: "Story" },
        ]}
        value={tab}
        onChange={setTab}
        size="xs"
        shape="rounded"
      />
      {tab === "town" && (
        <>
          <Messages
            items={view.chat}
            names={view.names}
            you={view.you}
            empty="The square is quiet."
          />
          <Composer
            placeholder="Say something to the town"
            disabled={townDisabled}
            onSend={(text) => act({ kind: "chat", text })}
          />
        </>
      )}
      {tab === "whispers" && <WhisperTab />}
      {tab === "story" && <Story timeline={view.timeline} />}
    </div>
  );
}
