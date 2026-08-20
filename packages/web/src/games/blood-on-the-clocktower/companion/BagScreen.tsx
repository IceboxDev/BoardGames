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
  addResidentToBag,
  type BagSetup,
  bagCharacterReplacements,
  chooseDemonBluffs,
  type DemonSkill,
  dealBag,
  drunkStandInOptions,
  MAX_PLAYERS,
  replaceCharacterInBag,
  replaceDrunkStandIn,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useId, useState } from "react";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  SegmentedControl,
  Select,
  useConfirm,
} from "../../../components/ui";
import { CharacterIcon, Panel, Screen } from "./common";
import { TYPE_LABEL, TYPE_TEXT } from "./labels";
import type { BagDraft } from "./persistence";

/** Tappable candidate list shared by both halves of the token-change modal. */
function CandidateGrid({
  options,
  onPick,
}: {
  options: CharacterId[];
  onPick: (id: CharacterId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((id) => (
        <Button
          key={id}
          variant="secondary"
          size="sm"
          align="start"
          block
          className={`min-h-10 ${TYPE_TEXT[CHARACTERS[id].type]}`}
          onClick={() => onPick(id)}
        >
          <CharacterIcon character={id} size="sm" />
          <span className="min-w-0 truncate">{CHARACTERS[id].name}</span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Swap one bag token without re-rolling. Tapping the Drunk's stand-in offers
 * both moves it could mean: a different stand-in (Drunk stays) or replacing
 * the Drunk with a real Outsider. Baron/Godfather aren't swappable — their
 * setup adjustments shaped the whole bag.
 */
function TokenChangeModal({
  bag,
  token,
  drawnBy,
  onPickCharacter,
  onPickStandIn,
  onClose,
}: {
  bag: BagSetup;
  token: CharacterId;
  drawnBy?: string;
  onPickCharacter: (newChar: CharacterId) => void;
  onPickStandIn: (newStandIn: CharacterId) => void;
  onClose: () => void;
}) {
  const isStandIn = bag.believedCharacter !== undefined && token === bag.believedCharacter;
  const char: CharacterId = isStandIn ? "drunk" : token;
  const replacements = bagCharacterReplacements(bag, char);
  const standIns = isStandIn ? drunkStandInOptions(bag) : [];
  const isAdjuster = char === "baron" || char === "godfather";
  return (
    <Modal size="sm" onClose={onClose} eyebrow="Change token" title={CHARACTERS[token].name}>
      <ModalBody>
        <div className="flex flex-col gap-3">
          {drawnBy && (
            <p className="text-xs font-semibold text-amber-200">
              {drawnBy} already drew this token — their recorded draw follows the change.
            </p>
          )}
          {isStandIn ? (
            <>
              <p className="text-xs text-fg-secondary">
                This token is the Drunk's stand-in — whoever draws it is secretly the Drunk.
              </p>
              <div className="flex flex-col gap-1.5">
                <p className="text-3xs font-bold uppercase tracking-pill text-fg-muted">
                  Different stand-in (the Drunk stays)
                </p>
                <CandidateGrid options={standIns} onPick={onPickStandIn} />
              </div>
              {replacements.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-3xs font-bold uppercase tracking-pill text-fg-muted">
                    Or replace the Drunk with another Outsider
                  </p>
                  <CandidateGrid options={replacements} onPick={onPickCharacter} />
                </div>
              )}
            </>
          ) : isAdjuster ? (
            <p className="text-sm text-fg-secondary">
              The {CHARACTERS[char].name}'s setup adjustment shaped this bag's composition, so they
              can't be swapped one-for-one. Roll a different bag instead.
            </p>
          ) : replacements.length === 0 ? (
            <p className="text-sm text-fg-secondary">
              Every other {TYPE_LABEL[CHARACTERS[char].type]} is already in this game — there's
              nothing to swap {CHARACTERS[char].name} for.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-3xs font-bold uppercase tracking-pill text-fg-muted">
                Swap for a not-in-play {TYPE_LABEL[CHARACTERS[char].type]}
              </p>
              <CandidateGrid options={replacements} onPick={onPickCharacter} />
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

/** What a resident join physically changed, for the modal's second step. */
type ReshapeResult = {
  /** Resident count AFTER the join — captured at apply time, because the
   * live `residentCount` prop re-renders to the new count under the modal. */
  newCount: number;
  addTokens: CharacterId[];
  removeTokens: CharacterId[];
  droppedGodfather: boolean;
  clearedDraws: string[];
};

/**
 * Seat a late arrival without losing the rolled bag: as a Traveller (the
 * rulebook's late-joiner path — the bag is untouched) or as a resident (the
 * bag reshapes to the next player count's setup, and the second step lists
 * exactly which physical tokens to add and fish back out).
 */
function AddLatePlayerModal({
  takenNames,
  travellerFull,
  residentCount,
  onAddTraveller,
  onAddResident,
  onClose,
}: {
  takenNames: string[];
  travellerFull: boolean;
  residentCount: number;
  onAddTraveller: (name: string) => void;
  onAddResident: (name: string) => ReshapeResult;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<ReshapeResult | null>(null);
  const trimmed = name.trim();
  const duplicate = takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const ready = trimmed.length > 0 && !duplicate;
  const residentFull = residentCount >= MAX_PLAYERS;

  if (result) {
    return (
      <Modal size="sm" onClose={onClose} eyebrow="Late player seated" title={trimmed}>
        <ModalBody>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-secondary">
              The bag is now the {result.newCount}-player setup. Update the physical tokens:
            </p>
            <div className="flex flex-col gap-1.5">
              <p className="text-3xs font-bold uppercase tracking-pill text-emerald-300">
                Add to the bag
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.addTokens.map((t) => (
                  <span
                    key={t}
                    className={`flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[t].type]}`}
                  >
                    <CharacterIcon character={t} size="sm" />
                    {CHARACTERS[t].name}
                  </span>
                ))}
              </div>
            </div>
            {result.removeTokens.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-3xs font-bold uppercase tracking-pill text-rose-300">
                  Fish out of the bag
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.removeTokens.map((t) => (
                    <span
                      key={t}
                      className={`flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[t].type]}`}
                    >
                      <CharacterIcon character={t} size="sm" />
                      {CHARACTERS[t].name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.clearedDraws.length > 0 && (
              <p className="text-xs font-semibold text-amber-200">
                {result.clearedDraws.join(", ")} had drawn a removed token — record their new draw
                below.
              </p>
            )}
            {result.droppedGodfather && (
              <p className="text-xs font-semibold text-amber-200">
                The Godfather's ±1 Outsider no longer fits this player count and was dropped.
              </p>
            )}
            <Button variant="primary" block onClick={onClose}>
              Done
            </Button>
          </div>
        </ModalBody>
      </Modal>
    );
  }

  return (
    <Modal size="sm" onClose={onClose} eyebrow="Late arrival" title="Seat a late player">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            aria-label="Late player's name"
            autoComplete="off"
          />
          {duplicate && (
            <p className="text-xs font-semibold text-rose-300">
              Someone at the table already has that name.
            </p>
          )}
          <div className="flex flex-col gap-1">
            <Button
              variant="primary"
              block
              className="min-h-11"
              disabled={!ready || travellerFull}
              onClick={() => {
                onAddTraveller(trimmed);
                onClose();
              }}
            >
              Join as a Traveller
            </Button>
            <p className="text-xs text-fg-muted">
              The rulebook's path for late arrivals: they sit in the circle with an open character
              and never draw from the bag — the bag stays exactly as rolled.
              {travellerFull && " (Every Traveller of this edition is already in play.)"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              variant="secondary"
              block
              className="min-h-11"
              disabled={!ready || residentFull}
              onClick={() => setResult(onAddResident(trimmed))}
            >
              Join as a resident — reshape the bag
            </Button>
            <p className="text-xs text-fg-muted">
              Rebuilds the bag for {Math.min(residentCount + 1, MAX_PLAYERS)} players (the setup
              sheet's counts shift), keeping as much of the current bag as possible. You'll get
              exact token instructions.
              {residentFull && ` (The game seats at most ${MAX_PLAYERS} residents.)`}
            </p>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

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
  // The bag TOKEN whose change modal is open (the Drunk's stand-in counts).
  const [changing, setChanging] = useState<CharacterId | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);

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

  // Every structural edit (reroll, token swap, late seat) snapshots the
  // pre-edit draft so one accidental tap is always reversible.
  function snapshotUndo(label: string): NonNullable<BagDraft["undo"]> {
    return { label, seats: draft.seats, bag: draft.bag, draws: draft.draws };
  }

  function undoLast() {
    const u = draft.undo;
    if (!u) return;
    onChange({ ...draft, seats: u.seats, bag: u.bag, draws: u.draws, undo: undefined });
  }

  function redeal() {
    // A fresh bag for the residents; traveller picks are independent and kept.
    onChange({
      ...draft,
      bag: dealBag(residentCount, Math.random, demonSkill, edition),
      draws: seats.map(() => null),
      undo: snapshotUndo("bag reroll"),
    });
  }

  function applyCharacterSwap(newChar: CharacterId) {
    if (changing === null) return;
    const isStandIn = bag.believedCharacter !== undefined && changing === bag.believedCharacter;
    const nextBag = replaceCharacterInBag(bag, isStandIn ? "drunk" : changing, newChar, {
      demonSkill,
    });
    // The physical token the swap put in: the Drunk arrives as their stand-in.
    const newToken = newChar === "drunk" ? (nextBag.believedCharacter ?? newChar) : newChar;
    onChange({
      ...draft,
      bag: nextBag,
      draws: draft.draws.map((d) => (d === changing ? newToken : d)),
      undo: snapshotUndo("token swap"),
    });
    setChanging(null);
  }

  function applyStandInSwap(newStandIn: CharacterId) {
    if (changing === null) return;
    onChange({
      ...draft,
      bag: replaceDrunkStandIn(bag, newStandIn, { demonSkill }),
      draws: draft.draws.map((d) => (d === changing ? newStandIn : d)),
      undo: snapshotUndo("stand-in swap"),
    });
    setChanging(null);
  }

  function addTraveller(name: string) {
    onChange({
      ...draft,
      seats: [...seats, { name, traveller: { character: null, alignment: "good" } }],
      draws: [...draft.draws, null],
      undo: snapshotUndo(`seating ${name}`),
    });
  }

  function addResident(name: string) {
    // Characters whose tokens are already in players' hands — the reshape
    // avoids removing those so recorded draws survive where possible.
    const drawnCharacters = draft.draws
      .filter((d): d is CharacterId => d !== null)
      .map((t) =>
        bag.believedCharacter !== undefined && t === bag.believedCharacter
          ? ("drunk" as CharacterId)
          : t,
      );
    const result = addResidentToBag(bag, { demonSkill, avoidRemoving: drawnCharacters });
    const asToken = (id: CharacterId, b: BagSetup) =>
      id === "drunk" ? (b.believedCharacter ?? id) : id;
    const removeTokens = result.removed.map((id) => asToken(id, bag));
    const clearedDraws: string[] = [];
    const draws = draft.draws.map((d, i) => {
      if (d !== null && removeTokens.includes(d)) {
        clearedDraws.push(seats[i].name);
        return null;
      }
      return d;
    });
    onChange({
      ...draft,
      seats: [...seats, { name }],
      bag: result.bag,
      draws: [...draws, null],
      undo: snapshotUndo(`seating ${name}`),
    });
    return {
      newCount: result.bag.bagTokens.length,
      addTokens: result.added.map((id) => asToken(id, result.bag)),
      removeTokens,
      droppedGodfather: result.droppedGodfatherAdjustment,
      clearedDraws,
    };
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
            if (await confirm({ title: "Back to setup?", variant: "danger" })) onCancel();
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
                <Button
                  key={t}
                  variant="plain"
                  size="xs"
                  title={`Change the ${CHARACTERS[t].name} token`}
                  aria-label={`Change the ${CHARACTERS[t].name} token`}
                  onClick={() => setChanging(t)}
                  className={`gap-1.5 border border-white/15 bg-surface-950/60 text-sm font-semibold transition-colors hover:border-white/40 hover:bg-surface-900 ${TYPE_TEXT[CHARACTERS[t].type]}`}
                >
                  <CharacterIcon character={t} size="sm" />
                  {CHARACTERS[t].name}
                </Button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 text-xs text-amber-200">
          <p className="text-fg-muted">
            Tap any token to swap it for a different character without re-rolling.
          </p>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={redeal}>
            Roll a different bag
          </Button>
          {draft.undo && (
            <Button variant="ghost" size="sm" onClick={undoLast}>
              Undo {draft.undo.label}
            </Button>
          )}
        </div>
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
            shape="rounded"
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
                      size="sm"
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
                  size="sm"
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
        <Button
          className="mt-2"
          variant="secondary"
          size="sm"
          onClick={() => setAddingPlayer(true)}
        >
          Seat a late player
        </Button>
      </Panel>

      <Button variant="primary" size="lg" block disabled={!complete} onClick={onBegin}>
        Collect the tokens — begin the first night
      </Button>
      {!complete && (
        <p className="text-center text-xs text-fg-muted">
          Record every resident's token and every traveller's character to continue.
        </p>
      )}
      {changing !== null && (
        <TokenChangeModal
          bag={bag}
          token={changing}
          drawnBy={seats[draws.indexOf(changing)]?.name}
          onPickCharacter={applyCharacterSwap}
          onPickStandIn={applyStandInSwap}
          onClose={() => setChanging(null)}
        />
      )}
      {addingPlayer && (
        <AddLatePlayerModal
          takenNames={[...seats.map((s) => s.name), ...(storyteller ? [storyteller] : [])]}
          travellerFull={seats.filter((s) => s.traveller).length >= travellerPool.length}
          residentCount={residentCount}
          onAddTraveller={addTraveller}
          onAddResident={addResident}
          onClose={() => setAddingPlayer(false)}
        />
      )}
      {confirmDialog}
    </Screen>
  );
}
