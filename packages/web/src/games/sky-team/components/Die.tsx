import type { Die as DieType, DieValue } from "@boardgames/core/games/sky-team/types";

interface DieProps {
  die: DieType | { color: "blue" | "orange"; value: DieValue };
  size?: "sm" | "md" | "lg";
  faded?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const SIZE_CLASS: Record<NonNullable<DieProps["size"]>, string> = {
  sm: "h-7 w-7 text-base",
  md: "h-10 w-10 text-xl",
  lg: "h-14 w-14 text-2xl",
};

const COLOR_CLASS: Record<"blue" | "orange", string> = {
  blue: "bg-sky-500 text-white border-sky-300",
  orange: "bg-orange-500 text-white border-orange-300",
};

export default function Die({ die, size = "md", faded, selected, onClick }: DieProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-md border-2 font-bold leading-none",
    SIZE_CLASS[size],
    COLOR_CLASS[die.color],
    faded ? "opacity-40" : "",
    selected ? "ring-4 ring-yellow-300 scale-110" : "",
    onClick ? "cursor-pointer hover:scale-105 active:scale-95 transition-transform" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick}>
      {die.value}
    </button>
  );
}

export function HiddenDie({
  size = "md",
  color,
}: {
  size?: "sm" | "md" | "lg";
  color: "blue" | "orange";
}) {
  const classes = [
    "inline-flex items-center justify-center rounded-md border-2 leading-none",
    SIZE_CLASS[size],
    color === "blue"
      ? "bg-sky-900 border-sky-600 text-sky-700"
      : "bg-orange-900 border-orange-600 text-orange-700",
  ].join(" ");
  return <span className={classes}>?</span>;
}
