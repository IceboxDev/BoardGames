/**
 * Connecting a lichess account: OAuth 2 authorization code + PKCE, entirely in
 * the browser (lichess needs no app registration for that). The token stays
 * in this browser — it reads the opening explorer, cloud evals and the game
 * export. Our server sees it once, to learn which account it belongs to.
 */
import { z } from "zod";

export const LICHESS = "https://lichess.org";
const CLIENT_ID = "boardgames-chess-trainer";
const PENDING_KEY = "chess-trainer.oauth-pending";
const TOKEN_KEY = "chess-trainer.lichess-token";

/** Where lichess sends the browser back: the trainer itself. */
export const redirectUri = () => `${window.location.origin}/play/chess/solo/trainer`;

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomText = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Leave for lichess's "authorize" page. */
export async function startLichessLogin(): Promise<void> {
  const verifier = randomText(48);
  const state = randomText(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  const url = new URL(`${LICHESS}/oauth`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await pkceChallenge(verifier),
    state,
  }).toString();
  window.location.assign(url.toString());
}

const PendingSchema = z.object({ verifier: z.string(), state: z.string() });
const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});
const StoredTokenSchema = z.object({ token: z.string(), expiresAt: z.number().nullable() });

export class OAuthError extends Error {}

/**
 * Back from lichess with `?code&state` (or `?error`): trade the code for a
 * token and keep it. Returns the token.
 */
export async function finishLichessLogin(params: URLSearchParams): Promise<string> {
  const error = params.get("error");
  if (error) throw new OAuthError(error === "access_denied" ? "You declined on lichess." : error);
  let pending: z.infer<typeof PendingSchema> | null = null;
  try {
    pending = PendingSchema.parse(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null"));
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_KEY);
  if (!pending || pending.state !== params.get("state")) {
    throw new OAuthError("That sign-in link is stale. Try connecting again.");
  }
  const res = await fetch(`${LICHESS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      code_verifier: pending.verifier,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) throw new OAuthError("lichess didn't accept the sign-in. Try again.");
  const body = TokenResponseSchema.parse(await res.json());
  const stored = {
    token: body.access_token,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null,
  };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  } catch {
    // Private mode: the token lives for this page only.
  }
  memoryToken = stored.token;
  return stored.token;
}

let memoryToken: string | null = null;

/** The kept token, if it hasn't expired. */
export function lichessToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const stored = StoredTokenSchema.parse(JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null"));
    if (stored.expiresAt !== null && stored.expiresAt < Date.now() + 60_000) return null;
    memoryToken = stored.token;
    return stored.token;
  } catch {
    return null;
  }
}

export function forgetLichessToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing kept
  }
}
