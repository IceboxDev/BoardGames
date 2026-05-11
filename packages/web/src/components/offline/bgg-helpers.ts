// Pure helpers shared by GameCarousel3D / FamilyCarouselCard / BggInline.
// Kept separate from BggInline.tsx so React's `useComponentExportOnlyModules`
// rule stays happy (component files only export components).

export function weightLabel(w: number): string {
  if (w < 2) return "Light";
  if (w < 3) return "Medium-light";
  if (w < 3.5) return "Medium";
  if (w < 4) return "Medium-heavy";
  return "Heavy";
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function stripBggHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#10;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
