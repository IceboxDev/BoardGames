import type { AbilityKey, CharacterSheet, DndCharacter } from "@boardgames/core/protocol";
import { ABILITY_KEYS, CharacterSheetSchema } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button, Field, Input, Modal, Textarea } from "../../../components/ui";
import { deleteCharacter, updateCharacter } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";

// The party ledger entry — the internal representation of a character,
// rendered as a full D&D-style sheet: ability column on the left, combat
// vitals and derived stats up top, features and story on the right. The DM
// can edit any extracted field or burn the entry entirely.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
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

function VitalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-amber-400/25 bg-[#1a0606]/70 px-3 py-1.5">
      <span className="font-fantasy text-base font-bold text-amber-100">{value}</span>
      <span
        className="text-4xs font-bold uppercase tracking-[0.18em] text-amber-300/60"
        style={SERIF}
      >
        {label}
      </span>
    </div>
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

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading>{title}</SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-amber-100/85 ring-1 ring-amber-400/20"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProseSection({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
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
  race: string;
  class: string;
  level: string;
  alignment: string;
  maxHp: string;
  armorClass: string;
  speed: string;
  abilities: Record<AbilityKey, string>;
  proficiencies: string;
  equipment: string;
  spells: string;
  personality: string;
  backstory: string;
};

function sheetToForm(sheet: CharacterSheet): FormState {
  return {
    name: sheet.name,
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
    proficiencies: sheet.proficiencies.join(", "),
    equipment: sheet.equipment.join(", "),
    spells: sheet.spells.join(", "),
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

function formToSheet(form: FormState): { sheet?: CharacterSheet; error?: string } {
  const candidate = {
    name: form.name.trim(),
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
    proficiencies: splitList(form.proficiencies),
    equipment: splitList(form.equipment),
    spells: splitList(form.spells),
    personality: optionalText(form.personality),
    backstory: optionalText(form.backstory),
  };
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

  const identityLine = [
    sheet.race,
    sheet.class,
    sheet.level !== null ? `Level ${sheet.level}` : null,
    sheet.alignment,
  ]
    .filter(Boolean)
    .join(" · ");

  const profBonus = proficiencyBonus(sheet.level);
  const editing = form !== null;

  const handleSave = () => {
    if (!form) return;
    const result = formToSheet(form);
    if (!result.sheet) {
      setFormError(result.error ?? "Invalid sheet");
      return;
    }
    setFormError(null);
    saveMutation.mutate(result.sheet);
  };

  return (
    <Modal
      onClose={onClose}
      eyebrow="Party ledger"
      title={sheet.name}
      titleClassName="font-fantasy text-3xl font-bold text-amber-100"
      subheader={
        !editing && identityLine ? (
          <p className="text-base italic text-amber-200/70" style={SERIF}>
            {identityLine}
          </p>
        ) : undefined
      }
      panelClassName="max-w-4xl max-h-[92vh] overflow-y-auto border-amber-400/25"
    >
      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor={`${uid}-name`}>
              <Input
                id={`${uid}-name`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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

          <Field
            label="Proficiencies"
            htmlFor={`${uid}-prof`}
            hint="Comma-separated (e.g. Athletics, Persuasion)"
          >
            <Textarea
              id={`${uid}-prof`}
              rows={2}
              value={form.proficiencies}
              onChange={(e) => setForm({ ...form, proficiencies: e.target.value })}
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
          {/* Combat vitals + derived stats. */}
          <div className="flex flex-wrap gap-2">
            {sheet.maxHp !== null && <VitalChip label="Hit Points" value={`${sheet.maxHp}`} />}
            {sheet.armorClass !== null && (
              <VitalChip label="Armor Class" value={`${sheet.armorClass}`} />
            )}
            {sheet.speed && <VitalChip label="Speed" value={sheet.speed} />}
            {sheet.abilities && (
              <VitalChip label="Initiative" value={fmtMod(mod(sheet.abilities.dex))} />
            )}
            {profBonus !== null && <VitalChip label="Proficiency" value={fmtMod(profBonus)} />}
            {sheet.abilities && (
              <VitalChip label="Passive Perception" value={`${10 + mod(sheet.abilities.wis)}`} />
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[200px_1fr]">
            {/* Ability column — the classic left rail of a 5e sheet. */}
            {sheet.abilities && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:content-start">
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

            <div className="flex min-w-0 flex-col gap-5">
              <ListSection title="Proficiencies" items={sheet.proficiencies} />
              <ListSection title="Equipment" items={sheet.equipment} />
              <ListSection title="Spells" items={sheet.spells} />
              <ProseSection title="Personality" text={sheet.personality} />
              <ProseSection title="Backstory" text={sheet.backstory} />
            </div>
          </div>

          {deleteMutation.isError && (
            <p className="text-xs text-rose-300">
              {errorMessageOf(deleteMutation.error, "The page refused to burn.")}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/15 pt-3">
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
