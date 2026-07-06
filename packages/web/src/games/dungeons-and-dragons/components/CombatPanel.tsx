import type {
  ActionCard,
  Combatant,
  DndCharacter,
  DndCombat,
  DndNpc,
  ResolveTurnResponse,
} from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { characterActions } from "../../../lib/dnd-campaigns";
import { qk } from "../../../lib/query-keys";
import { getMonsterEntry } from "../logic/monsters";

// The combat main screen. Left: the rotating turn order — whoever acts now
// is always on top, sliding to the bottom after their turn. Right: the
// current combatant's normalized action dashboard (attacks, spells,
// features, basics — every character's view looks the same), or the enemy
// stat summary when a mob acts. When the referee has spoken, the
// in-between card (narration or rule alerts) overlays the dashboard until
// the DM logs it or amends the report.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

const KIND_STYLE: Record<ActionCard["kind"], { label: string; chip: string }> = {
  attack: { label: "Attack", chip: "bg-rose-500/15 text-rose-200 ring-rose-400/30" },
  spell: { label: "Spell", chip: "bg-purple-500/15 text-purple-200 ring-purple-400/30" },
  bonus: { label: "Bonus", chip: "bg-amber-400/15 text-amber-200 ring-amber-400/30" },
  feature: { label: "Feature", chip: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" },
  basic: { label: "Action", chip: "bg-sky-500/15 text-sky-200 ring-sky-400/30" },
};

function hpTone(c: Combatant): string {
  if (c.hp === null || c.maxHp === null) return "text-amber-200/60";
  if (c.hp <= 0) return "text-rose-400";
  if (c.hp * 3 <= c.maxHp) return "text-rose-300";
  return "text-emerald-200/90";
}

function CombatantRow({ c, active }: { c: Combatant; active: boolean }) {
  return (
    <li
      className={`rounded-xl border px-3 py-2 transition-colors ${
        active ? "border-rose-400/50 bg-rose-950/30" : "border-amber-400/10 bg-black/20 opacity-80"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`font-fantasy w-7 shrink-0 text-center text-base font-bold ${
            active ? "text-rose-200" : "text-amber-300/60"
          }`}
        >
          {c.initiative}
        </span>
        <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
          {c.name}
          {c.count > 1 && <span className="text-amber-300/70"> ×{c.count}</span>}
          {c.kind === "enemy" && (
            <span className="ml-1.5 align-middle text-3xs font-normal uppercase tracking-[0.15em] text-rose-300/60">
              foe
            </span>
          )}
        </span>
        {c.maxHp !== null && (
          <span className={`shrink-0 text-xs font-bold ${hpTone(c)}`}>
            {c.hp ?? c.maxHp}/{c.maxHp}
          </span>
        )}
      </div>
      {(c.conditions.length > 0 || c.position !== "" || c.notes !== "") && (
        <div className="mt-1 flex flex-wrap items-center gap-1 pl-9">
          {c.conditions.map((condition) => (
            <span
              key={condition}
              className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-3xs font-bold text-purple-200 ring-1 ring-purple-400/30"
            >
              {condition}
            </span>
          ))}
          {c.position !== "" && (
            <span className="text-3xs text-amber-200/50" style={SERIF}>
              {c.position}
            </span>
          )}
          {c.notes !== "" && (
            <span className="text-3xs italic text-amber-200/40" style={SERIF}>
              {c.notes}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function ActionDashboard({ characterId }: { characterId: string }) {
  const actionsQuery = useQuery({
    queryKey: qk.dndActions(characterId),
    queryFn: () => characterActions(characterId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (actionsQuery.isPending) {
    return (
      <p className="px-1 py-4 text-center text-xs text-amber-200/50" style={SERIF}>
        The sages are laying out the combat options…
      </p>
    );
  }
  if (actionsQuery.isError || !actionsQuery.data) {
    return (
      <p className="px-1 py-4 text-center text-xs text-rose-300" style={SERIF}>
        The action cards could not be drawn — resolve from the character sheet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {actionsQuery.data.cards.map((card) => {
        const style = KIND_STYLE[card.kind];
        return (
          <li
            key={`${card.kind}:${card.name}`}
            className="rounded-xl border border-amber-400/15 bg-black/25 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
                {card.name}
              </span>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-bold uppercase tracking-[0.12em] ring-1 ${style.chip}`}
              >
                {style.label}
              </span>
            </div>
            {card.roll !== "" && (
              <p className="mt-0.5 text-xs font-semibold text-amber-200/90">{card.roll}</p>
            )}
            {card.note !== "" && (
              <p className="mt-0.5 text-2xs leading-snug text-amber-200/50" style={SERIF}>
                {card.note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EnemyDashboard({ combatant, npcs }: { combatant: Combatant; npcs: DndNpc[] }) {
  const card = npcs.find((n) => n.name.toLowerCase() === combatant.name.toLowerCase()) ?? null;
  const monster = card ? null : getMonsterEntry(combatant.name);
  const ac = card?.armorClass ?? monster?.armorClass ?? null;
  return (
    <div className="rounded-xl border border-rose-400/20 bg-rose-950/15 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ac !== null && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-2xs font-bold text-sky-200 ring-1 ring-sky-400/30">
            AC {ac}
          </span>
        )}
        {combatant.maxHp !== null && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-2xs font-bold text-rose-200 ring-1 ring-rose-400/30">
            {combatant.hp ?? combatant.maxHp}/{combatant.maxHp} HP each
          </span>
        )}
        {card?.kind && (
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-2xs text-amber-200/70 ring-1 ring-white/10">
            {card.kind}
          </span>
        )}
      </div>
      {card ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-100/80" style={SERIF}>
          {card.description}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-amber-200/50" style={SERIF}>
          {monster
            ? "Statted from the compendium — run its attacks from the stat block and report the outcome below."
            : "No stat card charted — run it from the books and report the outcome below."}
        </p>
      )}
    </div>
  );
}

type Props = {
  combat: DndCombat;
  party: DndCharacter[];
  npcs: DndNpc[];
  /** The referee's last verdict — shown as the in-between card until dismissed. */
  turnResult: ResolveTurnResponse | null;
};

export function CombatPanel({ combat, party, npcs, turnResult }: Props) {
  const n = combat.combatants.length;
  const turnIndex = n > 0 ? combat.turnIndex % n : 0;
  const rotated = [...combat.combatants.slice(turnIndex), ...combat.combatants.slice(0, turnIndex)];
  const current = rotated[0] ?? null;
  const currentCharacter = current?.characterId
    ? (party.find((ch) => ch.id === current.characterId) ?? null)
    : null;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex w-64 shrink-0 flex-col rounded-2xl border border-rose-400/25 bg-gradient-to-b from-[#2a0808]/70 to-black/60 p-3">
        <p
          className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300/70"
          style={SERIF}
        >
          Round {combat.round} · turn order
        </p>
        <ol className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {rotated.map((c, i) => (
            <CombatantRow key={c.key} c={c} active={i === 0} />
          ))}
        </ol>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/60 via-surface-900/70 to-black/60 p-3.5">
        {turnResult !== null ? (
          turnResult.alerts.length > 0 ? (
            <div className="rounded-xl border border-rose-400/40 bg-rose-950/30 px-4 py-3">
              <p
                className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300"
                style={SERIF}
              >
                ⚠ The referee objects — nothing was applied
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {turnResult.alerts.map((alert) => (
                  <li
                    key={alert}
                    className="text-sm leading-relaxed text-rose-100/90"
                    style={SERIF}
                  >
                    • {alert}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-rose-200/60" style={SERIF}>
                The report is back in the chat below — amend it and send again.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-400/30 bg-black/30 px-4 py-3">
              <p
                className="text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/70"
                style={SERIF}
              >
                Read aloud
              </p>
              <p
                className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-amber-100/95"
                style={SERIF}
              >
                {turnResult.narration}
              </p>
            </div>
          )
        ) : null}

        {current && (
          <>
            <div className="flex items-baseline gap-2 px-0.5">
              <h3 className="font-fantasy text-lg font-bold text-amber-100">
                {current.name}
                {current.count > 1 && <span className="text-amber-300/70"> ×{current.count}</span>}
              </h3>
              <span className="text-2xs text-amber-200/50" style={SERIF}>
                {current.kind === "pc"
                  ? "acts now — their options:"
                  : "act now — the DM runs them:"}
              </span>
            </div>
            {current.kind === "pc" && currentCharacter ? (
              <ActionDashboard characterId={currentCharacter.id} />
            ) : (
              <EnemyDashboard combatant={current} npcs={npcs} />
            )}
            {turnResult === null && (
              <p className="mt-auto px-0.5 pt-1 text-2xs text-amber-200/40" style={SERIF}>
                Report what happened in the chat below — moves, rolls, damage taken and dealt. The
                referee updates everyone and reads the turn back.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
