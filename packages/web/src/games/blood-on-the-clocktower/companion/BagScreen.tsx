import type {
  CharacterId,
  CharacterType,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTER_SHEET_ORDER,
  CHARACTERS,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { dealBag } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useId } from "react";
import { Button, Select, useConfirm } from "../../../components/ui";
import { Panel, Screen } from "./common";
import { TYPE_LABEL, TYPE_TEXT } from "./labels";
import type { BagDraft } from "./persistence";

/**
 * The physical-bag stage — the phone NEVER leaves the Storyteller's hands.
 * The app names the tokens to drop in the bag; players draw them at the
 * table; the Storyteller records who pulled what, then starts the night.
 * Whoever draws the Drunk's stand-in Townsfolk token is secretly the Drunk.
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
  const { names, bag, draws, storyteller } = draft;
  const { confirm, confirmDialog } = useConfirm();
  const fieldId = useId();

  const taken = new Set(draws.filter((d): d is CharacterId => d !== null));
  const complete = draws.every((d) => d !== null);

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

  function redeal() {
    onChange({
      ...draft,
      bag: dealBag(names.length),
      draws: names.map(() => null),
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
                  className={`rounded-lg border border-white/15 bg-surface-950/60 px-2 py-1 text-sm font-semibold ${TYPE_TEXT[CHARACTERS[t].type]}`}
                >
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
          {baronInPlay && <p>Baron in play: two Townsfolk were swapped for two extra Outsiders.</p>}
        </div>
        <Button className="mt-2" variant="secondary" size="sm" onClick={redeal}>
          Roll a different bag
        </Button>
      </Panel>

      <Panel title="Record the draw" tone="night">
        <p className="mb-2 text-xs text-fg-muted">
          Let each player draw one token and look at it secretly. Then record who drew what — only
          you see this screen.
        </p>
        <div className="flex flex-col gap-1.5">
          {names.map((name, seat) => {
            const current = draws[seat];
            const options = sortedTokens.filter((t) => t === current || !taken.has(t));
            return (
              // Names are unique (setup dedupes on add/import), so they are
              // stable keys; seats never reorder on this screen anyway.
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
          Record every player's token to continue.
        </p>
      )}
      {confirmDialog}
    </Screen>
  );
}
