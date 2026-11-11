// The goodbye screen's words. Fixed on purpose: one short farewell, the same
// for everyone — except that a signed-in member is thanked by name. Edit here.

export const GOODBYE_TITLE = "It was fun while it lasted.";

/** The line under the title; `firstName` is null for a signed-out visitor. */
export function goodbyeLine(firstName: string | null): string {
  return firstName
    ? `Thanks for every game, ${firstName} — every grudge and every rule we made up.`
    : "Thanks for every game, every grudge and every rule we made up.";
}

/** "Mantas Kandratavičius" → "Mantas"; empty or missing → null. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
