// One-off password reset using better-auth's own hasher + internal adapter,
// so the resulting hash matches what `signInEmail` will verify against.
//
// Run with:
//   pnpm --filter @boardgames/server exec tsx --env-file=.env scripts/reset-password.mjs <userId> <newPassword>

import { auth } from "../src/auth/config.ts";

const [, , userId, newPassword] = process.argv;
if (!userId || !newPassword) {
  console.error("usage: node --env-file=.env scripts/reset-password.mjs <userId> <newPassword>");
  process.exit(1);
}

const ctx = await auth.$context;
const minLen = ctx.password.config.minPasswordLength;
if (newPassword.length < minLen) {
  console.error(`password too short — better-auth requires >= ${minLen} chars`);
  process.exit(1);
}

const existing = await ctx.internalAdapter.findUserById(userId);
if (!existing) {
  console.error(`no user with id=${userId}`);
  process.exit(1);
}

const hashed = await ctx.password.hash(newPassword);
await ctx.internalAdapter.updatePassword(userId, hashed);
console.log(`password reset for ${existing.name} <${existing.email}>  (id=${userId})`);
