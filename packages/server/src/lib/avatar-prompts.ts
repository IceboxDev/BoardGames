import type { AvatarStyleId } from "@boardgames/core/protocol";

// Avatar style = a prompt template. `[GAME NAME]` placeholders are filled with
// the selected game's name; the game's description and the user's free-text
// comments are appended as extra context. Add new styles to both this map and
// `AVATAR_STYLES` in `core/protocol/http/avatar.ts`.

const STANDARD = `Create a polished chibi-inspired avatar of the person shown in the provided realistic reference image. The avatar should be suitable for use as a profile picture on a modern board game website.

The character should preserve the person’s key recognizable traits from the reference photo, including face shape, hairstyle, hair color, skin tone, facial hair if present, eyewear if present, and general expression. Do not make the character look like a different person. Transform the person into a charming, high-quality chibi style with a large expressive head, simplified but recognizable facial features, small body proportions, soft rounded shapes, and an appealing friendly presence.

The player is an expert in [GAME NAME]. Integrate visual elements inspired by this game into the avatar design in a tasteful and symbolic way. The game expertise should be immediately recognizable to fans of the game, but the avatar should still look clean, iconic, and usable at small profile-picture sizes.

Use [GAME NAME]-inspired elements such as:

Thematic colors associated with the game
Iconic resources, tokens, cards, tiles, meeples, dice, miniatures, maps, boards, or strategy components
A small prop held by the character
A subtle background motif
Costume accents inspired by the game’s world, mechanics, or theme
A confident “expert player” pose that suggests mastery, strategy, or playful competitiveness

Avoid copying copyrighted board art or exact logos. Instead, use original, stylized, game-inspired motifs that evoke the game’s theme and gameplay.

The character should feel like a friendly board game champion: clever, approachable, enthusiastic, and slightly whimsical. The avatar should not look overly childish; it should be chibi-inspired but polished, modern, and suitable for an adult hobby gaming audience.

Use a clean digital illustration style with smooth linework, soft cel-shading, gentle highlights, and crisp readable shapes. The image should have high visual clarity, especially around the face and game-related props. The background should be simple and not distracting, such as a soft gradient, subtle tabletop texture, circular badge, or minimal abstract pattern inspired by the game.

Composition:

Centered character portrait
Bust or half-body framing
Square profile-picture format
Clear silhouette
Face should be the main focal point
Game elements should support the character, not overwhelm them
Works well when cropped into a circle

Style direction:

Chibi-inspired proportions
High-quality digital avatar
Friendly board game website aesthetic
Expressive but not exaggerated beyond recognition
Clean, modern, collectible-character feel
Warm, playful, strategic, and expert-like

Lighting and rendering:

Soft studio lighting
Gentle shadows
Polished highlights
Smooth color transitions
Crisp edges
No harsh realism
No messy sketch lines

Output requirements:

Square image
Transparent or simple background
Website-ready profile avatar
No text unless specifically requested
No logos
No watermarks
No extra people
No distorted hands
No uncanny facial features`;

const STYLE_PROMPTS: Record<AvatarStyleId, string> = {
  standard: STANDARD,
};

/** BGG descriptions are HTML-ish; flatten to plain prose and cap for the prompt. */
function plainDescription(html: string, max = 600): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#10;|&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Fill a style template: replace `[GAME NAME]`, then append the game's
 * description (so the model understands games it may not know) and the user's
 * optional comments.
 */
export function buildAvatarPrompt(
  styleId: AvatarStyleId,
  gameName: string,
  gameDescription: string,
  comments: string | null,
): string {
  let prompt = STYLE_PROMPTS[styleId].replaceAll("[GAME NAME]", gameName);

  const desc = plainDescription(gameDescription);
  if (desc) {
    prompt += `\n\nFor reference, the game "${gameName}" is described as: ${desc}`;
  }
  const extra = comments?.trim();
  if (extra) {
    prompt += `\n\nAdditional instructions from the player: ${extra}`;
  }
  return prompt;
}
