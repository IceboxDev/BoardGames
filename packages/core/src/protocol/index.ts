// Single barrel for the wire protocol. Both web and server import from
// `@boardgames/core/protocol/index` (or the bare `@boardgames/core/protocol`
// package subpath). Keep individual schema files focused and re-export from
// here so call sites stay tidy.

export * from "./common.ts";
export * from "./http/auth.ts";
export * from "./http/availability.ts";
export * from "./http/calendar.ts";
export * from "./http/games.ts";
export * from "./http/inventory.ts";
export * from "./http/tournament.ts";
export * from "./ws/client-messages.ts";
export * from "./ws/room.ts";
export * from "./ws/server-messages.ts";
