import type { AppGreeting, AppGreetingAckBody, GreetingAckAction } from "@boardgames/core/protocol";

// The two pure halves of GreetingHost, exhaustive over the greeting union so
// a new kind fails to compile here before it can be forgotten in the host.

/** Stable identity per greeting, so dismissing one never hides a LATER,
 * different greeting that arrives in the same session. */
export function greetingKey(g: AppGreeting): string {
  switch (g.kind) {
    case "skill-intro":
      return "skill-intro";
    case "spotlight":
      return `spotlight:${g.id}`;
    case "purchase-vote-announce":
      return `pv-announce:${g.pollId}`;
    case "purchase-vote-reminder":
      return `pv-reminder:${g.pollId}`;
    case "arrival":
      return `arrival:${g.arrivalId}`;
  }
}

/** The ack body for a greeting, carrying HOW it was answered. */
export function ackBody(g: AppGreeting, action: GreetingAckAction): AppGreetingAckBody {
  switch (g.kind) {
    case "spotlight":
      return { kind: "spotlight", id: g.id, action };
    case "skill-intro":
      return { kind: "skill-intro", action };
    case "purchase-vote-announce":
      return { kind: "purchase-vote-announce", pollId: g.pollId, action };
    case "purchase-vote-reminder":
      return { kind: "purchase-vote-reminder", pollId: g.pollId, action };
    case "arrival":
      return { kind: "arrival", arrivalId: g.arrivalId, action };
  }
}
