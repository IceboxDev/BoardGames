import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { InfoPayload } from "@boardgames/core/games/blood-on-the-clocktower/info";
import { cn } from "../../../../lib/cn";
import { CharacterIcon, CharacterTag } from "../../companion/ui";

// What the Storyteller showed a player, drawn the way it would be shown at a
// table: fingers become a big number, a nod a YES, tokens are tokens.

function Who({ names, seats }: { names: readonly string[]; seats: readonly number[] }) {
  return (
    <span className="font-semibold text-fg-strong">
      {seats.map((s) => names[s] ?? `Player ${s}`).join(" or ")}
    </span>
  );
}

export function InfoCard({
  payload,
  names,
  className,
}: {
  payload: InfoPayload;
  names: readonly string[];
  className?: string;
}) {
  const box = cn("flex flex-col items-center gap-2 text-center", className);
  switch (payload.kind) {
    case "number":
      return (
        <div className={box}>
          <span className="text-6xl font-black tabular-nums text-fg-strong">{payload.value}</span>
          <span className="text-sm text-fg-secondary">{payload.label}</span>
        </div>
      );
    case "yes-no":
      return (
        <div className={box}>
          <span
            className={cn(
              "text-5xl font-black",
              payload.value ? "text-emerald-300" : "text-fg-secondary",
            )}
          >
            {payload.value ? "YES" : "NO"}
          </span>
          <span className="text-sm text-fg-secondary">{payload.label}</span>
        </div>
      );
    case "players-character":
      return (
        <div className={box}>
          <CharacterIcon character={payload.character} size="xl" />
          <p className="text-sm text-fg-primary">
            One of <Who names={names} seats={payload.seats} /> is the{" "}
            <CharacterTag character={payload.character} />.
          </p>
        </div>
      );
    case "character":
      return (
        <div className={box}>
          <CharacterIcon character={payload.character} size="xl" />
          <p className="text-sm text-fg-primary">
            {payload.seat !== undefined ? (
              <>
                <Who names={names} seats={[payload.seat]} /> is the{" "}
              </>
            ) : (
              "The "
            )}
            <CharacterTag character={payload.character} />.
          </p>
        </div>
      );
    case "characters":
      return (
        <div className={box}>
          {payload.characters.length === 0 ? (
            <p className="text-sm text-fg-primary">None.</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {payload.characters.map((c) => (
                <span key={c} className="flex flex-col items-center gap-1">
                  <CharacterIcon character={c} size="lg" />
                  <CharacterTag character={c} />
                </span>
              ))}
            </div>
          )}
        </div>
      );
    case "evil-team":
      return (
        <div className={box}>
          {payload.demon !== undefined && (
            <p className="text-sm text-fg-primary">
              Your Demon is <Who names={names} seats={[payload.demon]} />.
            </p>
          )}
          <p className="text-sm text-fg-primary">
            {payload.minions.length === 0 ? (
              "There are no Minions."
            ) : (
              <>
                {payload.demon !== undefined ? "Your fellow Minions: " : "Your Minions: "}
                <span className="font-semibold text-fg-strong">
                  {payload.minions.map((s) => names[s] ?? `Player ${s}`).join(", ")}
                </span>
              </>
            )}
          </p>
          {payload.bluffs && payload.bluffs.length > 0 && (
            <>
              <p className="text-xs text-fg-muted">Not in play — safe to bluff:</p>
              <div className="flex flex-wrap justify-center gap-3">
                {payload.bluffs.map((c) => (
                  <span key={c} className="flex flex-col items-center gap-1">
                    <CharacterIcon character={c} size="lg" />
                    <CharacterTag character={c} />
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      );
    case "you-are":
      return (
        <div className={box}>
          <span className="text-xs font-bold uppercase tracking-eyebrow text-fg-muted">
            You are
          </span>
          <CharacterIcon character={payload.character} size="xl" />
          <span className="text-lg">
            <CharacterTag character={payload.character} />
            {payload.alignment && (
              <span
                className={cn(
                  "ml-2 text-sm font-semibold",
                  payload.alignment === "evil" ? "text-rose-300" : "text-sky-300",
                )}
              >
                ({payload.alignment})
              </span>
            )}
          </span>
          <p className="max-w-sm text-sm text-fg-secondary">
            {CHARACTERS[payload.character].ability}
          </p>
        </div>
      );
    case "grimoire":
      return (
        <div className={cn(box, "w-full")}>
          <p className="text-xs text-fg-muted">The Grimoire, as it stands:</p>
          <ul className="grid w-full grid-cols-2 gap-2 text-left">
            {payload.seats.map((s) => (
              <li key={s.seat} className="flex items-start gap-2">
                <CharacterIcon character={s.character} size="sm" decorative />
                <span className="min-w-0 text-xs">
                  <span
                    className={cn(
                      "font-semibold",
                      s.alive ? "text-fg-strong" : "text-fg-muted line-through",
                    )}
                  >
                    {s.name}
                  </span>{" "}
                  <CharacterTag character={s.character} />
                  {s.reminders.length > 0 && (
                    <span className="block text-fg-muted">{s.reminders.join(" · ")}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "text":
      return (
        <div className={box}>
          <p className="text-base text-fg-primary">{payload.text}</p>
        </div>
      );
  }
}
