// Symmetric encryption for backup files that leave the machine that took
// them (a CI artifact, an off-site copy). A dump holds member emails and the
// home addresses on locked nights, and this repository is public, so a
// plaintext dump anywhere but a developer's disk is a leak waiting to happen.
//
// Format (all big-endian, no framing beyond the fixed sizes):
//
//   "BGBK1" | salt (16) | iv (12) | auth tag (16) | AES-256-GCM ciphertext
//
// The key is derived from the passphrase with scrypt (N=2^15, r=8, p=1);
// GCM authenticates the ciphertext, so a wrong passphrase or a flipped byte
// fails loudly instead of restoring garbage.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("BGBK1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  if (passphrase.length < 12) {
    throw new Error("backup passphrase must be at least 12 characters");
  }
  return scryptSync(passphrase, salt, KEY_BYTES, SCRYPT);
}

export function encryptBackup(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackup(blob: Buffer, passphrase: string): Buffer {
  const headerBytes = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (blob.length < headerBytes || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("not an encrypted boardgames backup (missing BGBK1 header)");
  }
  const saltStart = MAGIC.length;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + TAG_BYTES;
  const salt = blob.subarray(saltStart, ivStart);
  const iv = blob.subarray(ivStart, tagStart);
  const tag = blob.subarray(tagStart, dataStart);
  const ciphertext = blob.subarray(dataStart);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("backup decryption failed: wrong passphrase or corrupted file");
  }
}

export const BACKUP_ENCRYPTED_EXTENSION = ".sql.enc";
