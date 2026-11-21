import manifest from "../assets/art/manifest.json" with { type: "json" };

/**
 * Decrypto's painted desk parts (ART-PROMPTS.md): code screens and windows,
 * plates, tokens, lamps, dials, teletype paper, desk textures, insignia and
 * the debrief scenes. `manifest.json` names every image and the size the
 * optimiser (`card-art --game=decrypto`) shrinks it to; a missing file means
 * that spot draws its CSS fallback.
 */
export type ArtName = keyof typeof manifest;

const ART_URLS = import.meta.glob<string>("../assets/art/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlByName = new Map<string, string>();
for (const [path, url] of Object.entries(ART_URLS)) {
  urlByName.set(path.slice(path.lastIndexOf("/") + 1).replace(/\.webp$/, ""), url);
}

/** The URL of an image, or `undefined` while it has not been generated. */
export function artUrl(name: ArtName): string | undefined {
  return urlByName.get(name);
}

/** `url(...)` for a CSS background, or `none` while the image is missing. */
export function artBg(name: ArtName): string {
  const url = artUrl(name);
  return url ? `url("${url}")` : "none";
}

/** Every desk image as a CSS custom property (`--dc-art-<name>`), set once on the desk. */
export function artVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of Object.keys(manifest) as ArtName[]) vars[`--dc-art-${name}`] = artBg(name);
  return vars;
}
