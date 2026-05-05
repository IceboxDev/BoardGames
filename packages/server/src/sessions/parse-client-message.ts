import { type ClientMessage, ClientMessageSchema } from "@boardgames/core/protocol";

export class ClientMessageParseError extends Error {
  constructor(public readonly issues: unknown) {
    super("Failed to parse client WebSocket message");
    this.name = "ClientMessageParseError";
  }
}

/**
 * Parse a raw WebSocket message from the client. Throws
 * {@link ClientMessageParseError} on malformed JSON or shape mismatch — the
 * caller decides whether to drop the connection or just log.
 */
export function parseClientMessage(raw: string): ClientMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ClientMessageParseError("not valid JSON");
  }
  const result = ClientMessageSchema.safeParse(json);
  if (!result.success) {
    throw new ClientMessageParseError(result.error.issues);
  }
  return result.data;
}
