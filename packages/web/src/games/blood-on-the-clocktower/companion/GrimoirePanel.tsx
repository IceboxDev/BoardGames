import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTERS,
  charactersOfType,
  sheetOrderOf,
  travellersOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionPlayer,
  CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  addTraveller,
  changeCharacter,
  clearDrunk,
  exileTraveller,
  exileVotesRequired,
  isTraveller,
  kill,
  moveSeat,
  nameAt,
  playerAt,
  removeTraveller,
  reorderSeats,
  restoreGhostVote,
  revive,
  setApprenticeAbility,
  setDrunk,
  setNote,
  setPoison,
  setTravellerAlignment,
  spendGhostVote,
  swapSeats,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { Reorder, useDragControls } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { GripVerticalIcon } from "../../../components/icons";
import {
  Button,
  Chip,
  Field,
  Input,
  MicroLabel,
  Modal,
  ModalBody,
  Select,
  Textarea,
} from "../../../components/ui";
import { RADIUS_CARD_MD } from "../../../components/ui/radii";
import { cn } from "../../../lib/cn";
import { CharacterIcon, Panel, StatusChips } from "./common";
import { TYPE_TEXT, trueCharacterLabel } from "./labels";
import type { UpdateState } from "./store";
import { Callout, SeatAfterSelect } from "./ui";

/**
 * The Grimoire: every seat's true character and states, Storyteller's eyes
 * only. Tapping a player opens their sheet with manual overrides — the escape
 * hatch for anything the wizard flow doesn't cover.
 */
export default function GrimoirePanel({
  state,
  update,
}: {
  state: CompanionState;
  update: UpdateState;
}) {
  const [openSeat, setOpenSeat] = useState<number | undefined>();
  // The list follows the drag live (Reorder needs the intermediate order);
  // the circle itself is re-seated once, when the handle is released.
  const [order, setOrder] = useState(state.players);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder(state.players), [state.players]);
  const commitOrder = () => {
    const seats = orderRef.current.map((p) => p.seat);
    if (seats.some((seat, i) => seat !== state.players[i].seat)) {
      update((s) => reorderSeats(s, seats));
    }
  };

  return (
    <>
      <Panel tone="danger" title="Storyteller's eyes only">
        <Reorder.Group
          as="ul"
          axis="y"
          values={order}
          onReorder={setOrder}
          className="flex flex-col gap-1"
        >
          {order.map((p) => (
            <GrimoireRow
              key={p.seat}
              state={state}
              player={p}
              onOpen={() => setOpenSeat(p.seat)}
              onDrop={commitOrder}
            />
          ))}
        </Reorder.Group>
        <p className="mt-2 text-xs text-fg-muted">
          Seats are the table's clockwise order — drag the handle to match the chairs. Tap a player
          for manual overrides.
        </p>
      </Panel>
      <TravellersPanel state={state} update={update} />
      <SwapSeatsPanel state={state} update={update} />
      {openSeat !== undefined && (
        <PlayerSheet
          state={state}
          update={update}
          seat={openSeat}
          onClose={() => setOpenSeat(undefined)}
        />
      )}
    </>
  );
}

/** One Grimoire row: drag handle → seat → name, character, status marks. */
function GrimoireRow({
  state,
  player: p,
  onOpen,
  onDrop,
}: {
  state: CompanionState;
  player: CompanionPlayer;
  onOpen: () => void;
  onDrop: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={p}
      as="li"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.02, zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.55)" }}
      className={cn(
        RADIUS_CARD_MD,
        "relative flex min-h-11 items-stretch border border-line-soft bg-surface-950/50 transition hover:border-line-strong",
      )}
    >
      {/* Pointer-only affordance; touch-none so a touch drag doesn't scroll. */}
      <div
        aria-hidden="true"
        onPointerDown={(e) => controls.start(e)}
        className="flex w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center text-fg-muted active:cursor-grabbing"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </div>
      <Button
        variant="plain"
        bleed
        onClick={onOpen}
        className="flex min-h-11 min-w-0 flex-1 flex-col gap-0.5 py-1.5 pr-2 text-left"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span
            className={`min-w-0 truncate text-sm font-semibold ${
              p.alive ? "text-fg-primary" : "text-fg-muted line-through"
            }`}
          >
            {p.seat + 1}. {p.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <CharacterIcon
              character={p.character}
              size="sm"
              className={p.alive ? "" : "opacity-40 saturate-50"}
            />
            <span className={`text-sm font-semibold ${TYPE_TEXT[CHARACTERS[p.character].type]}`}>
              {trueCharacterLabel(p)}
            </span>
          </span>
        </span>
        <span className="flex w-full items-center justify-between gap-2">
          <StatusChips p={p} />
          {p.butlerMaster !== undefined && (
            <span className="text-3xs text-fg-muted">master: {nameAt(state, p.butlerMaster)}</span>
          )}
          {p.grandchild !== undefined && (
            <span className="text-3xs text-fg-muted">
              grandchild: {nameAt(state, p.grandchild)}
            </span>
          )}
          {p.note && <span className="min-w-0 truncate text-3xs text-fg-muted">📝 {p.note}</span>}
        </span>
      </Button>
    </Reorder.Item>
  );
}

/**
 * Travellers join and leave mid-game (any day — or right at the start). The
 * character is rolled at random (rerollable, overridable); the alignment is
 * the Storyteller's secret pick, and the chair is picked as "after whom".
 */
function TravellersPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const inPlay = new Set(state.players.filter((p) => !p.left).map((p) => p.character));
  const available = travellersOf(state.script).filter((t) => !inPlay.has(t));
  const [name, setName] = useState("");
  const [alignment, setAlignment] = useState<"good" | "evil">("good");
  const [rolled, setRolled] = useState<CharacterId | undefined>();
  const [afterSeat, setAfterSeat] = useState<number | null>(state.players.at(-1)?.seat ?? null);
  const fieldId = useId();
  const character = rolled && available.includes(rolled) ? rolled : available[0];

  function roll() {
    if (available.length === 0) return;
    setRolled(available[Math.floor(Math.random() * available.length)]);
  }

  function add() {
    const trimmed = name.trim();
    if (!trimmed || !character) return;
    if (state.players.some((p) => !p.left && p.name.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    update((s) => addTraveller(s, trimmed, character, alignment, { afterSeat }));
    setName("");
    setRolled(undefined);
  }

  return (
    <Panel title="Travellers" tone="neutral">
      <p className="text-xs text-fg-muted">
        A latecomer can join any time as a Traveller: their character is public, their alignment is
        your secret call. Pick the chair they physically take — everyone else's seat number shifts
        round.
      </p>
      {available.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">All five travellers are in play.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Traveller's name"
            aria-label="Traveller's name"
            autoComplete="off"
          />
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm">
              {character && (
                <>
                  <CharacterIcon character={character} size="md" />
                  <span className="font-semibold text-purple-300">
                    {CHARACTERS[character].name}
                  </span>
                </>
              )}
            </span>
            <Button variant="secondary" size="sm" onClick={roll}>
              Roll character
            </Button>
            <Select
              aria-label="Traveller character override"
              block={false}
              size="sm"
              value={character ?? ""}
              onChange={(e) => setRolled(e.target.value as CharacterId)}
              className="w-32 shrink-0"
            >
              {available.map((t) => (
                <option key={t} value={t}>
                  {CHARACTERS[t].name}
                </option>
              ))}
            </Select>
          </div>
          {character && (
            <p className="text-xs leading-relaxed text-fg-muted">{CHARACTERS[character].ability}</p>
          )}
          <Field label="Where do they sit?" htmlFor={`${fieldId}-after`}>
            <SeatAfterSelect
              id={`${fieldId}-after`}
              players={state.players.filter((p) => !p.left)}
              value={afterSeat}
              onChange={setAfterSeat}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Chip
              pressed={alignment === "good"}
              tone="sky"
              size="md"
              onClick={() => setAlignment("good")}
            >
              Good
            </Chip>
            <Chip
              pressed={alignment === "evil"}
              tone="rose"
              size="md"
              onClick={() => setAlignment("evil")}
            >
              Evil
            </Chip>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!name.trim() || !character}
              onClick={add}
            >
              Joins town
            </Button>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-fg-muted">
        Exile ({exileVotesRequired(state)}+ votes of ALL players, dead included) and “leaves town”
        live on the traveller's player sheet above. Abilities never affect exile votes: the dead
        don't spend their ghost vote
        {state.script === "trouble-brewing" && ", and the Butler votes freely"}.
      </p>
    </Panel>
  );
}

/**
 * Chair swaps (the BMR Matron's ability — or just fixing a mis-entered
 * seating order). Players keep their identity; neighbours change.
 */
function SwapSeatsPanel({ state, update }: { state: CompanionState; update: UpdateState }) {
  const [a, setA] = useState<number | undefined>();
  const [b, setB] = useState<number | undefined>();
  const matron = state.players.find((p) => p.alive && !p.left && p.character === "matron");
  const seated = state.players.filter((p) => !p.left);
  const fieldId = useId();
  return (
    <Panel title="Swap seats" tone="neutral">
      <p className="text-xs text-fg-muted">
        {matron
          ? `${matron.name} (Matron) may swap up to 3 pairs of players each day — and nobody may leave their seat to talk in private.`
          : "Swap two players' chairs (seating-order fix). Neighbour-based abilities follow the physical table."}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {([a, b] as const).map((value, i) => (
          <Select
            // Two fixed selects — index key is stable here.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size pair
            key={i}
            id={`${fieldId}-swap-${i === 0 ? "a" : "b"}`}
            aria-label={`Swap seat ${i === 0 ? "A" : "B"}`}
            block={false}
            size="sm"
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              if (i === 0) setA(v);
              else setB(v);
            }}
            className="min-w-0 flex-1"
          >
            <option value="">— player…</option>
            {seated.map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.seat + 1}. {p.name}
              </option>
            ))}
          </Select>
        ))}
        <Button
          variant="secondary"
          disabled={a === undefined || b === undefined || a === b}
          onClick={() => {
            if (a === undefined || b === undefined) return;
            update((s) => swapSeats(s, a, b));
            setA(undefined);
            setB(undefined);
          }}
        >
          Swap
        </Button>
      </div>
    </Panel>
  );
}

function PlayerSheet({
  state,
  update,
  seat,
  onClose,
}: {
  state: CompanionState;
  update: UpdateState;
  seat: number;
  onClose: () => void;
}) {
  const p: CompanionPlayer = playerAt(state, seat);
  const character = CHARACTERS[p.character];
  const fieldId = useId();
  // The chair picker starts on the current position (a no-op move).
  const [moveAfter, setMoveAfter] = useState<number | null>(seat === 0 ? null : seat - 1);

  return (
    <Modal
      size="sm"
      onClose={onClose}
      eyebrow={trueCharacterLabel(p)}
      eyebrowClassName={TYPE_TEXT[character.type]}
      title={p.name}
    >
      <ModalBody>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CharacterIcon character={p.character} size="lg" />
            <p className="text-sm leading-relaxed text-fg-secondary">{character.ability}</p>
          </div>
          <StatusChips p={p} />
          {p.infoGiven && p.infoGiven.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <MicroLabel>Told at night</MicroLabel>
              <ul className="flex flex-col gap-0.5 text-xs text-fg-secondary">
                {p.infoGiven.map((e) => (
                  <li key={e.night}>
                    <span className="font-semibold text-fg-muted">N{e.night}</span> {e.told}
                    {e.truth !== undefined && e.truth !== e.told && (
                      <span className="text-amber-300"> (true: {e.truth})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {p.alive ? (
              <Button variant="danger" onClick={() => update((s) => kill(s, seat, "storyteller"))}>
                Mark dead
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => update((s) => revive(s, seat))}>
                Revive
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => update((s) => setPoison(s, p.poisoned ? undefined : seat))}
            >
              {p.poisoned ? "Cure poison" : "Poison"}
            </Button>
            {state.script === "bad-moon-rising" && (
              <Button
                variant="secondary"
                onClick={() =>
                  update((s) =>
                    (p.drunkNights ?? 0) > 0
                      ? clearDrunk(s, seat)
                      : setDrunk(s, seat, 1, p.character),
                  )
                }
              >
                {(p.drunkNights ?? 0) > 0 ? "Sober up" : "Make drunk"}
              </Button>
            )}
            {!p.alive && (
              <Button
                variant="secondary"
                onClick={() =>
                  update((s) => (p.ghostVote ? spendGhostVote(s, seat) : restoreGhostVote(s, seat)))
                }
              >
                {p.ghostVote ? "Spend ghost vote" : "Restore ghost vote"}
              </Button>
            )}
          </div>

          {(isTraveller(p) || p.character === "goon") && !p.left && (
            <Callout tone="purple" className="font-normal text-fg-primary">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-fg-secondary">
                  Alignment{p.character === "goon" && " (the Goon flips at night)"}
                </span>
                <Chip
                  pressed={p.alignment !== "evil"}
                  tone="sky"
                  size="sm"
                  onClick={() => update((s) => setTravellerAlignment(s, seat, "good"))}
                >
                  Good
                </Chip>
                <Chip
                  pressed={p.alignment === "evil"}
                  tone="rose"
                  size="sm"
                  onClick={() => update((s) => setTravellerAlignment(s, seat, "evil"))}
                >
                  Evil
                </Chip>
              </div>
              {p.alive && isTraveller(p) && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="danger"
                    onClick={() => {
                      update((s) => exileTraveller(s, seat));
                      onClose();
                    }}
                  >
                    Exile ({exileVotesRequired(state)}+ votes)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      update((s) => removeTraveller(s, seat));
                      onClose();
                    }}
                  >
                    Leaves town
                  </Button>
                </div>
              )}
              {isTraveller(p) && (
                <p className="text-3xs text-fg-muted">
                  Exile kills them (not an execution — the day continues). Leaving town removes them
                  entirely.
                </p>
              )}
            </Callout>
          )}

          {p.character === "apprentice" && !p.left && (
            <Field label="Apprentice's gained ability" htmlFor={`${fieldId}-apprentice`}>
              <Select
                id={`${fieldId}-apprentice`}
                value={p.apprenticeAbility ?? ""}
                onChange={(e) =>
                  update((s) => setApprenticeAbility(s, seat, e.target.value as CharacterId))
                }
              >
                <option value="">— not gained yet…</option>
                {charactersOfType(
                  p.alignment === "evil" ? "minion" : "townsfolk",
                  state.script,
                ).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {!p.left && (
            <Field label="Change chair" htmlFor={`${fieldId}-chair`}>
              <div className="flex items-center gap-2">
                <SeatAfterSelect
                  id={`${fieldId}-chair`}
                  players={state.players.filter((x) => !x.left)}
                  exclude={seat}
                  value={moveAfter}
                  onChange={setMoveAfter}
                />
                <Button
                  variant="secondary"
                  disabled={moveAfter === (seat === 0 ? null : seat - 1)}
                  onClick={() => {
                    update((s) => moveSeat(s, seat, moveAfter));
                    onClose();
                  }}
                >
                  Move
                </Button>
              </div>
            </Field>
          )}

          <Field label="Change character" htmlFor={`${fieldId}-character`}>
            <Select
              id={`${fieldId}-character`}
              value={p.character}
              onChange={(e) =>
                update((s) => changeCharacter(s, seat, e.target.value as CharacterId))
              }
            >
              {sheetOrderOf(state.script).map((id) => (
                <option key={id} value={id}>
                  {CHARACTERS[id].name} ({CHARACTERS[id].type})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Note" htmlFor={`${fieldId}-note`}>
            <Textarea
              id={`${fieldId}-note`}
              rows={2}
              defaultValue={p.note ?? ""}
              onBlur={(e) => update((s) => setNote(s, seat, e.target.value.trim()))}
              placeholder="Anything to remember about this player…"
            />
          </Field>
        </div>
      </ModalBody>
    </Modal>
  );
}
