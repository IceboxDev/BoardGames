import type { Participant } from "@boardgames/core/history/types";
import type { ReactNode } from "react";
import { Chip } from "../../ui/Chip";
import { FieldGroup } from "../../ui/Field";
import { ParticipantPicker } from "../ParticipantPicker";

// Shared building blocks for the match-outcome forms. Every form used to
// re-type the same root layout, the same "Players" field, the same
// keep-previous-state participant merge, byte-identical `withRole`/`withRank`/
// `withElim` helpers, and (three times) a pasted local `Label` component that
// had drifted from Field's label style. The shapes live here once.

// ── OutcomeFormShell ─────────────────────────────────────────────────────
//
// Root layout + the "Players" picker every player-list form starts with.
// `ParticipantPicker` is a chip group with no single focusable input, so the
// label is a `FieldGroup` (a `<label htmlFor>` pointing at nothing is a lie
// to assistive tech — which is what the old copies did).
//
// Forms whose roster isn't a flat player list (teams, one-vs-many, the
// role-script forms) skip the picker: omit `users`/`onParticipants` and the
// shell is just the standard column.

type OutcomeFormShellProps = {
  users?: { id: string; name: string }[];
  selectedIds?: string[];
  onParticipants?: (participants: Participant[]) => void;
  children: ReactNode;
};

export function OutcomeFormShell({
  users,
  selectedIds,
  onParticipants,
  children,
}: OutcomeFormShellProps) {
  return (
    <div className="flex flex-col gap-3">
      {users && selectedIds && onParticipants && (
        <FieldGroup label="Players">
          <ParticipantPicker users={users} selectedIds={selectedIds} onChange={onParticipants} />
        </FieldGroup>
      )}
      {children}
    </div>
  );
}

// ── GroupLabel ───────────────────────────────────────────────────────────
//
// Instruction/label line above a composite block ("Tap each player's villain,
// then crown the one who won."). Matches Field/FieldGroup's LABEL_CLS exactly
// — this used to exist as five pasted `Label` components and half a dozen
// inline spans across the forms, in two drifted spellings.

export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-label text-fg-secondary">
      {children}
    </span>
  );
}

// ── mergeParticipants ────────────────────────────────────────────────────
//
// The standard picker→players merge: keep accumulated per-player state
// (score, role, elimination, …) for players who stay selected; initialize
// newcomers with `init` (defaults to the bare participant).

export function mergeParticipants<P extends Participant>(
  prevPlayers: readonly P[],
  participants: Participant[],
  init: (p: Participant) => P = (p) => p as P,
): P[] {
  const byId = new Map(prevPlayers.map((p) => [p.userId, p] as const));
  return participants.map((p) => {
    const prev = byId.get(p.userId);
    return prev ? { ...prev, ...p } : init(p);
  });
}

// ── withOptional ─────────────────────────────────────────────────────────
//
// Set or clear an optional key WITHOUT leaving `undefined` on the wire object
// (the outcome schemas and MatchCard key off property presence). Replaces the
// byte-identical `withRole` / `withRank` / `withElim` / `withCondition`
// helpers that were pasted per form.

export function withOptional<P extends object, K extends keyof P>(
  p: P,
  key: K,
  val: P[K] | undefined,
): P {
  if (val === undefined) {
    const { [key]: _drop, ...rest } = p;
    return rest as P;
  }
  return { ...p, [key]: val };
}

// ── Elimination helpers ──────────────────────────────────────────────────

/** Next free elimination-order slot (0-based, append-at-end). */
export function nextEliminationOrder(players: readonly { eliminationOrder?: number }[]): number {
  const used = players.map((p) => p.eliminationOrder).filter((o): o is number => o !== undefined);
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

/** The "out #N" / "Surviving" status pair on an elimination row. */
export function SurvivalBadge({
  eliminationOrder,
  label = "Surviving",
}: {
  eliminationOrder: number | undefined;
  /** Override the surviving text ("2nd in chips"). */
  label?: ReactNode;
}) {
  if (eliminationOrder !== undefined) {
    return <span className="text-xs text-fg-muted">out #{eliminationOrder + 1}</span>;
  }
  return (
    <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-amber-200">
      {label}
    </span>
  );
}

// ── RoleChipRow ──────────────────────────────────────────────────────────
//
// The per-player role roster (Villainous villains, Dungeon Mayhem heroes,
// Lovecraft Letter states): one outlined chip per option, tap to toggle.

export function RoleChipRow({
  roster,
  current,
  onToggle,
}: {
  roster: readonly string[];
  current: string | undefined;
  onToggle: (role: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roster.map((role) => (
        <Chip
          key={role}
          pressed={current === role}
          tone="accent"
          variant="outlined"
          size="xs"
          onClick={() => onToggle(role)}
        >
          {role}
        </Chip>
      ))}
    </div>
  );
}
