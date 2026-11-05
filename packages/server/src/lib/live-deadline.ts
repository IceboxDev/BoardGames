// The deadlines that keep a live table moving when an AI worker or an engine
// process hangs: past one, the move falls back to a weaker bot.
//
// Under vitest they stretch to just inside the test run's hang guard
// (vitest.shared.ts): a test checks what the AI answers, and how fast a busy
// machine gets there must never decide it (docs/testing.md). Production never
// sets VITEST, so live play keeps the real deadlines.

const UNDER_TEST_MS = 100_000;

export function liveDeadline(ms: number): number {
  return process.env.VITEST ? Math.max(ms, UNDER_TEST_MS) : ms;
}
