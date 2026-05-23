// Wire-protocol shapes live in `@boardgames/core/protocol` so that server
// and web cannot drift. The local aliases keep the existing call-site names
// (ClientToServerMessage / ServerToClientMessage) stable.
export type {
  ClientMessage as ClientToServerMessage,
  ServerMessage as ServerToClientMessage,
} from "@boardgames/core/protocol";
