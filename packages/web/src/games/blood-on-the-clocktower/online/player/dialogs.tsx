import {
  CHARACTERS,
  type CharacterId,
  sheetOrderOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  Delivery,
  RequestKind,
} from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import type { WakePromptView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, Select } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { CharacterIcon } from "../../companion/ui";
import { InfoCard } from "../components/InfoCard";
import { usePlayer } from "../context";
import { asCharacter } from "../helpers";

/** Tap players by name: a grid of the circle, picks capped at `max` (the oldest drops). */
function SeatPicker({
  picks,
  max,
  allowed,
  onChange,
}: {
  picks: readonly number[];
  max: number;
  allowed: (seat: number) => boolean;
  onChange: (next: number[]) => void;
}) {
  const { view } = usePlayer();
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {view.town.map((t) => {
        const on = picks.includes(t.seat);
        const ok = allowed(t.seat);
        return (
          // biome-ignore lint/correctness/noRestrictedElements: a pickable seat tile, toggled like a game piece
          <button
            key={t.seat}
            type="button"
            disabled={!ok && !on}
            onClick={() =>
              onChange(
                on
                  ? picks.filter((p) => p !== t.seat)
                  : [...picks, t.seat].slice(-Math.max(1, max)),
              )
            }
            className={cn(
              "flex items-center gap-2 rounded-ui-md border px-2 py-1.5 text-left text-sm transition",
              on
                ? "border-accent-400 bg-accent-500/15 text-fg-strong"
                : "border-line bg-fill-soft text-fg-primary",
              !ok && !on && "opacity-40",
              !t.alive && "italic",
            )}
          >
            <span className="truncate">{view.names[t.seat]}</span>
            {!t.alive && <span title="dead">☠</span>}
          </button>
        );
      })}
    </div>
  );
}

function CharacterPicker({
  value,
  onChange,
  optional,
}: {
  value: CharacterId | null;
  onChange: (c: CharacterId | null) => void;
  optional: boolean;
}) {
  const { view } = usePlayer();
  return (
    <div className="flex items-center gap-2">
      {value && <CharacterIcon character={value} size="md" />}
      <Select
        size="sm"
        value={value ?? ""}
        onChange={(e) => onChange(asCharacter(e.target.value))}
        aria-label="Character"
      >
        <option value="">{optional ? "No one" : "Choose a character…"}</option>
        {sheetOrderOf(view.edition).map((c) => (
          <option key={c} value={c}>
            {CHARACTERS[c].name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function promptLine(prompt: WakePromptView): string {
  switch (prompt.kind) {
    case "info":
      return "Open your eyes. The Storyteller will show you something.";
    case "players": {
      const n = prompt.min === prompt.max ? `${prompt.max}` : `${prompt.min}–${prompt.max}`;
      const who =
        prompt.filter === "dead"
          ? "dead player"
          : prompt.filter === "alive"
            ? "living player"
            : "player";
      return `Choose ${n} ${who}${prompt.max === 1 ? "" : "s"}${prompt.allowSelf ? "" : " (not yourself)"}.`;
    }
    case "character":
      return prompt.optional ? "Choose a character — or no one." : "Choose a character.";
    case "player-and-character":
      return "Choose a player, then the character you think they are.";
  }
}

/** You're awake: what you're asked, your answer, and the wait for the Storyteller. */
export function WakeDialog({ onHide }: { onHide: () => void }) {
  const { view, act } = usePlayer();
  const wake = view.me.wake;
  const [picks, setPicks] = useState<number[]>(() => [...(wake?.choice?.seats ?? [])]);
  const [character, setCharacter] = useState<CharacterId | null>(wake?.choice?.character ?? null);
  if (!wake) return null;
  const prompt = wake.prompt;
  const aliveOf = new Map(view.town.map((t) => [t.seat, t.alive]));
  const allowed = (seat: number) => {
    if (prompt.kind !== "players") return true;
    if (!prompt.allowSelf && seat === view.you) return false;
    if (prompt.excluded.includes(seat)) return false;
    if (prompt.filter === "alive" && !aliveOf.get(seat)) return false;
    if (prompt.filter === "dead" && aliveOf.get(seat)) return false;
    return true;
  };
  const max =
    prompt.kind === "players" ? prompt.max : prompt.kind === "player-and-character" ? 1 : 0;
  const ready =
    prompt.kind === "players"
      ? picks.length >= prompt.min && picks.length <= prompt.max
      : prompt.kind === "character"
        ? prompt.optional || character !== null
        : prompt.kind === "player-and-character"
          ? picks.length === 1 && character !== null
          : false;
  const sent = wake.choice;

  return (
    <Modal
      onClose={onHide}
      size="md"
      eyebrow="You are awake"
      title={view.me.shown ? CHARACTERS[view.me.shown.character].name : "Night"}
    >
      <ModalBody gap="md">
        <p className="text-sm text-fg-primary">{promptLine(prompt)}</p>
        {(prompt.kind === "players" || prompt.kind === "player-and-character") && (
          <SeatPicker picks={picks} max={max} allowed={allowed} onChange={setPicks} />
        )}
        {(prompt.kind === "character" || prompt.kind === "player-and-character") && (
          <CharacterPicker
            value={character}
            onChange={setCharacter}
            optional={prompt.kind === "character" && prompt.optional}
          />
        )}
        {sent && (
          <p className="text-xs text-fg-muted">
            Answer sent — you can change it until the Storyteller acts.
          </p>
        )}
      </ModalBody>
      <ModalFooter
        start={<span className="text-xs text-fg-muted">Close to hide; you stay awake.</span>}
      >
        {prompt.kind !== "info" && (
          <Button
            size="sm"
            disabled={!ready}
            onClick={() =>
              act({
                kind: "night-choice",
                stepId: wake.stepId,
                choice: { seats: picks, ...(character ? { character } : {}) },
              })
            }
          >
            {sent ? "Change answer" : "Send"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

/** Something the Storyteller just told you. */
export function InfoDialog({ delivery }: { delivery: Delivery }) {
  const { view, act } = usePlayer();
  const done = () => {
    act({ kind: "dismiss-info", id: delivery.id });
    if (
      delivery.payload.kind === "you-are" &&
      view.stage === "reveal" &&
      !view.me.shown?.acknowledged
    ) {
      act({ kind: "ack-character" });
    }
  };
  return (
    <Modal onClose={done} size="sm" eyebrow={delivery.when} title="The Storyteller shows you">
      <ModalBody>
        <InfoCard payload={delivery.payload} names={view.names} />
      </ModalBody>
      <ModalFooter>
        <Button size="sm" onClick={done}>
          Got it
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** Nominate someone (or call for a Traveller's exile). */
export function NominateDialog({ onClose }: { onClose: () => void }) {
  const { view, act } = usePlayer();
  const [pick, setPick] = useState<number[]>([]);
  const allowed = (seat: number) => {
    const t = view.town.find((x) => x.seat === seat);
    return Boolean(t && !t.left && !view.day.nominees.includes(seat));
  };
  return (
    <Modal onClose={onClose} size="md" title="Nominate">
      <ModalBody>
        <p className="text-sm text-fg-secondary">
          Choose who goes up for execution. Nominating a Traveller calls for their exile instead.
        </p>
        <SeatPicker picks={pick} max={1} allowed={allowed} onChange={setPick} />
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pick.length !== 1}
          onClick={() => {
            const nominee = pick[0];
            if (nominee !== undefined) act({ kind: "nominate", nominee });
            onClose();
          }}
        >
          Nominate
        </Button>
      </ModalFooter>
    </Modal>
  );
}

const CLAIMS: { kind: RequestKind; label: string; targets: number }[] = [
  { kind: "slayer", label: "Slayer: shoot a player", targets: 1 },
  { kind: "gunslinger", label: "Gunslinger: shoot a voter", targets: 1 },
  { kind: "beggar-give", label: "Give the Beggar a vote token", targets: 1 },
  { kind: "judge", label: "Judge: rule on this vote", targets: 0 },
  { kind: "matron-swap", label: "Matron: swap two players' seats", targets: 2 },
  { kind: "moonchild", label: "Moonchild: choose a player", targets: 1 },
  { kind: "other", label: "Something else (tell the Storyteller)", targets: 0 },
];

/** A public claim the Storyteller rules on. Anyone may claim anything — bluffs included. */
export function ClaimDialog({ onClose }: { onClose: () => void }) {
  const { act } = usePlayer();
  const [kind, setKind] = useState<RequestKind>("slayer");
  const [picks, setPicks] = useState<number[]>([]);
  const [text, setText] = useState("");
  const claim = CLAIMS.find((c) => c.kind === kind) ?? CLAIMS[0];
  const need = claim?.targets ?? 0;
  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Make a claim"
      subheader="Everyone sees it. The Storyteller decides what happens."
    >
      <ModalBody gap="md">
        <Select
          size="sm"
          value={kind}
          onChange={(e) => {
            const next = CLAIMS.find((c) => c.kind === e.target.value);
            if (next) setKind(next.kind);
            setPicks([]);
          }}
          aria-label="Claim"
        >
          {CLAIMS.map((c) => (
            <option key={c.kind} value={c.kind}>
              {c.label}
            </option>
          ))}
        </Select>
        {need > 0 && (
          <SeatPicker picks={picks} max={need} allowed={() => true} onChange={setPicks} />
        )}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Anything to add (optional)"
          maxLength={200}
        />
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={picks.length !== need}
          onClick={() => {
            act({
              kind: "request",
              request: kind,
              targets: picks,
              ...(text.trim() ? { text: text.trim() } : {}),
            });
            onClose();
          }}
        >
          Claim
        </Button>
      </ModalFooter>
    </Modal>
  );
}
