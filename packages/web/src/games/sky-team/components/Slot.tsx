import type { Die as DieType, SlotState } from "@boardgames/core/games/sky-team/types";
import Die from "./Die";

interface SlotProps {
  state: SlotState;
  label: string;
  constraint?: string;
  variant?: "blue" | "orange" | "neutral";
  switchOn?: boolean;
  selectable?: boolean;
  onClick?: () => void;
  highlighted?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<SlotProps["variant"]>, string> = {
  blue: "border-sky-700 bg-sky-950/60",
  orange: "border-orange-700 bg-orange-950/60",
  neutral: "border-slate-600 bg-slate-900/60",
};

export default function Slot({
  state,
  label,
  constraint,
  variant = "neutral",
  switchOn,
  selectable,
  onClick,
  highlighted,
}: SlotProps) {
  const classes = [
    "relative flex flex-col items-center justify-center gap-1 rounded-md border-2 p-2 min-h-[78px] min-w-[68px]",
    VARIANT_CLASS[variant],
    selectable ? "cursor-pointer hover:brightness-125 hover:border-yellow-300" : "",
    highlighted ? "ring-2 ring-yellow-300" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} onClick={onClick} disabled={!selectable}>
      <span className="text-[10px] uppercase tracking-wider text-slate-300/80 leading-none">
        {label}
      </span>
      {constraint ? (
        <span className="text-[9px] text-slate-400/70 leading-none">{constraint}</span>
      ) : null}
      {state.die ? (
        <Die die={state.die as DieType} size="md" />
      ) : (
        <span className="text-slate-600 text-xl leading-none">·</span>
      )}
      {switchOn != null ? (
        <span
          className={[
            "h-2 w-6 rounded-full",
            switchOn ? "bg-emerald-400 shadow-[0_0_6px_rgb(74,222,128)]" : "bg-slate-700",
          ].join(" ")}
        />
      ) : null}
    </button>
  );
}
