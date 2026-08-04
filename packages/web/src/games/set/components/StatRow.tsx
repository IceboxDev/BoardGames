// One label/value line in the Set side rail. Was pasted (modulo the `mono`
// prop) into both TrainerGame and PvpGameBoard.
export default function StatRow({
  label,
  value,
  color = "text-white",
  mono = false,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs uppercase tracking-label text-fg-muted">{label}</span>
      <span className={`text-base font-bold tabular-nums ${color}${mono ? " font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
