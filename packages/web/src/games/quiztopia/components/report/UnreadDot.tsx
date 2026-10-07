// The "something happened to your report" dot — on the hub's Wiki button
// and the archive's "Your reports" link. Its parent must be `relative`.

export function UnreadDot({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = `${count} report ${count === 1 ? "outcome" : "outcomes"} you haven't seen`;
  return (
    <span
      title={label}
      className="pointer-events-none absolute -right-1 -top-1 flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-surface-950"
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
