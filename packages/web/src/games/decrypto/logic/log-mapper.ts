import type { DecryptoPlayerView } from "@boardgames/core/games/decrypto/types";
import type { LogAction, LogBlock } from "../../../components/action-log/ActionLog";
import { teamLabel } from "./labels";

// History-sidebar feed: one block per finished round, one cluster of lines per
// revealed transmission. Everything here is public post-reveal information.
// Blocks AND actions are emitted in CHRONOLOGICAL order — `ActionLog` itself
// reverses both so the newest entry always sits on top; reversing here too
// would double-invert the feed.

export function mapDecryptoLog(view: DecryptoPlayerView): LogBlock[] {
  return view.roundSummaries.map((summary) => {
    const actions: LogAction[] = [];
    for (const t of summary.transmissions) {
      const who = teamLabel(view.variant, t.team);
      if (t.skipped || t.clues === null) {
        actions.push({
          key: `${summary.round}-${t.team}-skip`,
          icon: "⏱",
          spans: [
            { text: who, bold: true },
            t.skipReason === "ai"
              ? " — GPT encryptor failed, transmission skipped (1 miscommunication)"
              : " ran out of time — transmission skipped (1 miscommunication)",
          ],
          variant: "warning",
        });
        continue;
      }
      actions.push({
        key: `${summary.round}-${t.team}-clues`,
        icon: "📡",
        spans: [
          { text: who, bold: true },
          ` code ${t.code.join("-")}: `,
          t.clues.map((clue, i) => `"${clue}"→${t.code[i]}`).join("  "),
        ],
        variant: "info",
      });
      if (t.intercepted) {
        actions.push({
          key: `${summary.round}-${t.team}-intercept`,
          icon: "🎯",
          spans: [
            { text: teamLabel(view.variant, t.team === 0 ? 1 : 0), bold: true },
            " intercepted the code!",
          ],
          variant: "danger",
        });
      }
      const wrongSlots = ([0, 1, 2] as const).filter((i) => t.decodeGuess?.[i] !== t.code[i]);
      actions.push(
        t.miscommunicated
          ? {
              key: `${summary.round}-${t.team}-miscomm`,
              icon: "✗",
              spans: [
                { text: who, bold: true },
                ` decoded ${t.decodeGuess?.join("-") ?? "nothing"} — misread clue ${wrongSlots
                  .map((s) => s + 1)
                  .join(" & ")} (miscommunication)`,
              ],
              variant: "warning",
            }
          : {
              key: `${summary.round}-${t.team}-ok`,
              icon: "✓",
              spans: [{ text: who, bold: true }, " decoded their own code"],
              variant: "success",
            },
      );
    }
    return { key: summary.round, label: `Round ${summary.round}`, actions };
  });
}
