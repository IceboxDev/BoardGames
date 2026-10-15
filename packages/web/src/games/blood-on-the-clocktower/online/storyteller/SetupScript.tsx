import {
  CHARACTERS,
  type CharacterId,
  EDITION_NAME,
  travellersOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { residentProblem } from "@boardgames/core/games/blood-on-the-clocktower/online/setup-stage";
import {
  bagCharacterReplacements,
  describeDistribution,
  drunkStandInOptions,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useState } from "react";
import { Button, Eyebrow, IconButton, SegmentedControl, Select } from "../../../../components/ui";
import { CharacterIcon, CharacterTag } from "../../companion/ui";
import { useStoryteller } from "../context";
import { asCharacter } from "../helpers";

/** Before the deal: the circle, the Travellers and the bag. */
export function SetupScript() {
  const { view, st } = useStoryteller();
  const setup = view.setup;
  const [swapping, setSwapping] = useState<CharacterId | null>(null);
  if (!setup) return null;
  const edition = view.config.edition;
  const travellerOf = new Map(setup.travellers.map((t) => [t.roomSeat, t]));
  const move = (i: number, by: -1 | 1) => {
    const order = [...setup.order];
    const j = i + by;
    const a = order[i];
    const b = order[j];
    if (a === undefined || b === undefined) return;
    order[i] = b;
    order[j] = a;
    st({ kind: "setup-order", order });
  };
  const problem = residentProblem(setup);
  const bag = setup.bag;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Eyebrow>Script</Eyebrow>
        <SegmentedControl
          options={[
            { value: "trouble-brewing", label: EDITION_NAME["trouble-brewing"] },
            { value: "bad-moon-rising", label: EDITION_NAME["bad-moon-rising"] },
          ]}
          value={edition}
          onChange={(e) => st({ kind: "setup-edition", edition: e })}
          size="xs"
          shape="rounded"
        />
      </section>

      <section className="flex flex-col gap-2">
        <Eyebrow>The circle, clockwise</Eyebrow>
        <ol className="flex flex-col gap-1">
          {setup.order.map((seat, i) => {
            const t = travellerOf.get(seat);
            return (
              <li key={seat} className="flex flex-col gap-1 rounded-ui-md bg-fill-soft px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-fg-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-strong">
                    {view.names[seat]}
                  </span>
                  <IconButton
                    aria-label="Move up"
                    icon="↑"
                    size="xs"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    aria-label="Move down"
                    icon="↓"
                    size="xs"
                    disabled={i === setup.order.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <Button
                    size="xs"
                    variant={t ? "tinted" : "ghost"}
                    tone="purple"
                    onClick={() =>
                      st({
                        kind: "setup-traveller",
                        roomSeat: seat,
                        traveller: t ? null : { character: null, alignment: "good" },
                      })
                    }
                  >
                    Traveller
                  </Button>
                </div>
                {t && (
                  <div className="flex gap-2 pl-7">
                    <Select
                      size="sm"
                      value={t.character ?? ""}
                      aria-label={`${view.names[seat]}'s Traveller`}
                      onChange={(e) =>
                        st({
                          kind: "setup-traveller",
                          roomSeat: seat,
                          traveller: {
                            character: asCharacter(e.target.value),
                            alignment: t.alignment,
                          },
                        })
                      }
                    >
                      <option value="">Roll at the deal</option>
                      {travellersOf(edition).map((c) => (
                        <option key={c} value={c}>
                          {CHARACTERS[c].name}
                        </option>
                      ))}
                    </Select>
                    <SegmentedControl
                      options={[
                        { value: "good", label: "Good", tone: "sky" },
                        { value: "evil", label: "Evil", tone: "rose" },
                      ]}
                      value={t.alignment}
                      onChange={(alignment) =>
                        st({
                          kind: "setup-traveller",
                          roomSeat: seat,
                          traveller: { character: t.character, alignment },
                        })
                      }
                      size="xs"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Eyebrow>The bag</Eyebrow>
          <Button size="xs" variant="ghost" onClick={() => st({ kind: "setup-reroll" })}>
            Reroll
          </Button>
        </div>
        {problem && <p className="text-sm text-amber-300">{problem}</p>}
        {bag && (
          <>
            <p className="text-xs text-fg-muted">{describeDistribution(bag.distribution)}</p>
            <div className="grid grid-cols-3 gap-1">
              {bag.charactersInPlay.map((c) => (
                <Button
                  key={c}
                  variant="ghost"
                  size="xs"
                  onClick={() => setSwapping(swapping === c ? null : c)}
                  className="h-auto min-w-0 flex-col gap-1 p-1"
                  title={`Swap the ${CHARACTERS[c].name}`}
                >
                  <CharacterIcon character={c} size="md" decorative />
                  <span className="w-full truncate text-center text-xs">
                    <CharacterTag character={c} />
                  </span>
                </Button>
              ))}
            </div>
            {swapping && (
              <Select
                size="sm"
                value=""
                aria-label={`Replace the ${CHARACTERS[swapping].name}`}
                onChange={(e) => {
                  const to = asCharacter(e.target.value);
                  if (to) st({ kind: "setup-swap-token", from: swapping, to });
                  setSwapping(null);
                }}
              >
                <option value="">Replace the {CHARACTERS[swapping].name} with…</option>
                {bagCharacterReplacements(bag, swapping).map((c) => (
                  <option key={c} value={c}>
                    {CHARACTERS[c].name}
                  </option>
                ))}
              </Select>
            )}
            {bag.believedCharacter && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-fg-secondary">
                  The Drunk will think they are the{" "}
                  <CharacterTag character={bag.believedCharacter} />.
                </p>
                <Select
                  size="sm"
                  value=""
                  aria-label="The Drunk's stand-in"
                  onChange={(e) => {
                    const c = asCharacter(e.target.value);
                    if (c) st({ kind: "setup-stand-in", character: c });
                  }}
                >
                  <option value="">Change the Drunk's stand-in…</option>
                  {drunkStandInOptions(bag).map((c) => (
                    <option key={c} value={c}>
                      {CHARACTERS[c].name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">Demon bluffs</span>
                <SegmentedControl
                  options={[
                    { value: "new", label: "New Demon" },
                    { value: "experienced", label: "Experienced" },
                  ]}
                  value={setup.demonSkill}
                  onChange={(skill) => st({ kind: "setup-demon-skill", skill })}
                  size="xs"
                />
              </div>
              <div className="flex gap-3">
                {bag.demonBluffs.map((c) => (
                  <span key={c} className="flex items-center gap-1 text-xs">
                    <CharacterIcon character={c} size="sm" decorative />
                    <CharacterTag character={c} />
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
