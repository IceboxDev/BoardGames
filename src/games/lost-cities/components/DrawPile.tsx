interface DrawPileProps {
  count: number;
  onClick?: () => void;
  glowing?: boolean;
}

export default function DrawPile({ count, onClick, glowing = false }: DrawPileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "w-12 h-[4.5rem] rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative",
        glowing
          ? "ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)] cursor-pointer hover:scale-105"
          : "border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800",
        onClick && !glowing ? "hover:scale-105 cursor-pointer" : "",
        !onClick ? "cursor-default" : "",
      ].join(" ")}
    >
      <div className="w-7 h-10 rounded border border-gray-500 bg-gray-600 opacity-50" />
      <span className="text-[0.6rem] font-bold text-gray-300 tabular-nums">{count}</span>
    </button>
  );
}
