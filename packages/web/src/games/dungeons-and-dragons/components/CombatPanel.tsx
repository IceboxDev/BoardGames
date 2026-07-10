import type {
  ActionCard,
  Combatant,
  DndCharacter,
  DndCombat,
  DndNpc,
  ResolveTurnResponse,
} from "@boardgames/core/protocol";
import { ABILITY_KEYS } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "../../../components/ui";
import { characterActions } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";
import { ABILITY_ABBR } from "../logic/abilities";
import { getMonsterEntry } from "../logic/monsters";
import { fmt, mod, passivePerception, proficiencyBonus, shortSpeed } from "../logic/sheet-derived";
import { DndPanel, ReadAloudPanel, SectionEyebrow, StatPill, Vital } from "./ui";

// The combat main screen. Left: the rotating turn order — whoever acts now
// is always on top, sliding to the bottom after their turn. Right: the
// current combatant's full mini-sheet (vitals, abilities, trained skills)
// plus their normalized action dashboard. The dashboard is LIVE state: the
// referee grants options mid-fight (a Bardic Inspiration die, a handed
// potion) and strikes out ones that ran dry (out of arrows → Shortbow).
// When the referee has spoken, the in-between card (narration or rule
// alerts) sits above the dashboard until the DM logs it or amends.

const KIND_STYLE: Record<ActionCard["kind"], { label: string; chip: string }> = {
  attack: { label: "Attack", chip: "bg-rose-500/15 text-rose-200 ring-rose-400/30" },
  spell: { label: "Spell", chip: "bg-purple-500/15 text-purple-200 ring-purple-400/30" },
  bonus: { label: "Bonus", chip: "bg-amber-400/15 text-amber-200 ring-amber-400/30" },
  feature: { label: "Feature", chip: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" },
  basic: { label: "Action", chip: "bg-sky-500/15 text-sky-200 ring-sky-400/30" },
};

/** Best-known AC for a combatant: PC sheet, else campaign card, else compendium. */
function armorClassOf(c: Combatant, party: DndCharacter[], npcs: DndNpc[]): number | null {
  if (c.characterId) {
    const sheet = party.find((ch) => ch.id === c.characterId)?.sheet;
    if (sheet?.armorClass != null) return sheet.armorClass;
  }
  const card = npcs.find((n) => n.name.toLowerCase() === c.name.toLowerCase());
  if (card?.armorClass != null) return card.armorClass;
  return getMonsterEntry(c.name)?.armorClass ?? null;
}

function CombatantRow({ c, active, ac }: { c: Combatant; active: boolean; ac: number | null }) {
  return (
    <li
      className={`rounded-xl border px-3 py-2 transition-colors ${
        active ? "border-rose-400/50 bg-rose-950/30" : "border-amber-400/10 bg-black/20 opacity-80"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
          {c.name}
          {c.count > 1 && <span className="text-amber-300/70"> ×{c.count}</span>}
          {c.kind === "enemy" && (
            <span className="ml-1.5 align-middle text-3xs font-normal uppercase tracking-label text-rose-300/60">
              foe
            </span>
          )}
        </span>
        {ac !== null && <StatPill tone="ac">AC {ac}</StatPill>}
      </div>
      {(c.conditions.length > 0 || c.position !== "" || c.notes !== "") && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {c.conditions.map((condition) => (
            <StatPill key={condition} tone="condition">
              {condition}
            </StatPill>
          ))}
          {c.position !== "" && (
            <span className="font-serif-body text-3xs text-amber-200/50">{c.position}</span>
          )}
          {c.notes !== "" && (
            <span className="font-serif-body text-3xs italic text-amber-200/40">{c.notes}</span>
          )}
        </div>
      )}
    </li>
  );
}

/** The acting PC's mini-sheet: live vitals, abilities, trained skills. */
function CurrentPcStats({
  combatant,
  character,
}: {
  combatant: Combatant;
  character: DndCharacter;
}) {
  const sheet = character.sheet;
  if (!sheet) return null;
  const pp = passivePerception(sheet);
  const prof = proficiencyBonus(sheet.level);
  const trained = sheet.skills.filter((s) => s.proficiency !== "none");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Vital
          padded
          label="HP"
          value={
            combatant.maxHp !== null ? `${combatant.hp ?? combatant.maxHp}/${combatant.maxHp}` : "—"
          }
          tone="border-rose-400/30 bg-rose-950/25 text-rose-200"
        />
        <Vital
          padded
          label="AC"
          value={sheet.armorClass !== null ? `${sheet.armorClass}` : "—"}
          tone="border-sky-400/30 bg-sky-950/25 text-sky-200"
        />
        <Vital
          padded
          label="Speed"
          value={sheet.speed ? shortSpeed(sheet.speed) : "—"}
          tone="border-white/10 bg-white/[0.04] text-fg-secondary"
        />
        <Vital
          padded
          label="Pass. P"
          value={pp !== null ? `${pp}` : "—"}
          tone="border-emerald-400/25 bg-emerald-950/25 text-emerald-200"
        />
        <Vital
          padded
          label="Prof"
          value={prof !== null ? fmt(prof) : "—"}
          tone="border-purple-400/25 bg-purple-950/25 text-purple-200"
        />
        {sheet.abilities &&
          ABILITY_KEYS.map((key) => {
            const score = sheet.abilities?.[key];
            if (score === undefined) return null;
            return (
              <Vital
                padded
                key={key}
                label={ABILITY_ABBR[key]}
                value={`${score} ${fmt(mod(score))}`}
                tone="border-amber-400/20 bg-dnd-ink/70 text-amber-100"
              />
            );
          })}
      </div>
      {(trained.length > 0 || sheet.savingThrows.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {sheet.savingThrows.length > 0 && (
            <span className="font-serif-body text-2xs text-amber-200/60">
              <span className="font-bold uppercase tracking-label text-amber-300/60">Saves </span>
              {sheet.savingThrows.join(", ")}
            </span>
          )}
          {trained.map((skill) => (
            <span
              key={skill.name}
              className={`rounded-full px-1.5 py-0.5 text-3xs font-semibold ring-1 ${
                skill.proficiency === "expertise"
                  ? "bg-amber-400/15 text-amber-100 ring-amber-400/40"
                  : "bg-white/[0.05] text-amber-200/80 ring-white/10"
              }`}
            >
              {skill.name} {fmt(skill.modifier)}
              {skill.proficiency === "expertise" ? " ★" : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCardTile({
  card,
  unavailable,
  granted,
}: {
  card: ActionCard;
  unavailable?: boolean;
  granted?: boolean;
}) {
  const style = KIND_STYLE[card.kind];
  return (
    <li
      className={`rounded-xl border px-3 py-2 ${
        granted
          ? "border-amber-300/50 bg-amber-400/10"
          : unavailable
            ? "border-white/5 bg-black/15 opacity-45"
            : "border-amber-400/15 bg-black/25"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100 ${
            unavailable ? "line-through" : ""
          }`}
        >
          {card.name}
        </span>
        {granted && (
          <Badge tone="amber" shape="pill" size="xs" ring>
            Granted
          </Badge>
        )}
        {unavailable && (
          <Badge tone="neutral" shape="pill" size="xs" ring className="shrink-0">
            Spent
          </Badge>
        )}
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-bold uppercase tracking-label ring-1 ${style.chip}`}
        >
          {style.label}
        </span>
      </div>
      {card.roll !== "" && (
        <p
          className={`mt-0.5 text-xs font-semibold text-amber-200/90 ${unavailable ? "line-through" : ""}`}
        >
          {card.roll}
        </p>
      )}
      {card.note !== "" && (
        <p className="font-serif-body mt-0.5 text-2xs leading-snug text-amber-200/50">
          {card.note}
        </p>
      )}
    </li>
  );
}

/** Baseline sheet cards (referee-removed ones struck out) + granted extras. */
function ActionDashboard({
  combatant,
  characterId,
}: {
  combatant: Combatant;
  characterId: string;
}) {
  const actionsQuery = useQuery({
    queryKey: qk.dndActions(characterId),
    queryFn: () => characterActions(characterId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (actionsQuery.isPending) {
    return (
      <p className="font-serif-body px-1 py-4 text-center text-xs text-amber-200/50">
        The sages are laying out the combat options…
      </p>
    );
  }
  if (actionsQuery.isError || !actionsQuery.data) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 py-4">
        <p className="font-serif-body text-center text-xs text-rose-300">
          {errorMessageOf(
            actionsQuery.error,
            "The action cards could not be drawn — resolve from the character sheet.",
          )}
        </p>
        <Button
          variant="tinted"
          tone="amber"
          size="xs"
          loading={actionsQuery.isRefetching}
          onClick={() => void actionsQuery.refetch()}
        >
          Draw again
        </Button>
      </div>
    );
  }
  // The referee sometimes writes the full "Name — description" it saw in the
  // brief; match on the name prefix so those still strike the right card.
  const removed = combatant.removedActions.map((name) => name.toLowerCase());
  const isRemoved = (card: ActionCard) => {
    const name = card.name.toLowerCase();
    return removed.some((r) => r === name || r.startsWith(`${name} `));
  };
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {combatant.grantedActions.map((card) => (
        <ActionCardTile key={`granted:${card.name}`} card={card} granted />
      ))}
      {actionsQuery.data.cards.map((card) => (
        <ActionCardTile
          key={`${card.kind}:${card.name}`}
          card={card}
          unavailable={isRemoved(card)}
        />
      ))}
    </ul>
  );
}

function EnemyDashboard({ combatant, npcs }: { combatant: Combatant; npcs: DndNpc[] }) {
  const card = npcs.find((n) => n.name.toLowerCase() === combatant.name.toLowerCase()) ?? null;
  const monster = card ? null : getMonsterEntry(combatant.name);
  const ac = card?.armorClass ?? monster?.armorClass ?? null;
  const abilities = card?.abilities ?? null;
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-rose-400/20 bg-rose-950/15 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {ac !== null && (
            <StatPill tone="ac" className="px-2 text-2xs">
              AC {ac}
            </StatPill>
          )}
          {combatant.maxHp !== null && (
            <StatPill tone="hp" className="px-2 text-2xs">
              {combatant.hp ?? combatant.maxHp}/{combatant.maxHp} HP each
            </StatPill>
          )}
          {card?.kind && (
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-2xs text-amber-200/70 ring-1 ring-white/10">
              {card.kind}
            </span>
          )}
          {abilities &&
            ABILITY_KEYS.map((key) => (
              <span
                key={key}
                className="rounded-full bg-dnd-ink/70 px-2 py-0.5 text-2xs font-bold text-amber-100 ring-1 ring-amber-400/20"
              >
                {ABILITY_ABBR[key]} {abilities[key]} ({fmt(mod(abilities[key]))})
              </span>
            ))}
        </div>
        {card ? (
          <p className="font-serif-body mt-2 text-xs leading-relaxed text-amber-100/80">
            {card.description}
          </p>
        ) : (
          <p className="font-serif-body mt-2 text-xs leading-relaxed text-amber-200/50">
            {monster
              ? "Statted from the compendium — run its attacks from the stat block and report the outcome below."
              : "No stat card charted — run it from the books and report the outcome below."}
          </p>
        )}
      </div>
      {combatant.grantedActions.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {combatant.grantedActions.map((card2) => (
            <ActionCardTile key={`granted:${card2.name}`} card={card2} granted />
          ))}
        </ul>
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
  const currentSheet = currentCharacter?.sheet ?? null;
  const identity = currentSheet
    ? [
        currentSheet.race,
        currentSheet.class,
        currentSheet.level !== null ? `level ${currentSheet.level}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex w-64 shrink-0 flex-col rounded-2xl border border-rose-400/25 bg-gradient-to-b from-dnd-ash/70 to-black/60 p-3">
        <SectionEyebrow tone="rose">Round {combat.round} · turn order</SectionEyebrow>
        <ol className="scrollbar-hide mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {rotated.map((c, i) => (
            <CombatantRow key={c.key} c={c} active={i === 0} ac={armorClassOf(c, party, npcs)} />
          ))}
        </ol>
      </div>

      <DndPanel padding="md" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
        {turnResult !== null ? (
          turnResult.alerts.length > 0 ? (
            <ReadAloudPanel
              surface="inset"
              tone="rose"
              eyebrow="⚠ The referee objects — nothing was applied"
            >
              <ul className="flex flex-col gap-1.5 text-sm text-rose-100/90">
                {turnResult.alerts.map((alert) => (
                  <li key={alert}>• {alert}</li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-rose-200/60">
                The report is back in the chat below — amend it and send again.
              </p>
            </ReadAloudPanel>
          ) : (
            <ReadAloudPanel surface="inset">{turnResult.narration}</ReadAloudPanel>
          )
        ) : null}

        {current && (
          <>
            <div className="flex items-baseline gap-2 px-0.5">
              <h3 className="font-fantasy text-lg font-bold text-amber-100">
                {current.name}
                {current.count > 1 && <span className="text-amber-300/70"> ×{current.count}</span>}
              </h3>
              {identity && (
                <span className="font-serif-body truncate text-2xs italic text-amber-200/60">
                  {identity}
                </span>
              )}
              {currentSheet?.playerName && (
                <span className="font-serif-body shrink-0 text-2xs text-amber-200/45">
                  ({currentSheet.playerName})
                </span>
              )}
              <span className="font-serif-body ml-auto shrink-0 text-2xs text-amber-200/50">
                {current.kind === "pc" ? "acts now" : "act now — the DM runs them"}
              </span>
            </div>
            {current.kind === "pc" && currentCharacter ? (
              <>
                <CurrentPcStats combatant={current} character={currentCharacter} />
                <ActionDashboard combatant={current} characterId={currentCharacter.id} />
              </>
            ) : (
              <EnemyDashboard combatant={current} npcs={npcs} />
            )}
            {turnResult === null && (
              <p className="font-serif-body mt-auto px-0.5 pt-1 text-2xs text-amber-200/40">
                Report what happened in the chat below — moves, rolls, damage taken and dealt. The
                referee updates everyone and reads the turn back.
              </p>
            )}
          </>
        )}
      </DndPanel>
    </div>
  );
}
