interface DrawPileProps {
  count: number;
  onClick?: () => void;
  glowing?: boolean;
}

export default function DrawPile({ count, onClick, glowing }: DrawPileProps) {
  return (
    <div className="text-center">
      <p className="mb-2 text-sm text-gray-400">Draw Pile</p>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`flex h-36 w-24 items-center justify-center rounded-xl bg-indigo-900 text-lg font-bold text-white shadow-lg transition ${
          onClick ? "hover:bg-indigo-800 cursor-pointer" : "cursor-default opacity-70"
        } ${glowing ? "ring-2 ring-yellow-400 animate-pulse" : ""}`}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">🐱</span>
          <span>{count}</span>
        </div>
      </button>
    </div>
  );
}
