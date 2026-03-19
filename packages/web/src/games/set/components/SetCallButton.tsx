interface SetCallButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export default function SetCallButton({ onClick, disabled }: SetCallButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-2xl px-10 py-4 text-2xl font-extrabold tracking-wider text-white transition-all duration-200",
        disabled
          ? "bg-gray-700 opacity-40 cursor-not-allowed"
          : "bg-indigo-600 hover:bg-indigo-500 active:scale-95 animate-pulse-glow cursor-pointer",
      ].join(" ")}
    >
      SET!
    </button>
  );
}
