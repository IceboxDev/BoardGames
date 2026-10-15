import type { CompanionAction } from "@boardgames/core/games/blood-on-the-clocktower/actions";
import {
  CHARACTERS,
  sheetOrderOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { isTraveller } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useState } from "react";
import { Button, Eyebrow, Input, Modal, ModalBody, Select } from "../../../../components/ui";
import { trueCharacterLabel } from "../../companion/labels";
import { CharacterIcon } from "../../companion/ui";
import { InfoCard } from "../components/InfoCard";
import { useStoryteller } from "../context";
import { asCharacter, chairOf } from "../helpers";

/**
 * One player's page of the Grimoire: their truth, what they were told, and
 * every edit the phone companion's player sheet offers — sent as Grimoire
 * actions. Also where the Storyteller acts for a player who is away.
 */
export function SeatSheet({ roomSeat, onClose }: { roomSeat: number; onClose: () => void }) {
  const { view, st } = useStoryteller();
  const [text, setText] = useState("");
  const state = view.companion;
  const chair = state ? chairOf(state, roomSeat) : undefined;
  const p = chair !== undefined ? state?.players[chair] : undefined;
  if (!state || chair === undefined || !p) return null;
  const edit = (action: CompanionAction, label: string) => st({ kind: "grimoire", action, label });
  const name = p.name;
  const bmr = state.script === "bad-moon-rising";
  const shown = view.shown[roomSeat];
  const inbox = view.inbox[roomSeat] ?? [];
  const away = !view.connected[roomSeat];
  const vote = view.day.vote;

  return (
    <Modal onClose={onClose} size="md" density="compact" eyebrow={`Seat ${chair + 1}`} title={name}>
      <ModalBody gap="md">
        <div className="flex items-center gap-3">
          <CharacterIcon character={p.character} size="lg" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-fg-strong">{trueCharacterLabel(p)}</span>
            <span className="text-xs text-fg-muted">
              {p.alive ? "Alive" : p.registersDead ? "Appears dead" : "Dead"}
              {p.poisoned ? " · poisoned" : ""}
              {(p.drunkNights ?? 0) > 0 ? " · drunk" : ""}
              {p.protectedTonight ? " · protected tonight" : ""}
              {p.redHerring ? " · red herring" : ""}
              {away ? " · away" : ""}
            </span>
            {shown && shown.character !== p.character && (
              <span className="text-xs text-amber-300">
                Believes: {CHARACTERS[shown.character].name}
              </span>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-1.5">
          <Eyebrow>Grimoire</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {p.alive ? (
              <Button
                size="xs"
                variant="tinted"
                tone="rose"
                onClick={() =>
                  edit({ type: "kill", seat: chair, cause: "storyteller" }, `${name} dies`)
                }
              >
                Kill
              </Button>
            ) : (
              <Button
                size="xs"
                variant="tinted"
                tone="emerald"
                onClick={() => edit({ type: "revive", seat: chair }, `${name} lives`)}
              >
                Revive
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                edit(
                  { type: "setPoison", seat: p.poisoned ? undefined : chair },
                  p.poisoned ? `Cure ${name}` : `Poison ${name}`,
                )
              }
            >
              {p.poisoned ? "Cure poison" : "Poison"}
            </Button>
            {bmr && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  edit(
                    (p.drunkNights ?? 0) > 0
                      ? { type: "clearDrunk", seat: chair }
                      : { type: "setDrunk", seat: chair, nights: 1, source: p.character },
                    (p.drunkNights ?? 0) > 0 ? `${name} sobers up` : `${name} is drunk`,
                  )
                }
              >
                {(p.drunkNights ?? 0) > 0 ? "Sober up" : "Make drunk"}
              </Button>
            )}
            {!p.alive && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  edit(
                    p.ghostVote
                      ? { type: "spendGhostVote", seat: chair }
                      : { type: "restoreGhostVote", seat: chair },
                    p.ghostVote
                      ? `${name} spends the ghost vote`
                      : `${name} gets a ghost vote back`,
                  )
                }
              >
                {p.ghostVote ? "Spend ghost vote" : "Restore ghost vote"}
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                edit({ type: "markAbilityUsed", seat: chair }, `${name}'s ability is spent`)
              }
            >
              Ability spent
            </Button>
            {isTraveller(p) && p.alive && (
              <Button
                size="xs"
                variant="tinted"
                tone="purple"
                onClick={() => edit({ type: "exileTraveller", seat: chair }, `Exile ${name}`)}
              >
                Exile
              </Button>
            )}
          </div>
          <Select
            size="sm"
            value=""
            aria-label={`Change ${name}'s character`}
            onChange={(e) => {
              const c = asCharacter(e.target.value);
              if (c)
                edit(
                  { type: "changeCharacter", seat: chair, character: c },
                  `${name} becomes the ${CHARACTERS[c].name}`,
                );
            }}
          >
            <option value="">Change their character…</option>
            {sheetOrderOf(state.script).map((c) => (
              <option key={c} value={c}>
                {CHARACTERS[c].name}
              </option>
            ))}
          </Select>
        </section>

        <section className="flex flex-col gap-1.5">
          <Eyebrow>Tell them</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => st({ kind: "show-character", to: roomSeat })}
            >
              Show their true character
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              st({
                kind: "send-info",
                to: [roomSeat],
                payload: { kind: "text", text: text.trim() },
                record: false,
              });
              setText("");
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`A private note to ${name}`}
              maxLength={500}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>
              Send
            </Button>
          </form>
        </section>

        {away && vote?.order.includes(roomSeat) && (
          <section className="flex flex-col gap-1.5">
            <Eyebrow>Act for them (away)</Eyebrow>
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  st({ kind: "act-for", roomSeat, action: { kind: "hand", up: true } })
                }
              >
                Raise their hand
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  st({ kind: "act-for", roomSeat, action: { kind: "hand", up: false } })
                }
              >
                Lower it
              </Button>
            </div>
          </section>
        )}

        {inbox.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <Eyebrow>What they were told</Eyebrow>
            <ul className="flex flex-col gap-2">
              {[...inbox].reverse().map((d) => (
                <li key={d.id} className="rounded-card-md bg-fill-soft p-2">
                  <span className="text-xs text-fg-muted">{d.when}</span>
                  <InfoCard payload={d.payload} names={view.names} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </ModalBody>
    </Modal>
  );
}
