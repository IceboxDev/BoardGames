import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTER_SHEET_ORDER,
  CHARACTERS,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionPlayer,
  CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  changeCharacter,
  kill,
  nameAt,
  restoreGhostVote,
  revive,
  setNote,
  setPoison,
  spendGhostVote,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useId, useState } from "react";
import { Button, Field, Modal, ModalBody, Select, Textarea } from "../../../components/ui";
import type { UpdateState } from "./Companion";
import { Panel, StatusChips } from "./common";
import { TYPE_TEXT, trueCharacterLabel } from "./labels";

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

  return (
    <>
      <Panel tone="danger" title="Storyteller's eyes only">
        <ul className="flex flex-col gap-1">
          {state.players.map((p) => (
            <li key={p.seat}>
              <Button
                variant="plain"
                fill
                onClick={() => setOpenSeat(p.seat)}
                className="flex min-h-11 w-full flex-col gap-0.5 rounded-lg border border-white/5 bg-surface-950/50 px-2 py-1.5 text-left transition hover:border-white/20"
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span
                    className={`min-w-0 truncate text-sm font-semibold ${
                      p.alive ? "text-fg-primary" : "text-fg-muted line-through"
                    }`}
                  >
                    {p.seat + 1}. {p.name}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[p.character].type]}`}
                  >
                    {trueCharacterLabel(p)}
                  </span>
                </span>
                <span className="flex w-full items-center justify-between gap-2">
                  <StatusChips p={p} />
                  {p.butlerMaster !== undefined && (
                    <span className="text-3xs text-fg-muted">
                      master: {nameAt(state, p.butlerMaster)}
                    </span>
                  )}
                  {p.note && (
                    <span className="min-w-0 truncate text-3xs text-fg-muted">📝 {p.note}</span>
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-fg-muted">
          Seats are the table's clockwise order. Tap a player for manual overrides.
        </p>
      </Panel>
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
  const p: CompanionPlayer = state.players[seat];
  const character = CHARACTERS[p.character];
  const fieldId = useId();

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
          <p className="text-sm leading-relaxed text-fg-secondary">{character.ability}</p>
          <StatusChips p={p} />

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

          <Field label="Change character" htmlFor={`${fieldId}-character`}>
            <Select
              id={`${fieldId}-character`}
              value={p.character}
              onChange={(e) =>
                update((s) => changeCharacter(s, seat, e.target.value as CharacterId))
              }
            >
              {CHARACTER_SHEET_ORDER.map((id) => (
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
