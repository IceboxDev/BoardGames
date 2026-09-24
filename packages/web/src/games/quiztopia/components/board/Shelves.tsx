import type { BuildingStatus } from "@boardgames/core/games/quiztopia/types";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { DISTRICTS } from "../../bands";
import BuildingCard from "./BuildingCard";

// The two shelves above the city: buildings the team has won (emerald) and
// the ones the dark side took (rose). A Besetzung pick makes the lost shelf's
// cards selectable.

type Props = {
  buildings: readonly BuildingStatus[];
  required: number;
  lossAt: number;
  lang: "en" | "de";
  /** Lost buildings that may be returned right now (Besetzung targets). */
  returnable?: ReadonlySet<number>;
  picking?: boolean;
  onReturn?: (buildingIndex: number) => void;
  className?: string;
};

function Shelf({
  title,
  count,
  cap,
  capLabel,
  tone,
  empty,
  children,
}: {
  title: string;
  count: number;
  cap: number;
  capLabel: string;
  tone: "emerald" | "rose";
  empty: string;
  children: React.ReactNode;
}) {
  const reached = count >= cap;
  return (
    <section
      aria-label={`${title} buildings`}
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1.5 rounded-card-lg border border-line-soft bg-surface-900/40 p-2",
        reached && tone === "emerald" && "border-emerald-500/40",
        reached && tone === "rose" && "border-rose-500/40",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge tone={tone} size="xs">
          {title}
        </Badge>
        <span className="text-xs tabular-nums text-fg-secondary">
          <span className="font-semibold text-fg-strong">{count}</span> / {cap}
        </span>
        <span className="text-3xs uppercase tracking-label text-fg-muted">{capLabel}</span>
      </div>
      <div className="flex min-h-14 flex-wrap items-end gap-1.5 sm:min-h-16">
        {count === 0 ? <p className="self-center text-xs text-fg-muted">{empty}</p> : children}
      </div>
    </section>
  );
}

export default function Shelves({
  buildings,
  required,
  lossAt,
  lang,
  returnable,
  picking = false,
  onReturn,
  className,
}: Props) {
  const won = DISTRICTS.filter((d) => buildings[d.index] === "won");
  const lost = DISTRICTS.filter((d) => buildings[d.index] === "lost");
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <Shelf
        title="Won"
        count={won.length}
        cap={required}
        capLabel="to win"
        tone="emerald"
        empty="Nothing won yet"
      >
        {won.map((d) => (
          <BuildingCard
            key={d.slug}
            district={d}
            status="won"
            size="shelf"
            lang={lang}
            layoutId={`qz-building-${d.index}`}
          />
        ))}
      </Shelf>
      <Shelf
        title="Lost"
        count={lost.length}
        cap={lossAt - 1}
        capLabel="max"
        tone="rose"
        empty="Nothing lost"
      >
        {lost.map((d) => {
          const canReturn = picking && !!returnable?.has(d.index);
          return (
            <BuildingCard
              key={d.slug}
              district={d}
              status="lost"
              size="shelf"
              lang={lang}
              layoutId={`qz-building-${d.index}`}
              selectable={canReturn}
              onSelect={canReturn ? () => onReturn?.(d.index) : undefined}
            />
          );
        })}
      </Shelf>
    </div>
  );
}
