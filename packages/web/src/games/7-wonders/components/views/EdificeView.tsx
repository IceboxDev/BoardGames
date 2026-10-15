import { getEdificeDef } from "@boardgames/core/games/7-wonders/edifice";
import type { EdificeSlot } from "@boardgames/core/games/7-wonders/types";
import { MicroLabel, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { AGE_NUMERAL } from "../../card-utils";
import { artUrl, edificeArt } from "../../logic/art";
import type { DraftInteraction } from "../../logic/useDraftInteraction";
import { AGE_TINT } from "../../logic/wonder-style";
import { CostIcons } from "../CardBits";
import SevenIcon from "../SevenIcon";
import WonderMedallion from "../WonderMedallion";

const STATUS: Record<EdificeSlot["status"], { label: string; cls: string }> = {
  project: { label: "Open", cls: "text-amber-200 ring-amber-300/40" },
  built: { label: "Built", cls: "text-emerald-200 ring-emerald-300/40" },
  failed: { label: "Failed", cls: "text-rose-200 ring-rose-400/40" },
};

const COLOR_WORD: Record<string, string> = {
  brown: "brown",
  grey: "grey",
  blue: "blue",
  yellow: "yellow",
  red: "red",
  green: "green",
};

function rewardText(card: string): string[] {
  return getEdificeDef(card).reward.map((r) => {
    switch (r.kind) {
      case "coins":
        return `${r.amount} coins`;
      case "shield":
        return `${r.amount} shield${r.amount === 1 ? "" : "s"}`;
      case "victory-token":
        return `a ${r.value} VP victory token`;
      case "remove-defeat-tokens":
        return "discard your defeat tokens";
      case "production":
        return "a resource of your choice each turn";
      case "points-per-wonder-stage":
        return "1 VP per wonder stage you built";
      case "points-per-blue":
        return "1 VP per blue card";
      case "points-per-color":
        return "1 VP per card colour you have";
      case "points-per-brown-grey-set":
        return `${r.amount} VP per brown + grey pair`;
      case "duplicate-guild":
        return "copy one of your guilds";
      default:
        return "";
    }
  });
}

function penaltyText(card: string): string {
  const p = getEdificeDef(card).penalty;
  if (p.kind === "coins") return `Pay ${p.amount} coins`;
  if (p.kind === "lose-victory-tokens") return `Lose ${p.amount} VP of victory tokens`;
  return `Discard a ${COLOR_WORD[p.color] ?? p.color} card`;
}

/** Sepia ink on the plan's parchment; cream on the finished building's sky. */
const INK = { plan: "#3d2a14", built: "#fff3d6" } as const;

/**
 * The Edifice projects, one per age, as the expansion's project cards: the
 * architect's plan while a project is open (or abandoned), the finished
 * building once it is built. Below each: what joining costs, what it pays,
 * what failing costs, and the pawns — taken and left.
 */
export default function EdificeView({
  ix,
  names,
}: {
  ix: DraftInteraction;
  names: readonly string[];
}) {
  const { view, myIndex } = ix;
  if (!view.edifices) return null;
  const mine = view.playerEdifice?.[myIndex];
  return (
    <div className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:shrink">
      <div className="grid gap-4 px-1 pt-1 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {view.edifices.map((slot) => {
          const current = slot.age === view.age;
          const tint = AGE_TINT[slot.age as 1 | 2 | 3];
          const status = STATUS[slot.status];
          const def = getEdificeDef(slot.card);
          const joined = mine?.participation.includes(slot.age) ?? false;
          const total = slot.pawnsTotal;
          const built = slot.status === "built";
          const failed = slot.status === "failed";
          const art = edificeArt(slot.card, built);
          const ink = built ? INK.built : INK.plan;
          return (
            <section
              key={slot.age}
              aria-label={`Age ${slot.age} project: ${slot.card}`}
              className={cn(
                "relative isolate flex min-h-[34rem] flex-col overflow-hidden rounded-card-xl shadow-xl ring-1 transition-transform lg:min-h-0",
                current ? "-translate-y-1 shadow-2xl ring-2 ring-amber-300/70" : "ring-black/60",
                built && "ring-2 ring-amber-300/80",
              )}
              style={{
                background: `linear-gradient(170deg, ${tint.to}, #0b0a10)`,
                boxShadow: built ? "0 0 32px rgb(245 196 81 / 0.35)" : undefined,
              }}
            >
              {art && (
                <img
                  src={art}
                  alt={built ? `${slot.card}, built` : `The plan for ${slot.card}`}
                  draggable={false}
                  className="pointer-events-none absolute inset-x-0 top-0 w-full select-none transition-[filter]"
                  style={{
                    aspectRatio: "2 / 3",
                    filter: failed ? "grayscale(0.85) brightness(0.62) contrast(0.9)" : undefined,
                  }}
                />
              )}
              {built && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
                  style={{ background: "linear-gradient(180deg, rgb(10 8 6 / 0.55), transparent)" }}
                />
              )}

              <header className="relative flex items-start justify-between gap-2 px-5 pt-4">
                <div className="flex flex-col">
                  <span
                    className="text-3xs font-bold uppercase tracking-label"
                    style={{ color: ink, opacity: 0.8 }}
                  >
                    Age {AGE_NUMERAL[slot.age as 1 | 2 | 3]}
                    {current ? " · now" : ""}
                  </span>
                  <span
                    className="font-fantasy text-2xl font-bold leading-tight"
                    style={{
                      color: ink,
                      textShadow: built ? "0 2px 8px rgb(0 0 0 / 0.8)" : undefined,
                    }}
                  >
                    {slot.card}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full bg-surface-950/85 px-2.5 py-0.5 text-3xs font-bold uppercase tracking-label shadow ring-1",
                    status.cls,
                  )}
                >
                  {status.label}
                </span>
              </header>

              {failed && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-ui-md border-4 px-4 py-1 font-fantasy text-3xl font-bold uppercase tracking-pill"
                  style={{ color: "#c2412d", borderColor: "#c2412d", opacity: 0.85 }}
                >
                  Abandoned
                </span>
              )}

              <div
                className="relative mt-auto flex flex-col gap-2.5 px-4 pb-4 pt-10"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 0%, rgb(12 9 7 / 0.82) 22%, rgb(12 9 7 / 0.94) 100%)",
                }}
              >
                <span className="flex items-center gap-2 text-xs text-fg-secondary">
                  <MicroLabel>To join</MicroLabel>
                  build a wonder stage and pay
                  <CostIcons cost={{ coins: def.cost }} size="sm" />
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Surface
                    variant="tile"
                    padding="sm"
                    className="flex flex-col gap-1 bg-emerald-500/10 ring-1 ring-emerald-400/25"
                  >
                    <MicroLabel>Built — each pawn gets</MicroLabel>
                    <ul className="text-xs leading-snug text-emerald-200">
                      {rewardText(slot.card).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </Surface>
                  <Surface
                    variant="tile"
                    padding="sm"
                    className="flex flex-col gap-1 bg-rose-500/10 ring-1 ring-rose-400/25"
                  >
                    <MicroLabel>Fails — the rest</MicroLabel>
                    <span className="text-xs leading-snug text-rose-200">
                      {penaltyText(slot.card)}
                    </span>
                  </Surface>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <MicroLabel>
                    Pawns · {slot.participants.length}/{total}
                  </MicroLabel>
                  {joined && (
                    <span className="text-2xs font-semibold text-amber-200">
                      You hold a pawn here
                    </span>
                  )}
                </div>
                <div className="flex min-h-9 flex-wrap items-center gap-1.5">
                  {slot.participants.map((seat) => {
                    const p = view.players[seat];
                    return (
                      <span
                        key={seat}
                        className="flex items-center gap-1 rounded-full bg-fill-strong py-0.5 pl-0.5 pr-2 text-2xs text-fg-primary ring-1 ring-line"
                      >
                        <WonderMedallion
                          wonderId={p.wonderId}
                          side={p.side}
                          stagesBuilt={p.stagesBuilt}
                          className="h-7 w-7"
                        />
                        {seat === myIndex ? "You" : names[seat]}
                      </span>
                    );
                  })}
                  {Array.from({ length: slot.pawnsLeft }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: identical free pawns
                    <SevenIcon key={i} name="pawn" className="h-8 w-8 drop-shadow" />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {mine && (mine.victoryTokens.length > 0 || mine.debtTokens.length > 0) && (
        <Surface variant="raised" padding="sm" className="flex shrink-0 items-center gap-3 px-4">
          <MicroLabel>Your Edifice tokens</MicroLabel>
          {mine.victoryTokens.map((v, i) => (
            <EdificeToken
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they came
              key={`v${i}`}
              kind="victory"
              value={v}
            />
          ))}
          {mine.debtTokens.map((d, i) => (
            <EdificeToken
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens in the order they came
              key={`d${i}`}
              kind="debt"
              value={d}
            />
          ))}
        </Surface>
      )}
    </div>
  );
}

/** An Edifice victory token (bronze, laurels) or debt token (iron, chains), its value on it. */
function EdificeToken({ kind, value }: { kind: "victory" | "debt"; value: number }) {
  const src = artUrl(kind === "victory" ? "token-edifice-victory" : "token-debt");
  const label = kind === "victory" ? `Edifice victory token: ${value} VP` : `Debt: ${value} VP`;
  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center drop-shadow"
      title={label}
    >
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
      )}
      <span
        className="relative font-card text-xs font-bold tabular-nums"
        style={{
          color: kind === "victory" ? "#3a2408" : "#f1f1f1",
          textShadow: kind === "victory" ? "0 0 3px rgb(255 235 200)" : "0 1px 2px rgb(0 0 0)",
        }}
      >
        {kind === "debt" && value > 0 ? `−${value}` : value}
      </span>
    </span>
  );
}
