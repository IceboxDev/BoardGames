import type {
  AbilityKey,
  CharacterSheet,
  DndCharacter,
  SkillProficiency,
} from "@boardgames/core/protocol";
import {
  ABILITY_KEYS,
  CharacterSheetSchema,
  DND_SKILLS,
  displayCharacterName,
} from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button, Field, Input, Modal, Textarea } from "../../../components/ui";
import { deleteCharacter, updateCharacter } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";
import { HoverTerm } from "./HoverTerm";

// The party ledger entry, laid out like the official 5e character sheet with
// a modern dark-D&D treatment: header band (name / class / player), a row of
// combat shields, the ability rail, saving throws + the full 18-skill list
// with proficiency pips, and labeled proficiency lines (Armor: … / Weapons:
// … / Tools: … / Languages: …) whose terms hover-open compendium cards.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ABILITY_ABBR: Record<AbilityKey, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmtMod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** 5e proficiency bonus by total level. */
function proficiencyBonus(level: number | null): number | null {
  if (level === null) return null;
  return Math.floor((level - 1) / 4) + 2;
}

/**
 * Passive Perception is DERIVED, never transcribed: 10 + the Perception
 * SKILL modifier (which already carries proficiency — 10+0+2, not 10+0);
 * 10 + WIS mod only when the skill list is missing entirely (old rows).
 */
function passivePerception(sheet: CharacterSheet): number | null {
  const perception = sheet.skills.find((s) => s.name === "Perception");
  if (perception) return 10 + perception.modifier;
  return sheet.abilities ? 10 + mod(sheet.abilities.wis) : null;
}

function ProficiencyPip({ level }: { level: SkillProficiency }) {
  return (
    <span
      role="img"
      aria-label={level}
      className={`inline-block h-2 w-2 shrink-0 rotate-45 rounded-[2px] border ${
        level === "expertise"
          ? "border-amber-200 bg-amber-300"
          : level === "proficient"
            ? "border-amber-300/80 bg-amber-400/50"
            : "border-amber-400/25 bg-transparent"
      }`}
    />
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <p
      className="border-b border-amber-400/20 pb-1 text-2xs font-bold uppercase tracking-[0.25em] text-amber-300/70"
      style={SERIF}
    >
      {children}
    </p>
  );
}

/** "Armor: light armor" — the classic labeled proficiency line. */
function LabeledTerms({ label, terms }: { label: string; terms: string[] }) {
  if (terms.length === 0) return null;
  return (
    <p className="text-xs leading-relaxed text-amber-200/75">
      <span className="font-bold uppercase tracking-wide text-amber-300/70">{label}: </span>
      {terms.map((term, i) => (
        <span key={term}>
          {i > 0 && ", "}
          <HoverTerm term={term} />
        </span>
      ))}
    </p>
  );
}

function ProseSection({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <SectionHeading>{title}</SectionHeading>
      <p className="text-sm leading-relaxed text-amber-200/75" style={SERIF}>
        {text}
      </p>
    </div>
  );
}

// ── Edit form ──────────────────────────────────────────────────────────

type FormState = {
  name: string;
  playerName: string;
  race: string;
  class: string;
  level: string;
  alignment: string;
  maxHp: string;
  armorClass: string;
  speed: string;
  abilities: Record<AbilityKey, string>;
  equipment: string;
  spells: string;
  languages: string;
  personality: string;
  backstory: string;
};

function sheetToForm(sheet: CharacterSheet): FormState {
  return {
    name: sheet.name ?? "",
    playerName: sheet.playerName ?? "",
    race: sheet.race ?? "",
    class: sheet.class,
    level: sheet.level?.toString() ?? "",
    alignment: sheet.alignment ?? "",
    maxHp: sheet.maxHp?.toString() ?? "",
    armorClass: sheet.armorClass?.toString() ?? "",
    speed: sheet.speed ?? "",
    abilities: {
      str: sheet.abilities?.str.toString() ?? "10",
      dex: sheet.abilities?.dex.toString() ?? "10",
      con: sheet.abilities?.con.toString() ?? "10",
      int: sheet.abilities?.int.toString() ?? "10",
      wis: sheet.abilities?.wis.toString() ?? "10",
      cha: sheet.abilities?.cha.toString() ?? "10",
    },
    equipment: sheet.equipment.join(", "),
    spells: sheet.spells.join(", "),
    languages: sheet.languages.join(", "),
    personality: sheet.personality ?? "",
    backstory: sheet.backstory ?? "",
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Merge the form over the existing sheet — skills etc. survive edits. */
function formToSheet(
  base: CharacterSheet,
  form: FormState,
): { sheet?: CharacterSheet; error?: string } {
  const candidate: CharacterSheet = {
    ...base,
    name: optionalText(form.name),
    playerName: optionalText(form.playerName),
    race: optionalText(form.race),
    class: form.class.trim(),
    level: optionalInt(form.level),
    alignment: optionalText(form.alignment),
    abilities: {
      str: optionalInt(form.abilities.str) ?? 10,
      dex: optionalInt(form.abilities.dex) ?? 10,
      con: optionalInt(form.abilities.con) ?? 10,
      int: optionalInt(form.abilities.int) ?? 10,
      wis: optionalInt(form.abilities.wis) ?? 10,
      cha: optionalInt(form.abilities.cha) ?? 10,
    },
    maxHp: optionalInt(form.maxHp),
    armorClass: optionalInt(form.armorClass),
    speed: optionalText(form.speed),
    languages: splitList(form.languages),
    equipment: splitList(form.equipment),
    spells: splitList(form.spells),
    personality: optionalText(form.personality),
    backstory: optionalText(form.backstory),
  };
  if (!candidate.name && !candidate.playerName) {
    return { error: "Give them a character name or a player name — one must remain." };
  }
  const parsed = CharacterSheetSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue?.path.map(String).join(".")}: ${issue?.message}` };
  }
  return { sheet: parsed.data };
}

// ── Modal ──────────────────────────────────────────────────────────────

type Props = {
  character: DndCharacter;
  onClose: () => void;
};

export function CharacterSheetModal({ character, onClose }: Props) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [form, setForm] = useState<FormState | null>(null); // non-null = edit mode
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const invalidate = () =>
    character.partyId
      ? queryClient.invalidateQueries({ queryKey: qk.dndCharacters(character.partyId) })
      : queryClient.invalidateQueries({ queryKey: ["dnd", "characters"] });

  const saveMutation = useMutation({
    mutationFn: (sheet: CharacterSheet) => updateCharacter(character.id, sheet),
    onSuccess: () => {
      void invalidate();
      setForm(null);
      setFormError(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCharacter(character.id),
    onSuccess: () => {
      void invalidate();
      onClose();
    },
  });

  const sheet = character.sheet;
  if (!sheet) return null;

  const shownName = displayCharacterName(sheet, character.sourceFilename);
  const profBonus = proficiencyBonus(sheet.level);
  const pp = passivePerception(sheet);
  const editing = form !== null;

  const skillRows = DND_SKILLS.map((def) => {
    const extracted = sheet.skills.find((s) => s.name === def.name);
    return {
      name: def.name,
      abbr: ABILITY_ABBR[def.ability],
      modifier: extracted?.modifier ?? (sheet.abilities ? mod(sheet.abilities[def.ability]) : 0),
      proficiency: extracted?.proficiency ?? ("none" as SkillProficiency),
    };
  });

  const savingThrowRows = ABILITY_KEYS.map((key) => {
    const proficient = sheet.savingThrows.some(
      (s) => s.toLowerCase() === ABILITY_LABEL[key].toLowerCase(),
    );
    const base = sheet.abilities ? mod(sheet.abilities[key]) : 0;
    return {
      key,
      label: ABILITY_LABEL[key],
      proficient,
      modifier: base + (proficient ? (profBonus ?? 2) : 0),
    };
  });

  const handleSave = () => {
    if (!form) return;
    const result = formToSheet(sheet, form);
    if (!result.sheet) {
      setFormError(result.error ?? "Invalid sheet");
      return;
    }
    setFormError(null);
    saveMutation.mutate(result.sheet);
  };

  const vitals: { label: string; value: string }[] = [
    ...(sheet.armorClass !== null ? [{ label: "Armor Class", value: `${sheet.armorClass}` }] : []),
    ...(sheet.abilities ? [{ label: "Initiative", value: fmtMod(mod(sheet.abilities.dex)) }] : []),
    ...(sheet.speed ? [{ label: "Speed", value: sheet.speed }] : []),
    ...(sheet.maxHp !== null ? [{ label: "Hit Point Max", value: `${sheet.maxHp}` }] : []),
    ...(profBonus !== null ? [{ label: "Proficiency", value: fmtMod(profBonus) }] : []),
    ...(pp !== null ? [{ label: "Passive Perception", value: `${pp}` }] : []),
  ];

  return (
    <Modal
      onClose={onClose}
      eyebrow="Party ledger"
      title={shownName}
      titleClassName="font-fantasy text-3xl font-bold text-amber-100"
      subheader={
        !editing ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-base italic text-amber-200/70" style={SERIF}>
              {[
                sheet.race,
                sheet.class,
                sheet.level !== null ? `Level ${sheet.level}` : null,
                sheet.alignment,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {sheet.playerName && (
              <p className="text-xs text-amber-300/60" style={SERIF}>
                played by{" "}
                <span className="font-semibold text-amber-200/80">{sheet.playerName}</span>
              </p>
            )}
          </div>
        ) : undefined
      }
      panelClassName="max-w-5xl max-h-[94vh] min-h-[80vh] overflow-y-auto border-amber-400/25"
    >
      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Character name"
              htmlFor={`${uid}-name`}
              hint="Leave empty to go by the player's name"
            >
              <Input
                id={`${uid}-name`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Player" htmlFor={`${uid}-player`}>
              <Input
                id={`${uid}-player`}
                value={form.playerName}
                onChange={(e) => setForm({ ...form, playerName: e.target.value })}
              />
            </Field>
            <Field label="Race" htmlFor={`${uid}-race`}>
              <Input
                id={`${uid}-race`}
                value={form.race}
                onChange={(e) => setForm({ ...form, race: e.target.value })}
              />
            </Field>
            <Field label="Class" htmlFor={`${uid}-class`}>
              <Input
                id={`${uid}-class`}
                value={form.class}
                onChange={(e) => setForm({ ...form, class: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Level" htmlFor={`${uid}-level`}>
                <Input
                  id={`${uid}-level`}
                  inputMode="numeric"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                />
              </Field>
              <Field label="Max HP" htmlFor={`${uid}-hp`}>
                <Input
                  id={`${uid}-hp`}
                  inputMode="numeric"
                  value={form.maxHp}
                  onChange={(e) => setForm({ ...form, maxHp: e.target.value })}
                />
              </Field>
              <Field label="AC" htmlFor={`${uid}-ac`}>
                <Input
                  id={`${uid}-ac`}
                  inputMode="numeric"
                  value={form.armorClass}
                  onChange={(e) => setForm({ ...form, armorClass: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Alignment" htmlFor={`${uid}-align`}>
              <Input
                id={`${uid}-align`}
                value={form.alignment}
                onChange={(e) => setForm({ ...form, alignment: e.target.value })}
              />
            </Field>
            <Field label="Speed" htmlFor={`${uid}-speed`}>
              <Input
                id={`${uid}-speed`}
                value={form.speed}
                placeholder="30 ft."
                onChange={(e) => setForm({ ...form, speed: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {ABILITY_KEYS.map((key) => (
              <Field key={key} label={key.toUpperCase()} htmlFor={`${uid}-${key}`}>
                <Input
                  id={`${uid}-${key}`}
                  inputMode="numeric"
                  value={form.abilities[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      abilities: { ...form.abilities, [key]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
          </div>

          <Field label="Languages" htmlFor={`${uid}-langs`} hint="Comma-separated">
            <Textarea
              id={`${uid}-langs`}
              rows={2}
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
            />
          </Field>
          <Field label="Equipment" htmlFor={`${uid}-equip`} hint="Comma-separated">
            <Textarea
              id={`${uid}-equip`}
              rows={2}
              value={form.equipment}
              onChange={(e) => setForm({ ...form, equipment: e.target.value })}
            />
          </Field>
          <Field
            label="Spells"
            htmlFor={`${uid}-spells`}
            hint="Comma-separated; empty for non-casters"
          >
            <Textarea
              id={`${uid}-spells`}
              rows={2}
              value={form.spells}
              onChange={(e) => setForm({ ...form, spells: e.target.value })}
            />
          </Field>
          <Field label="Personality" htmlFor={`${uid}-personality`}>
            <Textarea
              id={`${uid}-personality`}
              rows={3}
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
            />
          </Field>
          <Field label="Backstory" htmlFor={`${uid}-backstory`}>
            <Textarea
              id={`${uid}-backstory`}
              rows={4}
              value={form.backstory}
              onChange={(e) => setForm({ ...form, backstory: e.target.value })}
            />
          </Field>

          {(formError || saveMutation.isError) && (
            <p className="text-xs text-rose-300">
              {formError ?? errorMessageOf(saveMutation.error, "The ledger rejected the edits.")}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setForm(null);
                setFormError(null);
              }}
              disabled={saveMutation.isPending}
            >
              Discard
            </Button>
            <Button
              variant="tinted"
              tone="amber"
              loading={saveMutation.isPending}
              onClick={handleSave}
            >
              Inscribe changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Combat shields. */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {vitals.map((v) => (
              <div
                key={v.label}
                className="flex flex-col items-center rounded-xl border border-amber-400/25 bg-[#1a0606]/70 px-2 py-2"
              >
                <span className="font-fantasy text-xl font-bold text-amber-100">{v.value}</span>
                <span
                  className="mt-0.5 text-center text-4xs font-bold uppercase tracking-[0.14em] text-amber-300/60"
                  style={SERIF}
                >
                  {v.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            {/* Ability rail. */}
            {sheet.abilities && (
              <div className="grid grid-cols-3 gap-2 md:col-span-3 md:grid-cols-1 md:content-start">
                {ABILITY_KEYS.map((key) => {
                  const score = sheet.abilities?.[key];
                  if (score === undefined) return null;
                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center rounded-xl border border-amber-400/25 bg-[#1a0606]/70 px-2 py-2.5"
                    >
                      <span
                        className="text-4xs font-bold uppercase tracking-[0.2em] text-amber-300/70"
                        style={SERIF}
                      >
                        {ABILITY_LABEL[key]}
                      </span>
                      <span className="font-fantasy text-2xl font-bold text-amber-100">
                        {fmtMod(mod(score))}
                      </span>
                      <span className="rounded-full bg-black/40 px-2 text-2xs text-amber-200/60 ring-1 ring-amber-400/20">
                        {score}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Saving throws + skills — the sheet's middle column. */}
            <div className="flex flex-col gap-4 md:col-span-4">
              <div className="rounded-xl border border-amber-400/20 bg-black/25 p-3">
                <SectionHeading>Saving Throws</SectionHeading>
                <ul className="mt-2 flex flex-col gap-1">
                  {savingThrowRows.map((row) => (
                    <li key={row.key} className="flex items-center gap-2 text-xs">
                      <ProficiencyPip level={row.proficient ? "proficient" : "none"} />
                      <span className="w-7 text-right font-fantasy font-bold text-amber-100">
                        {fmtMod(row.modifier)}
                      </span>
                      <span className="text-amber-200/75">{row.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-400/20 bg-black/25 p-3">
                <SectionHeading>Skills</SectionHeading>
                <ul className="mt-2 flex flex-col gap-1">
                  {skillRows.map((row) => (
                    <li key={row.name} className="flex items-center gap-2 text-xs">
                      <ProficiencyPip level={row.proficiency} />
                      <span className="w-7 text-right font-fantasy font-bold text-amber-100">
                        {fmtMod(row.modifier)}
                      </span>
                      <span
                        className={
                          row.proficiency === "none" ? "text-amber-200/60" : "text-amber-100"
                        }
                      >
                        {row.name}
                      </span>
                      <span className="text-3xs text-amber-300/40">({row.abbr})</span>
                      {row.proficiency === "expertise" && (
                        <span className="text-3xs text-amber-300/60">••</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Proficiencies, gear, story — the sheet's right column. */}
            <div className="flex min-w-0 flex-col gap-4 md:col-span-5">
              <div className="flex flex-col gap-1.5 rounded-xl border border-amber-400/20 bg-black/25 p-3">
                <SectionHeading>Proficiencies & Languages</SectionHeading>
                <div className="mt-1 flex flex-col gap-1">
                  <LabeledTerms label="Armor" terms={sheet.armorProficiencies} />
                  <LabeledTerms label="Weapons" terms={sheet.weaponProficiencies} />
                  <LabeledTerms label="Tools" terms={sheet.toolProficiencies} />
                  <LabeledTerms label="Saving Throws" terms={sheet.savingThrows} />
                  <LabeledTerms label="Languages" terms={sheet.languages} />
                  {sheet.armorProficiencies.length === 0 &&
                    sheet.weaponProficiencies.length === 0 &&
                    sheet.toolProficiencies.length === 0 &&
                    sheet.languages.length === 0 && (
                      <LabeledTerms label="Proficiencies" terms={sheet.proficiencies} />
                    )}
                </div>
              </div>

              {sheet.equipment.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-amber-400/20 bg-black/25 p-3">
                  <SectionHeading>Equipment</SectionHeading>
                  <p className="mt-1 text-xs leading-relaxed text-amber-200/75">
                    {sheet.equipment.map((item, i) => (
                      <span key={item}>
                        {i > 0 && ", "}
                        <HoverTerm term={item} />
                      </span>
                    ))}
                  </p>
                </div>
              )}

              {sheet.spells.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-amber-400/20 bg-black/25 p-3">
                  <SectionHeading>Spells</SectionHeading>
                  <p className="mt-1 text-xs leading-relaxed text-amber-200/75">
                    {sheet.spells.map((spell, i) => (
                      <span key={spell}>
                        {i > 0 && ", "}
                        <HoverTerm term={spell} />
                      </span>
                    ))}
                  </p>
                </div>
              )}

              <ProseSection title="Personality" text={sheet.personality} />
              <ProseSection title="Backstory" text={sheet.backstory} />
            </div>
          </div>

          {deleteMutation.isError && (
            <p className="text-xs text-rose-300">
              {errorMessageOf(deleteMutation.error, "The page refused to burn.")}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/15 pt-3">
            <p className="text-3xs text-amber-200/40">
              Copied from {character.sourceFilename} by the scribes.
            </p>
            <div className="flex gap-2">
              {confirmingDelete ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                    Keep them
                  </Button>
                  <Button
                    variant="tinted"
                    tone="rose"
                    size="sm"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    Burn this page
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-300/70 hover:text-rose-300"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Remove from party
                  </Button>
                  <Button
                    variant="tinted"
                    tone="amber"
                    size="sm"
                    onClick={() => setForm(sheetToForm(sheet))}
                  >
                    Edit the ledger
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
