import { cn } from "../../../lib/cn";

// The timer as a row of tokens, left to right: checkmark-side tokens, then the
// bystander-side ones (the mission's free mistakes), then the spent ones. In
// the standard game every token is bystander side.

export function TimerTokens({
  tokens,
  tokensTotal,
  mistakesLeft,
  mistakesTotal,
  size = "sm",
}: {
  tokens: number;
  tokensTotal: number;
  mistakesLeft: number | null;
  mistakesTotal: number | null;
  size?: "sm" | "lg";
}) {
  const checkmarks = tokens - (mistakesLeft ?? tokens);
  return (
    <div className={cn("flex flex-wrap", size === "lg" ? "gap-2" : "gap-1.5")}>
      {Array.from({ length: tokensTotal }, (_, i) => {
        const kind = i >= tokens ? "spent" : i < checkmarks ? "check" : "bystander";
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens are interchangeable
            key={i}
            title={
              kind === "bystander"
                ? "Bystander side: a free mistake"
                : kind === "check"
                  ? "Checkmark side: a turn, not a mistake"
                  : undefined
            }
            className={cn(
              "rounded-full border-2 transition-colors",
              size === "lg" ? "h-7 w-7" : "h-4 w-4",
              kind === "spent"
                ? "border-line bg-transparent"
                : kind === "check" && mistakesTotal !== null
                  ? "border-cn-green-deep bg-cn-green shadow"
                  : "border-cn-tan-deep bg-cn-tan shadow",
            )}
          />
        );
      })}
    </div>
  );
}
