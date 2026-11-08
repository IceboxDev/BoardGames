# AI platform: any provider, one ledger, agents

All server AI runs through `packages/server/src/lib/ai/`, on the [Vercel AI SDK](https://ai-sdk.dev) 7. The SDK is the provider-agnostic layer. This folder adds four things on top of it:
- which model answers;
- what each provider needs;
- what every call cost;
- the kill switch.

Switching the whole site to another provider is one env var.

## Roles, profiles, registry (`models.ts`)

A feature never names a model. It names a **role**:

| Role | Meant for | Used by |
|---|---|---|
| `fast` | cheap, quick answers | Codenames/Decrypto Scout tiers, the health probe |
| `balanced` | solid mid tier | Analyst tiers, the Mastermind's keyless test reader, clue rulings |
| `smart` | the strongest text model | Mastermind tiers, D&D, descriptions, skills, agents |
| `image` | image output | avatars |

`AI_PROFILE` picks the role → model table:

| Role | `gateway` (default) | `anthropic` | `openai` |
|---|---|---|---|
| fast | `gateway:openai/gpt-5-nano` | `anthropic:claude-haiku-5-5` | `openai:gpt-5-nano` |
| balanced | `gateway:openai/gpt-5.4-nano` | `anthropic:claude-sonnet-5-5` | `openai:gpt-5.4-nano` |
| smart | `gateway:openai/gpt-5.2` | `anthropic:claude-opus-5-5` | `openai:gpt-5.2` |
| image | `gateway:google/gemini-3.1-flash-image` | — | — |

How the ids and keys work:
- **Ids** are AI SDK registry ids, `<provider>:<model>`. A bare `vendor/model` string is a Vercel AI Gateway slug, so `openai/gpt-5.2` reads as `gateway:openai/gpt-5.2`. Every model env var written before profiles keeps working.
- **No image model.** A profile without one falls back to the gateway's image model when `AI_GATEWAY_API_KEY` is set. Otherwise avatars answer 503, because Claude has no image output.
- **Keys.** Each provider reads its own key: `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. A call whose provider has no key fails as `AiConfigError`, naming the variable, before any request leaves. `aiAvailable()` is true when the profile's `smart` provider has its key. Game seats fall back to their deterministic stand-ins otherwise.

### Pinning a model

From most to least specific (`config.ts` `resolveModel`):
1. A caller's `modelOverride`. Game tiers pass `tierModel(env, role)`, so `CODENAMES_MODEL_EXPERT` / `DECRYPTO_MODEL_HARD` / … pin one tier.
2. The feature's own var: `AI_MODEL_DND`, `AI_MODEL_DND_EXTRACT`, `AI_MODEL_AVATAR`, `AI_MODEL_DESCRIPTIONS`, `AI_MODEL_SKILLS`.
3. `AI_MODEL` (text features only).
4. The feature's role in the active profile.

A pin is a model string, so it can point anywhere, e.g. `AI_MODEL_DND=anthropic:claude-fable-5-1` on the gateway profile.

## Provider adapters (`providers.ts`)

Everything provider-specific lives here, and nothing else in the server may name a provider (`provider-coupling.test.ts`):

| | gateway | anthropic | openai |
|---|---|---|---|
| request options | `gateway: { tags: ["feature:<f>"], models: AI_MODEL_FALLBACKS }` | — | — |
| system prompt | plain | a system message with `cacheControl: ephemeral` (Anthropic's prompt cache; short prefixes just don't cache) | plain |
| cost | the gateway's billed `cost` (`costSource: "billed"`) | list prices in `pricing.ts` (`"list"`, shown as `~$` in the log) | — (null) |
| hosted web search | OpenAI's, for `openai/*` models | `web_search_20260209` | OpenAI's |

Reasoning effort travels as the SDK's unified `reasoning` setting. The SDK maps it to each provider's own control: Anthropic's adaptive thinking + `effort`, or OpenAI's reasoning effort. Structured output is the SDK's `Output.object` with our strict JSON schemas. The Anthropic provider uses native structured output and falls back by itself when a schema is outside what that supports.

**Retries and budget errors** (`retry.ts`) are one layer for every provider:
- 408/409/429/5xx/529 and network faults retry.
- These map to `AiBudgetError` (→ 503, seats fall back), never retried:
  - the gateway's 402;
  - a gateway free-tier restriction;
  - Anthropic's "credit balance is too low".

## The ledger (`ledger.ts`)

Every call is one record: feature, model id, time, tokens (including prompt-cache reads and writes), dollars and where the dollars came from, prompt and answer. The record goes to:
- the `[ai]` log line;
- `/api/admin/ai-calls`;
- `scratch/ai-traces/<date>.jsonl` off the deployed server.

An agent run records each step as its own record, with a shared `runId`.

## Entry points

| Need | Use |
|---|---|
| one structured answer (JSON schema in, object out) | `structuredGenerate` / `structuredGenerateTraced` (`generate.ts`): stream transport by default, retries, ledger |
| an image | `generateAvatarImage` (`image.ts`) |
| a model that calls tools until done | `defineAgent` (`agent.ts`) |
| tools from an MCP server | `connectMcpTools(url)` (`mcp.ts`) |
| a local script | `scriptModel(feature)` (`scripts.ts`): same profile, pins and kill switch |
| what is configured right now | `aiStatus()`: profile, each role's model, which keys are set; also in `/api/health/ai` |

## Agents (`agent.ts`)

```ts
const agent = defineAgent({
  label: "night-planner",
  role: "smart",
  instructions: "…",
  tools: { catalogLookup },        // lib/ai/tools/: tool() + zod input schema
  maxSteps: 8,                     // hard cap on model calls
  budgetUsd: 0.5,                  // stop once the run has spent this
  reasoningEffort: "low",
});
const run = await agent.run("…");  // { runId, text, steps, costUsd, model }
```

The run uses the AI SDK's `ToolLoopAgent`. It:
- stops at the step cap, the dollar budget, or the first answer that calls no tool;
- re-checks `AI_SUSPENDED` before every step;
- records every step in the ledger.

Tools are read-only unless their name says otherwise and validate their input with zod. Never give an agent a tool that writes without a reason the feature can show a person. Tests run agents on a scripted `MockLanguageModelV4` (`setAgentModelForTests`, `agent.test.ts`).

## Adding a provider

1. Add its `@ai-sdk/<provider>` package to the server and register it in `models.ts` (`createProviderRegistry`), with its key env var in `PROVIDER_KEY_ENV`.
2. Add a profile row to `PROFILES` (every text role).
3. Add an adapter in `providers.ts`: request options, system-prompt shape, billing; plus web search if it has one.
4. Add price rows in `pricing.ts` if it doesn't report cost. `config.test.ts` fails on an Anthropic model without one.
5. Run the trial (below).

## Trying a profile: `ai-smoke`

```bash
cd packages/server
AI_PROFILE=anthropic pnpm exec tsx src/scripts/ai-smoke.ts         # lists what it would call
AI_PROFILE=anthropic pnpm exec tsx src/scripts/ai-smoke.ts --yes   # calls it (bills)
#   --pdf=<character sheet.pdf> adds a D&D extraction
```

It calls each feature once and prints every call it made:
- the probe;
- Codenames clue (with the Mastermind's test reads), guess and clue ruling;
- Decrypto encrypt and intercept;
- an agent tool loop.

A step fails if any call failed or a game agent answered with its stand-in. Then play Codenames / Duet / Decrypto against the AI with `pnpm dev:all` and watch for deadline trips, because the game budgets were tuned on GPT timings. Re-bench strength with `TOURNAMENT_LLM=1 pnpm --filter @boardgames/core tournament codenames|decrypto`, which follows `AI_PROFILE` too.

The two generation scripts follow the profile as well (`pnpm gen-descriptions --slug <slug>`, `pnpm gen-skills`). Descriptions refuse to run on a model without hosted web search.
