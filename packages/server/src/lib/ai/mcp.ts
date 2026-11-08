import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

/**
 * An MCP server's tools as an AI SDK tool set, for an agent (agent.ts) that
 * needs someone else's tools. The caller owns the connection: `close()` it
 * when the run is over. No MCP server is wired into the app yet; this is the
 * one place a feature connects to one.
 */
export async function connectMcpTools(
  url: string,
  options: { headers?: Record<string, string>; transport?: "http" | "sse" } = {},
): Promise<{ tools: ToolSet; close: () => Promise<void> }> {
  const client = await createMCPClient({
    transport: {
      type: options.transport ?? "http",
      url,
      ...(options.headers ? { headers: options.headers } : {}),
    },
  });
  try {
    return { tools: await client.tools(), close: () => client.close() };
  } catch (err) {
    await client.close();
    throw err;
  }
}
