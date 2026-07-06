import type { AbilityKey, DndCharacter } from "@boardgames/core/protocol";
import { ABILITY_KEYS, displayCharacterName } from "@boardgames/core/protocol";
import { fmt, mod, passivePerception, proficiencyBonus, shortSpeed } from "../logic/sheet-derived";

// The in-game Players grid card: a full mini character sheet — identity,
// every combat vital, abilities, saves, trained skills, proficiencies,
// gear, and spells. The DM should almost never need to open the ledger
// mid-session; the card IS the overview. Click for the full sheet.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function Vital({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className={`flex min-w-0 flex-col items-center rounded-lg border py-1 ${tone}`}>
      <span className="font-fantasy text-sm font-bold leading-tight">{value}</span>
      <span className="text-4xs font-bold uppercase tracking-[0.14em] opacity-60">{label}</span>
    </span>
  );
}

function InfoLine({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <p className="text-2xs leading-snug text-amber-200/70" style={SERIF}>
      <span className="font-bold uppercase tracking-[0.1em] text-amber-300/60">{label} </span>
      {values.join(", ")}
    </p>
  );
}

type Props = {
  character: DndCharacter;
  onView: () => void;
};

export function PlayerCardLarge({ character, onView }: Props) {
  const sheet = character.sheet;
  if (!sheet) return null;
  const shownName = displayCharacterName(sheet, character.sourceFilename);

  const identityLine = [
    sheet.race,
    sheet.class,
    sheet.level !== null ? `Level ${sheet.level}` : null,
    sheet.alignment,
  ]
    .filter(Boolean)
    .join(" · ");

  const pp = passivePerception(sheet);
  const prof = proficiencyBonus(sheet.level);
  const trainedSkills = sheet.skills.filter((s) => s.proficiency !== "none");

  return (
    // biome-ignore lint/correctness/noRestrictedElements: full-card click target styled as a character sheet card; Button/Chip chrome doesn't fit.
    <button
      type="button"
      onClick={onView}
      className="flex h-full w-full flex-col gap-2.5 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-amber-400/45"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="font-fantasy grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500/20 text-lg font-bold text-amber-200 ring-1 ring-amber-400/50"
        >
          {shownName[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-fantasy block truncate text-lg font-bold leading-tight text-amber-100">
              {shownName}
            </span>
            {sheet.playerName && (
              <span className="shrink-0 truncate text-3xs text-amber-200/50" style={SERIF}>
                {sheet.playerName}
              </span>
            )}
          </span>
          <span className="block truncate text-xs italic text-amber-200/65" style={SERIF}>
            {identityLine}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        <Vital
          label="HP"
          value={sheet.maxHp !== null ? `${sheet.maxHp}` : "—"}
          tone="border-rose-400/30 bg-rose-950/25 text-rose-200"
        />
        <Vital
          label="AC"
          value={sheet.armorClass !== null ? `${sheet.armorClass}` : "—"}
          tone="border-sky-400/30 bg-sky-950/25 text-sky-200"
        />
        <Vital
          label="Init"
          value={sheet.abilities ? fmt(mod(sheet.abilities.dex)) : "—"}
          tone="border-amber-400/25 bg-amber-400/10 text-amber-200"
        />
        <Vital
          label="Speed"
          value={sheet.speed ? shortSpeed(sheet.speed) : "—"}
          tone="border-white/10 bg-white/[0.04] text-fg-secondary"
        />
        <Vital
          label="Pass. P"
          value={pp !== null ? `${pp}` : "—"}
          tone="border-emerald-400/25 bg-emerald-950/25 text-emerald-200"
        />
        <Vital
          label="Prof"
          value={prof !== null ? fmt(prof) : "—"}
          tone="border-purple-400/25 bg-purple-950/25 text-purple-200"
        />
      </div>

      {sheet.abilities && (
        <div className="grid grid-cols-6 gap-1.5">
          {ABILITY_KEYS.map((key) => {
            const score = sheet.abilities?.[key];
            if (score === undefined) return null;
            return (
              <span
                key={key}
                className="flex flex-col items-center rounded-lg border border-amber-400/20 bg-[#1a0606]/70 py-1"
              >
                <span className="text-4xs font-bold uppercase tracking-widest text-amber-300/60">
                  {ABILITY_LABEL[key]}
                </span>
                <span className="font-fantasy text-sm font-bold leading-tight text-amber-100">
                  {score}
                </span>
                <span className="text-3xs text-amber-200/50">{fmt(mod(score))}</span>
              </span>
            );
          })}
        </div>
      )}

      {trainedSkills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {trainedSkills.map((skill) => (
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

      <div className="flex flex-col gap-1">
        <InfoLine label="Saves" values={sheet.savingThrows} />
        <InfoLine label="Armor" values={sheet.armorProficiencies} />
        <InfoLine label="Weapons" values={sheet.weaponProficiencies} />
        <InfoLine label="Tools" values={sheet.toolProficiencies} />
        <InfoLine label="Languages" values={sheet.languages} />
      </div>

      {sheet.equipment.length > 0 && (
        <p className="line-clamp-2 text-2xs leading-snug text-amber-200/70" style={SERIF}>
          <span className="font-bold uppercase tracking-[0.1em] text-amber-300/60">Gear </span>
          {sheet.equipment.join(", ")}
        </p>
      )}
      {sheet.spells.length > 0 && (
        <p className="line-clamp-2 text-2xs leading-snug text-purple-200/80" style={SERIF}>
          <span className="font-bold uppercase tracking-[0.1em] text-purple-300/60">Spells </span>
          {sheet.spells.join(", ")}
        </p>
      )}

      {sheet.personality && (
        <p
          className="mt-auto line-clamp-2 text-xs italic leading-relaxed text-amber-200/55"
          style={SERIF}
        >
          {sheet.personality}
        </p>
      )}
    </button>
  );
}
