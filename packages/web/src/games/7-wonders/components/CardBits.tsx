import type {
  CardColor,
  Cost,
  ResourceType,
  WonderStageEffect,
} from "@boardgames/core/games/7-wonders/types";
import { Fragment } from "react";
import { cn } from "../../../lib/cn";
import { COLOR_HEX, effectSentence } from "../card-utils";
import SevenIcon, { Amount } from "./SevenIcon";

const RAW: readonly ResourceType[] = ["wood", "stone", "clay", "ore"];
const MANUFACTURED: readonly ResourceType[] = ["glass", "loom", "papyrus"];

type Size = "xs" | "sm" | "md" | "lg";

const ICON: Record<Size, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};
const NUMBER: Record<Size, string> = {
  xs: "text-7xs",
  sm: "text-5xs",
  md: "text-4xs",
  lg: "text-2xs",
};

/** A cost as the card prints it: coins, then one icon per resource unit. */
export function CostIcons({
  cost,
  size = "sm",
  direction = "row",
  className,
}: {
  cost: Cost;
  size?: Size;
  direction?: "row" | "col";
  className?: string;
}) {
  const units = Object.entries(cost.resources ?? {}).flatMap(([r, n]) =>
    Array.from({ length: n ?? 0 }, () => r as ResourceType),
  );
  if (!cost.coins && units.length === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        direction === "col" && "flex-col",
        className,
      )}
    >
      {cost.coins ? (
        <Amount kind="coin" value={cost.coins} className={ICON[size]} textClass={NUMBER[size]} />
      ) : null}
      {units.map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: repeated units of one resource
        <SevenIcon key={`${r}-${i}`} name={r} className={ICON[size]} title={r} />
      ))}
    </span>
  );
}

/** Which boards an effect counts: ◂ left, • you, ▸ right. */
function Scope({ scopes, size }: { scopes: readonly ("self" | "left" | "right")[]; size: Size }) {
  const on = (s: "self" | "left" | "right") =>
    scopes.includes(s) ? "text-fg-strong" : "opacity-0";
  return (
    <span
      className={cn("inline-flex items-center font-bold leading-none", NUMBER[size])}
      aria-hidden
    >
      <span className={on("left")}>◂</span>
      <span className={cn("mx-px", on("self"))}>•</span>
      <span className={on("right")}>▸</span>
    </span>
  );
}

function Swatch({ color, size }: { color: CardColor; size: Size }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm ring-1 ring-black/40",
        size === "lg" ? "h-5 w-3.5" : size === "xs" ? "h-2.5 w-2" : "h-3.5 w-2.5",
      )}
      style={{ backgroundColor: COLOR_HEX[color] }}
      aria-hidden
    />
  );
}

/** One effect as icons, the way the card's top band shows it. */
export function EffectIcons({
  effect,
  size = "sm",
  className,
}: {
  effect: WonderStageEffect;
  size?: Size;
  className?: string;
}) {
  const icon = ICON[size];
  const num = NUMBER[size];
  const body = (() => {
    switch (effect.kind) {
      case "production":
        if (effect.resources.length === 1) {
          return Array.from({ length: effect.count ?? 1 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: repeated units of one resource
            <SevenIcon key={i} name={effect.resources[0]} className={icon} />
          ));
        }
        return effect.resources.map((r, i) => (
          <Fragment key={r}>
            {i > 0 && <span className={cn("font-bold text-fg-muted", num)}>/</span>}
            <SevenIcon name={r} className={icon} />
          </Fragment>
        ));
      case "points":
        return <Amount kind="laurel" value={effect.amount} className={icon} textClass={num} />;
      case "shields":
        return Array.from({ length: effect.amount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: repeated shields
          <SevenIcon key={i} name="shield" className={icon} />
        ));
      case "science":
        return <SevenIcon name={effect.symbol} className={icon} />;
      case "coins":
        return <Amount kind="coin" value={effect.amount} className={icon} textClass={num} />;
      case "coins-per-card":
      case "points-per-card":
        return (
          <>
            <Scope scopes={effect.scopes} size={size} />
            <Swatch color={effect.color} size={size} />
            <Amount
              kind={effect.kind === "coins-per-card" ? "coin" : "laurel"}
              value={effect.amount}
              className={icon}
              textClass={num}
            />
          </>
        );
      case "coins-per-stage":
      case "points-per-stage":
        return (
          <>
            <Scope scopes={effect.scopes} size={size} />
            <SevenIcon name="wonder" className={icon} />
            <Amount
              kind={effect.kind === "coins-per-stage" ? "coin" : "laurel"}
              value={effect.amount}
              className={icon}
              textClass={num}
            />
          </>
        );
      case "points-if-wonder-complete":
        return (
          <>
            <SevenIcon name="wonder" className={icon} />
            <span className={cn("font-bold text-fg-strong", num)}>✓</span>
            <Amount kind="laurel" value={effect.amount} className={icon} textClass={num} />
          </>
        );
      case "trade-discount":
        return (
          <>
            <SevenIcon name="trade" className={icon} />
            {effect.neighbors.includes("left") && (
              <span className={cn("font-bold text-fg-strong", num)}>◂</span>
            )}
            <span className="inline-flex -space-x-1">
              {(effect.resources === "raw" ? RAW : MANUFACTURED).map((r) => (
                <SevenIcon key={r} name={r} className={icon} />
              ))}
            </span>
            {effect.neighbors.includes("right") && (
              <span className={cn("font-bold text-fg-strong", num)}>▸</span>
            )}
            <Amount kind="coin" value={1} className={icon} textClass={num} />
          </>
        );
      case "science-wildcard":
        return <SevenIcon name="science-any" className={icon} />;
      case "play-discarded":
        return <Special size={size} icon="discard" label="Free from discard" />;
      case "free-first-of-color":
        return <Special size={size} icon="cards" label="1st of each colour free" />;
      case "free-first-of-age":
        return <Special size={size} icon="cards" label="1st card of age free" />;
      case "free-last-of-age":
        return <Special size={size} icon="cards" label="Last card of age free" />;
      case "play-seventh-card":
        return <Special size={size} icon="cards" label="Play 7th card" />;
    }
  })();
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      title={effectSentence(effect)}
    >
      {body}
    </span>
  );
}

function Special({
  size,
  icon,
  label,
}: {
  size: Size;
  icon: "discard" | "cards" | "chain";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <SevenIcon name={icon} className={ICON[size]} />
      {size !== "xs" && (
        <span className={cn("font-semibold leading-tight text-fg-strong", NUMBER[size])}>
          {label}
        </span>
      )}
    </span>
  );
}
