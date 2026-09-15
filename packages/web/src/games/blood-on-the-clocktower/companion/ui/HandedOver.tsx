/** The placeholder Storyteller-only blocks show while the phone is handed over. */
export function HandedOver({ what = "This part" }: { what?: string }) {
  return (
    <p className="text-center text-xs text-fg-muted">
      {what} is hidden until the Storyteller has the phone back.
    </p>
  );
}
