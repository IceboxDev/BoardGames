// A player's profile picture, by URL, for every game table.
//
//   GET /api/avatars/:userId?v=<version> → the picture (or a redirect to it)
//
// `user.image` is either a generated avatar stored inline as a webp data URI
// (~10–40 KB) or a sign-in provider's https URL. Rooms broadcast their state
// on every join, ready and swap, so the bytes never ride along: a seat
// carries `avatarUrl` (`avatarUrlFor`) and the browser fetches the picture
// once. The `v` is a hash of the stored image, so a new avatar is a new URL
// and the old one may be cached forever.

import { createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "../db.ts";
import { dataUriToBuffer } from "./data-uri.ts";
import { parseRows } from "./db-rows.ts";

const ImageRowSchema = z.object({ image: z.string().nullable() });

/** The stored `user.image`, or null for no such user / no picture. */
export async function storedImage(userId: string): Promise<string | null> {
  const { rows } = await getDb().execute({
    sql: `SELECT image FROM "user" WHERE id = ? LIMIT 1`,
    args: [userId],
  });
  return parseRows(ImageRowSchema, rows, "user.avatar")[0]?.image ?? null;
}

/** Where a browser loads this image from; null when there is none to show. */
export function avatarUrlFor(userId: string, image: string | null): string | null {
  if (!image || !isServable(image)) return null;
  const version = createHash("sha256").update(image).digest("base64url").slice(0, 12);
  return `/api/avatars/${encodeURIComponent(userId)}?v=${version}`;
}

/** A user's avatar URL, looked up now. */
export async function playerAvatarUrl(userId: string): Promise<string | null> {
  return avatarUrlFor(userId, await storedImage(userId));
}

const DATA_URI = /^data:(image\/(?:webp|png|jpeg|gif));base64,/;

function isServable(image: string): boolean {
  return DATA_URI.test(image) || image.startsWith("https://");
}

export type AvatarBody =
  | { kind: "bytes"; contentType: string; bytes: Buffer }
  | { kind: "redirect"; url: string };

/** What `GET /api/avatars/:userId` answers with; null → 404. */
export function avatarBody(image: string | null): AvatarBody | null {
  if (!image) return null;
  const type = DATA_URI.exec(image)?.[1];
  if (type) return { kind: "bytes", contentType: type, bytes: dataUriToBuffer(image) };
  if (image.startsWith("https://")) return { kind: "redirect", url: image };
  return null;
}
