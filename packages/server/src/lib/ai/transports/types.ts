import type { JSONValue, LanguageModel, ModelMessage } from "ai";

export interface AiTextPart {
  type: "text";
  text: string;
}

/** File payload as a data URI (the form the routes already carry PDFs in). */
export interface AiFilePart {
  type: "file";
  mediaType: string;
  filename?: string;
  dataUri: string;
}

export type AiUserContent = string | (AiTextPart | AiFilePart)[];

export interface AiTransportRequest {
  /** Gateway slug ("provider/model"; a model instance only in tests); openai-background requires an openai/* slug. */
  model: LanguageModel;
  label: string;
  system?: string;
  user: AiUserContent;
  schemaName: string;
  /** Raw strict JSON Schema (additionalProperties: false, all required). */
  jsonSchema: Record<string, unknown>;
  /** Total wall-clock budget for the call, ms. */
  budgetMs: number;
  reasoningEffort?: "low" | "medium" | "high";
  /** providerOptions.gateway payload (tags, fallback models). */
  gatewayOptions?: Record<string, JSONValue>;
}

/** Runs one structured call and returns the parsed (schema-shaped) object. */
export type AiTransport = (req: AiTransportRequest) => Promise<unknown>;

export function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1) throw new Error("malformed data URI");
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/** Convert the transport-neutral user content into AI SDK model messages. */
export function toUserMessages(user: AiUserContent): ModelMessage[] {
  if (typeof user === "string") {
    return [{ role: "user", content: [{ type: "text", text: user }] }];
  }
  return [
    {
      role: "user",
      content: user.map((part) =>
        part.type === "text"
          ? { type: "text" as const, text: part.text }
          : {
              type: "file" as const,
              data: dataUriToBuffer(part.dataUri),
              mediaType: part.mediaType,
              ...(part.filename ? { filename: part.filename } : {}),
            },
      ),
    },
  ];
}
