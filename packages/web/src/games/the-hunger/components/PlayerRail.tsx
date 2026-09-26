import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import type { HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { Chip, Eyebrow, MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { seatLabel, spaceLabel, vampireColor } from "../logic/labels";

interface Props {
  view: HungerPlayerView;
  names: readonly (string | null)[];
  activeSeat: number;
  /** Tokens this seat may spend right now → click handler. */
  usableTokens: ReadonlySet<string>;
  selectedToken: string | null;
  onToken: (token: string) => void;
}

const TURNS = 15;
const MOON = Array.from({ length: TURNS }, (_, i) => i + 1);

export default function PlayerRail({
  view,
  names,
  activeSeat,
  usableTokens,
  selectedToken,
  onToken,
}: Props) {
  const me = view.players[view.me];
  return (
    <div className="flex flex-col gap-4 text-xs">
      <section className="flex flex-col gap-1.5">
        <Eyebrow size="sm">
          Moon · turn {Math.min(view.turn, TURNS)} of {TURNS}
        </Eyebrow>
        <div className="flex gap-0.5" role="img" aria-label={`Turn ${view.turn} of ${TURNS}`}>
          {MOON.map((n) => (
            <span
              key={n}
              className={cn(
                "h-2 flex-1 rounded-full",
                n < view.turn ? "bg-fill-strong" : n === view.turn ? "bg-amber-300" : "bg-fill",
              )}
            />
          ))}
        </div>
        {view.turn > TURNS && <span className="text-amber-300">Parasol turn — no hunting</span>}
      </section>

      <section className="flex flex-col gap-1.5">
        <Eyebrow size="sm">Vampires</Eyebrow>
        {view.players.map((p) => (
          <Surface
            key={p.index}
            variant="tile"
            padding="sm"
            className={cn("flex flex-col gap-0.5", p.index === activeSeat && "border-amber-300/60")}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: vampireColor(p.vampire), opacity: p.resting ? 0.5 : 1 }}
              />
              <span className="truncate font-semibold text-fg-primary">
                {seatLabel(view, p.index, names)}
              </span>
              <span className="ml-auto font-bold tabular-nums text-fg-strong">{p.vp} VP</span>
            </div>
            <div className="flex flex-wrap gap-x-2 text-3xs text-fg-muted">
              <span>{spaceLabel(view.options, p.pos)}</span>
              {p.castleTile !== null && (
                <span className="text-emerald-300">home +{p.castleTile}</span>
              )}
              <span>
                deck {p.deckCount} · discard {p.discard.length}
                {p.digested.length > 0 ? ` · digested ${p.digested.length}` : ""}
              </span>
              <span>
                {p.missionCount} mission{p.missionCount === 1 ? "" : "s"} · {p.bonus.length} token
                {p.bonus.length === 1 ? "" : "s"}
              </span>
            </div>
          </Surface>
        ))}
      </section>

      <section className="flex flex-col gap-1">
        <Eyebrow size="sm">Public missions</Eyebrow>
        {view.publicMissions.map((m) => (
          <MissionLine key={m} id={m} />
        ))}
      </section>

      {me && (
        <section className="flex flex-col gap-1">
          <Eyebrow size="sm">Your missions</Eyebrow>
          {view.missions.length === 0 && <span className="text-fg-muted">None</span>}
          {view.missions.map((m) => (
            <MissionLine key={m} id={m} />
          ))}
          {me.usedMissions.map((m) => (
            <MissionLine key={m} id={m} done />
          ))}
        </section>
      )}

      {me && me.bonus.length > 0 && (
        <section className="flex flex-col gap-1">
          <Eyebrow size="sm">Your bonus tokens</Eyebrow>
          <div className="flex flex-wrap gap-1">
            {me.bonus.map((b) => {
              const usable = usableTokens.has(b.id);
              return (
                <Chip
                  key={b.id}
                  size="xs"
                  pressed={selectedToken === b.id}
                  tone="amber"
                  disabled={!usable}
                  onClick={usable ? () => onToken(b.id) : undefined}
                  title={bonusDef(b.id).text}
                  className={cn(b.used && "line-through opacity-50")}
                >
                  {bonusDef(b.id).name}
                </Chip>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function MissionLine({ id, done = false }: { id: string; done?: boolean }) {
  const def = missionDef(id);
  return (
    <div className={cn("leading-tight", done && "opacity-60")} title={def.text}>
      <span className={cn("font-semibold", def.instant ? "text-amber-300" : "text-fg-primary")}>
        {def.name}
      </span>
      {done && <MicroLabel className="ml-1">used</MicroLabel>}
      <div className="text-3xs text-fg-muted">{def.text}</div>
    </div>
  );
}
