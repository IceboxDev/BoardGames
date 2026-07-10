// ── Vital ────────────────────────────────────────────────────────────────
//
// One combat stat as a bordered tile: the number, then its caption. Existed
// twice, byte-identical apart from a `px-2`, in PlayerCardLarge and
// CombatPanel. `tone` stays a raw class string because each vital carries its
// own semantic colour (rose HP, sky AC, emerald passive perception) and the
// callers already own that mapping.

type VitalProps = {
  label: string;
  value: string;
  /** Border + background + text colour classes for this stat's semantics. */
  tone: string;
  /** Adds horizontal padding. Off in the 6-column card grid, on in combat. */
  padded?: boolean;
};

export function Vital({ label, value, tone, padded = false }: VitalProps) {
  return (
    <span
      className={`flex min-w-0 flex-col items-center rounded-lg border py-1 ${
        padded ? "px-2" : ""
      } ${tone}`}
    >
      <span className="font-fantasy text-sm font-bold leading-tight">{value}</span>
      <span className="text-4xs font-bold uppercase tracking-label opacity-60">{label}</span>
    </span>
  );
}
