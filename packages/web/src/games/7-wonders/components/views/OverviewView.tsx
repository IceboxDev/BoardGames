import { Fragment, useMemo } from "react";
import { Button, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { COLOR_HEX } from "../../card-utils";
import { artBg, WONDER_FOCUS, wonderBoardArt } from "../../logic/art";
import { leaders, overviewMetrics, stageTotal } from "../../logic/metrics";
import { seatsFrom } from "../../logic/table";
import type { DraftInteraction } from "../../logic/useDraftInteraction";
import SevenIcon, { ScoreIcon } from "../SevenIcon";
import WonderMedallion from "../WonderMedallion";

/**
 * Every city side by side on every public number: a column each (yours
 * first, then round the table), a row per metric, the outright leader of
 * each row lit.
 */
export default function OverviewView({
  ix,
  names,
  onOpen,
}: {
  ix: DraftInteraction;
  names: readonly string[];
  onOpen: (seat: number) => void;
}) {
  const { view, myIndex } = ix;
  const sections = useMemo(() => overviewMetrics(view), [view]);
  const order = seatsFrom(myIndex, view.playerCount);
  const cols = order.length;
  const rows = 1 + sections.reduce((n, s) => n + 1 + s.rows.length, 0);

  return (
    <Surface variant="raised" padding="none" className="min-h-0 flex-1 overflow-auto">
      <div
        className="grid min-h-full min-w-max text-xs 2xl:text-sm"
        style={{
          gridTemplateColumns: `minmax(10rem, 13rem) repeat(${cols}, minmax(6.5rem, 1fr))`,
          gridTemplateRows: `auto repeat(${rows - 1}, minmax(1.25rem, 1fr))`,
        }}
      >
        <div className="sticky left-0 top-0 z-raised-2 border-b border-line bg-surface-900 px-4 py-3" />
        {order.map((seat) => {
          const p = view.players[seat];
          const art = wonderBoardArt(p.wonderId, p.side);
          return (
            <Button
              key={seat}
              variant="plain"
              bleed
              onClick={() => onOpen(seat)}
              title={`Open ${names[seat]}'s city`}
              className={cn(
                "sticky top-0 z-raised isolate h-auto flex-col items-center gap-1 overflow-hidden border-b border-line bg-surface-900 px-3 py-2.5 transition-colors hover:bg-fill-strong",
                seat === myIndex && "ring-1 ring-inset ring-amber-300/50",
              )}
            >
              {art && (
                <img
                  src={art}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-45"
                  style={{
                    objectPosition: `${WONDER_FOCUS[p.wonderId].x * 100}% 40%`,
                    maskImage: "linear-gradient(0deg, transparent, black 60%)",
                    WebkitMaskImage: "linear-gradient(0deg, transparent, black 60%)",
                  }}
                />
              )}
              <WonderMedallion
                wonderId={p.wonderId}
                side={p.side}
                stagesBuilt={p.stagesBuilt}
                className="h-12 w-12"
              />
              <span
                className="relative max-w-full truncate text-center font-semibold text-fg-strong"
                style={{ textShadow: "0 1px 4px rgb(0 0 0 / 0.9)" }}
              >
                {seat === myIndex ? "You" : names[seat]}
              </span>
            </Button>
          );
        })}

        {sections.map((section) => (
          <Fragment key={section.title}>
            <div
              className="sticky left-0 z-lift flex items-end bg-surface-950/90 px-4 pb-2 pt-3 font-fantasy text-sm font-bold text-amber-200"
              style={{
                gridColumn: `1 / span ${cols + 1}`,
                backgroundImage: artBg("band-greek-key"),
                backgroundRepeat: "repeat-x",
                backgroundSize: "auto 5px",
                backgroundPosition: "left bottom",
              }}
            >
              {section.title}
            </div>
            {section.rows.map((row) => {
              const lead = leaders(row);
              return (
                <Fragment key={row.label}>
                  <div
                    className="sticky left-0 z-lift flex items-center gap-2 border-b border-line-soft bg-surface-900 px-4 py-0.5 text-fg-secondary"
                    title={row.hint}
                  >
                    {row.score ? (
                      <ScoreIcon category={row.score} className="h-5 w-5" />
                    ) : (
                      row.icon && <SevenIcon name={row.icon} className="h-5 w-5" />
                    )}
                    {row.swatch && (
                      <span
                        className="h-3.5 w-2.5 rounded-sm ring-1 ring-black/40"
                        style={{ backgroundColor: COLOR_HEX[row.swatch] }}
                      />
                    )}
                    {row.label}
                  </div>
                  {order.map((seat) => {
                    const v = row.values[seat];
                    const lit = lead.has(seat);
                    return (
                      <div
                        key={seat}
                        className={cn(
                          "flex items-center justify-center border-b border-line-soft px-3 py-0.5 tabular-nums",
                          seat === myIndex && "bg-fill",
                          lit
                            ? "font-bold text-amber-200"
                            : v === 0
                              ? "text-fg-disabled"
                              : "text-fg-primary",
                        )}
                      >
                        {lit && (
                          <span className="mr-1 text-3xs" title="Leads this row">
                            ▲<span className="sr-only">leads:</span>
                          </span>
                        )}
                        {row.label === "Wonder stages" ? `${v}/${stageTotal(view, seat)}` : v}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </div>
    </Surface>
  );
}
