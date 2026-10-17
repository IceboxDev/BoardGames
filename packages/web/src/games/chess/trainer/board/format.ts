/** Short counts for tight columns: 980, 4.7k, 12k, 1.3M. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** A score as a percentage: 0.512 → "51%". */
export const percent = (x: number) => `${Math.round(x * 100)}%`;
