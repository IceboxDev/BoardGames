import { getEdificeDef } from "@boardgames/core/games/7-wonders/edifice";
import type {
  SevenWondersPlayerBoardEdifice,
  SevenWondersPlayerView,
} from "@boardgames/core/games/7-wonders/machine";
import type { EdificeSlot } from "@boardgames/core/games/7-wonders/types";

const STATUS: Record<EdificeSlot["status"], { label: string; cls: string }> = {
  project: { label: "open", cls: "border-amber-400/40 bg-amber-400/5" },
  built: { label: "built", cls: "border-emerald-400/40 bg-emerald-400/5" },
  failed: { label: "failed", cls: "border-rose-500/40 bg-rose-500/5" },
};

const COLOR_LABEL: Record<string, string> = {
  brown: "raw",
  grey: "manufactured",
  blue: "civilian",
  yellow: "commercial",
  red: "military",
  green: "science",
};

function rewardText(card: string): string {
  const def = getEdificeDef(card);
  return def.reward
    .map((r) => {
      switch (r.kind) {
        case "coins":
          return `${r.amount}🪙`;
        case "shield":
          return `${r.amount}🛡`;
        case "victory-token":
          return `${r.value} VP`;
        case "remove-defeat-tokens":
          return "clear defeats";
        case "production":
          return "resource";
        case "points-per-wonder-stage":
          return "1 VP / stage";
        case "points-per-blue":
          return "1 VP / blue";
        case "points-per-color":
          return "1 VP / colour";
        case "points-per-brown-grey-set":
          return `${r.amount} VP / raw+man set`;
        case "duplicate-guild":
          return "copy a guild";
        default:
          return "";
      }
    })
    .join(" · ");
}

function penaltyText(card: string): string {
  const p = getEdificeDef(card).penalty;
  if (p.kind === "coins") return `pay ${p.amount}🪙`;
  if (p.kind === "lose-victory-tokens") return `lose ${p.amount} VP tokens`;
  return `discard a ${COLOR_LABEL[p.color] ?? p.color} card`;
}

function EdificeCard({
  slot,
  current,
  mine,
}: {
  slot: EdificeSlot;
  current: boolean;
  mine: SevenWondersPlayerBoardEdifice | undefined;
}) {
  const status = STATUS[slot.status];
  const joined = mine?.participation.includes(slot.age) ?? false;
  return (
    <div
      className={`flex min-w-44 flex-1 flex-col gap-0.5 rounded-lg border p-2 ${status.cls} ${
        current ? "ring-1 ring-amber-300/50" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-semibold text-fg-primary">
          Age {slot.age}: {slot.card}
        </span>
        <span className="shrink-0 text-4xs uppercase tracking-wide text-fg-secondary">
          {status.label}
        </span>
      </div>
      <span className="text-3xs text-emerald-300">✓ {rewardText(slot.card)}</span>
      <span className="text-3xs text-rose-300">✗ {penaltyText(slot.card)}</span>
      <div className="flex items-center justify-between text-4xs text-fg-secondary">
        <span>
          {slot.status === "project"
            ? `${slot.pawnsLeft} pawn${slot.pawnsLeft === 1 ? "" : "s"} left`
            : `${slot.participants.length} participated`}
        </span>
        {joined && <span className="text-amber-300">you joined</span>}
      </div>
    </div>
  );
}

export default function EdificePanel({
  view,
  myIndex,
}: {
  view: SevenWondersPlayerView;
  myIndex: number;
}) {
  if (!view.edifices) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {view.edifices.map((slot) => (
        <EdificeCard
          key={slot.age}
          slot={slot}
          current={slot.age === view.age}
          mine={view.playerEdifice?.[myIndex]}
        />
      ))}
    </div>
  );
}
