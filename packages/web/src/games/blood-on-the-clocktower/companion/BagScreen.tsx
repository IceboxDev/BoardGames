import type {
  CharacterId,
  CharacterType,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTER_SHEET_ORDER,
  CHARACTERS,
  travellersOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  chooseDemonBluffs,
  type DemonSkill,
  dealBag,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useId } from "react";
import { Button, Chip, SegmentedControl, Select, useConfirm } from "../../../components/ui";
import { CharacterIcon, Panel, Screen } from "./common";
import { TYPE_LABEL, TYPE_TEXT } from "./labels";
import type { BagDraft } from "./persistence";

/**
 * The physical-bag stage — the phone NEVER leaves the Storyteller's hands.
 * The app names the tokens to drop in the bag; players draw them at the
 * table; the Storyteller records who pulled what, then starts the night.
 * Whoever draws the Drunk's stand-in Townsfolk token is secretly the Drunk.
 * Traveller seats never draw: their public character is rolled/picked here
 * and their alignment is the Storyteller's secret call.
 */
export default function BagScreen({
  draft,
  onChange,
  onCancel,
  onBegin,
}: {
  draft: BagDraft;
  onChange: (next: BagDraft) => void;
  onCancel: () => void;
  onBegin: () => void;
}) {
  const { seats, bag, draws, storyteller } = draft;
  const edition = draft.edition ?? "trouble-brewing";
  const travellerPool = travellersOf(edition);
  const demonSkill = draft.demonSkill ?? "new";
  const { confirm, confirmDialog } = useConfirm();
  const fieldId = useId();

  const taken = new Set(draws.filter((d): d is CharacterId => d !== null));
  const takenTravellers = new Set(
    seats.map((s) => s.traveller?.character).filter((c): c is CharacterId => c != null),
  );
  const residentCount = seats.filter((s) => !s.traveller).length;
  const complete = seats.every((s, i) =>
    s.traveller ? s.traveller.character !== null : draws[i] !== null,
  );

  // Bag tokens in character-sheet order, grouped by the TOKEN's own type (the
  // Drunk's stand-in shows under Townsfolk — that's what the players see).
  const sortedTokens = [...bag.bagTokens].sort(
    (a, b) => CHARACTER_SHEET_ORDER.indexOf(a) - CHARACTER_SHEET_ORDER.indexOf(b),
  );
  const groups: { type: CharacterType; tokens: CharacterId[] }[] = (
    ["townsfolk", "outsider", "minion", "demon"] as const
  )
    .map((type) => ({
      type,
      tokens: sortedTokens.filter((t) => CHARACTERS[t].type === type),
    }))
    .filter((g) => g.tokens.length > 0);
  const baronInPlay = bag.charactersInPlay.includes("baron");

  function setDraw(seat: number, token: CharacterId | null) {
    const draws = draft.draws.map((d, i) => (i === seat ? token : d));
    onChange({ ...draft, draws });
  }

  function setTraveller(
    seat: number,
    patch: Partial<{ character: CharacterId | null; alignment: "good" | "evil" }>,
  ) {
    onChange({
      ...draft,
      seats: seats.map((s, i) =>
        i === seat && s.traveller ? { ...s, traveller: { ...s.traveller, ...patch } } : s,
      ),
    });
  }

  function rollTraveller(seat: number) {
    const current = seats[seat].traveller?.character;
    const pool = travellerPool.filter((t) => t === current || !takenTravellers.has(t));
    if (pool.length === 0) return;
    setTraveller(seat, { character: pool[Math.floor(Math.random() * pool.length)] });
  }

  function redeal() {
    // A fresh bag for the residents; traveller picks are independent and kept.
    onChange({
      ...draft,
      bag: dealBag(residentCount, Math.random, demonSkill, edition),
      draws: seats.map(() => null),
    });
  }

  function setDemonSkill(skill: DemonSkill) {
    // Re-weight the bluffs for the new skill level; the bag itself is kept.
    onChange({
      ...draft,
      demonSkill: skill,
      bag: {
        ...bag,
        demonBluffs: chooseDemonBluffs({
          charactersInPlay: bag.charactersInPlay,
          believedCharacter: bag.believedCharacter,
          skill,
          edition,
        }),
      },
    });
  }

  return (
    <Screen>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-white">Prepare the bag</h1>
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            if (await confirm({ title: "Back to setup?", tone: "danger" })) onCancel();
          }}
        >
          Back to setup
        </Button>
      </header>
      {storyteller && (
        <p className="text-xs text-fg-secondary">
          Storyteller: <b className="text-fg-primary">{storyteller}</b> — keep this phone in your
          hands the whole game.
        </p>
      )}

      <Panel tone="gold" title={`Put these ${bag.bagTokens.length} tokens in the bag`}>
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.type} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-3xs font-bold uppercase tracking-pill text-fg-muted">
                {TYPE_LABEL[g.type]}
              </span>
              {g.tokens.map((t) => (
                <span
                  key={t}
                  className={`flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[t].type]}`}
                >
                  <CharacterIcon character={t} size="sm" />
                  {CHARACTERS[t].name}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 text-xs text-amber-200">
          {bag.believedCharacter && (
            <p>
              <b>The Drunk is in play</b> — the {CHARACTERS[bag.believedCharacter].name} token above
              is their stand-in. Whoever draws it is secretly the Drunk and must never find out.
            </p>
          )}
          {bag.lunaticDemon && (
            <p>
              <b>The Lunatic is in play</b> — both the {CHARACTERS[bag.lunaticDemon].name} and
              Lunatic tokens go in the bag, and the roles are secretly SWAPPED: whoever draws the{" "}
              {CHARACTERS[bag.lunaticDemon].name} token is really the Lunatic, and whoever draws the
              Lunatic token is the real {CHARACTERS[bag.lunaticDemon].name} (they learn so on the
              first night). Record who drew which token as drawn — the app does the swap.
            </p>
          )}
          {bag.godfatherAdjustment !== undefined && (
            <p>
              Godfather in play:{" "}
              {bag.godfatherAdjustment === 1
                ? "one Townsfolk was swapped for an extra Outsider"
                : "one Outsider was swapped for an extra Townsfolk"}
              .
            </p>
          )}
          {baronInPlay && <p>Baron in play: two Townsfolk were swapped for two extra Outsiders.</p>}
          {seats.some((s) => s.traveller) && (
            <p className="text-purple-300">
              Traveller seats don't draw — their token stays out of the bag; hand it to them openly
              once recorded below.
            </p>
          )}
        </div>
        <Button className="mt-2" variant="secondary" size="sm" onClick={redeal}>
          Roll a different bag
        </Button>
      </Panel>

      <Panel tone="night" title="Demon bluffs (shown on night 1)">
        <div className="flex flex-wrap gap-1.5">
          {bag.demonBluffs.map((id) => (
            <span
              key={id}
              className={`flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[id].type]}`}
            >
              <CharacterIcon character={id} size="sm" />
              {CHARACTERS[id].name}
            </span>
          ))}
        </div>
        <div className="mt-2">
          <SegmentedControl<DemonSkill>
            options={[
              { value: "new", label: "New demon" },
              { value: "experienced", label: "Experienced demon" },
            ]}
            value={demonSkill}
            onChange={setDemonSkill}
            shape="rect"
            size="xs"
            fullWidth
            selectionMode="toggle"
            tone="rose"
            aria-label="Demon bluff weighting"
          />
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          Three safe not-in-play claims for whoever draws the Imp, weighted for how practised they
          are: a new demon gets low-proof claims (Soldier, Monk…), an experienced one gets
          ongoing-info claims they can fabricate daily (Empath, Fortune Teller…). The Virgin and
          claims your game would expose are never offered. Toggling re-rolls them.
        </p>
        {residentCount <= 6 && (
          <p className="mt-2 text-xs font-semibold text-amber-200">
            Teensyville ({residentCount} players): there is no Minion/Demon info step at night — the
            Demon never learns these bluffs (nor who their Minion is). Keep them for your own
            reference only.
          </p>
        )}
      </Panel>

      <Panel title="Record the draw" tone="night">
        <p className="mb-2 text-xs text-fg-muted">
          Let each resident draw one token and look at it secretly, then record who drew what — only
          you see this screen. Pick each traveller's character and secret alignment here too.
        </p>
        <div className="flex flex-col gap-1.5">
          {seats.map((seatEntry, seat) => {
            const { name, traveller } = seatEntry;
            if (traveller) {
              const options = travellerPool.filter(
                (t) => t === traveller.character || !takenTravellers.has(t),
              );
              return (
                // Names are unique (setup dedupes on add/import) → stable keys.
                <div
                  key={name}
                  className="flex flex-col gap-1.5 rounded-lg border border-purple-400/25 bg-purple-400/5 p-1.5"
                >
                  <div className="flex min-h-9 items-center gap-2">
                    <span className="w-6 shrink-0 text-center text-xs font-bold text-fg-muted">
                      {seat + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-purple-300">
                      {name}
                    </span>
                    {traveller.character && (
                      <CharacterIcon character={traveller.character} size="sm" />
                    )}
                    <Select
                      id={`${fieldId}-seat-${seat}`}
                      aria-label={`Traveller character for ${name}`}
                      block={false}
                      compact
                      value={traveller.character ?? ""}
                      onChange={(e) =>
                        setTraveller(seat, {
                          character: e.target.value ? (e.target.value as CharacterId) : null,
                        })
                      }
                      className="w-40 shrink-0"
                    >
                      <option value="">— traveller…</option>
                      {options.map((t) => (
                        <option key={t} value={t}>
                          {CHARACTERS[t].name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pl-8">
                    <Button variant="secondary" size="xs" onClick={() => rollTraveller(seat)}>
                      Roll
                    </Button>
                    <Chip
                      pressed={traveller.alignment === "good"}
                      tone="sky"
                      size="sm"
                      onClick={() => setTraveller(seat, { alignment: "good" })}
                    >
                      Good
                    </Chip>
                    <Chip
                      pressed={traveller.alignment === "evil"}
                      tone="rose"
                      size="sm"
                      onClick={() => setTraveller(seat, { alignment: "evil" })}
                    >
                      Evil
                    </Chip>
                    <span className="text-3xs text-fg-muted">
                      character public · alignment secret
                    </span>
                  </div>
                </div>
              );
            }
            const current = draws[seat];
            const options = sortedTokens.filter((t) => t === current || !taken.has(t));
            return (
              <div key={name} className="flex min-h-11 items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-bold text-fg-muted">
                  {seat + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{name}</span>
                <Select
                  id={`${fieldId}-seat-${seat}`}
                  aria-label={`Token drawn by ${name}`}
                  block={false}
                  compact
                  value={current ?? ""}
                  onChange={(e) =>
                    setDraw(seat, e.target.value ? (e.target.value as CharacterId) : null)
                  }
                  className="w-40 shrink-0"
                >
                  <option value="">— drew…</option>
                  {options.map((t) => (
                    <option key={t} value={t}>
                      {CHARACTERS[t].name}
                      {t === bag.believedCharacter ? " (the Drunk)" : ""}
                      {bag.lunaticDemon !== undefined && t === bag.lunaticDemon
                        ? " (really the Lunatic)"
                        : ""}
                      {bag.lunaticDemon !== undefined && t === "lunatic"
                        ? ` (really the ${CHARACTERS[bag.lunaticDemon].name})`
                        : ""}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </Panel>

      <Button variant="primary" size="lg" block disabled={!complete} onClick={onBegin}>
        Collect the tokens — begin the first night
      </Button>
      {!complete && (
        <p className="text-center text-xs text-fg-muted">
          Record every resident's token and every traveller's character to continue.
        </p>
      )}
      {confirmDialog}
    </Screen>
  );
}
