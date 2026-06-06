## Problem

Firecrawl IS wired (`src/server/web.server.ts`, slash commands `/search` and `/fetch`, auto URL fetch in chat), but in the screenshot the CEO agent told the operator it doesn't have Firecrawl as a tool. Reason: the normal conversational reply path (`src/serverfns/ceo-chat.functions.ts` ~line 1284) calls `chatCompletion` **without** any `tools`, so the model can't invoke web access on its own — it can only react when the user types `/search` / `/fetch` or pastes a URL. The system prompt describes those slash commands, but the model still hallucinated "no Firecrawl".

## Fix

Wire Firecrawl as native tool calls on the conversational CEO reply, and tighten the prompt so it stops denying it.

### 1. `src/serverfns/ceo-chat.functions.ts` — add web tools to the normal reply

- Define `WEB_TOOLS` (OpenAI tool-schema shape) with two functions:
  - `web_search({ query: string, limit?: number<=8 })` → calls `webSearch(query, limit ?? 6)`.
  - `web_fetch({ url: string })` → calls `webFetch(url)`, return `{ url, title, description, markdown }` truncated to ~6k chars.
- Replace the single `chatCompletion` call near line 1284 with a small tool-call loop (max 4 iterations) using `resolvedModel`:
  1. Pass `tools: WEB_TOOLS`, `tool_choice: "auto"`.
  2. If `choices[0].message.tool_calls` is present, execute each tool, push the assistant message + `role:"tool"` results into `messages`, and loop.
  3. Otherwise take `choices[0].message.content` as the reply.
  4. Wrap each tool call in try/catch; on failure return `{ error: e.message }` as the tool result so the model can recover.
- Cap total tool calls per turn at 4 and per-call results at ~6k chars to keep token use bounded.
- Keep the existing `/search`, `/fetch`, and auto-URL-fetch paths exactly as-is — they remain useful fast paths and don't depend on the model deciding to call a tool.

### 2. `src/serverfns/ceo-chat.functions.ts` — update `buildCeoSystem`

Replace the "live internet access via /search /fetch" bullet with:

> You have **live internet access via two tools**: `web_search(query, limit?)` for live web search and `web_fetch(url)` to read a specific page (both backed by Firecrawl). Call them yourself whenever you need fresh facts, benchmarks, prices, or to verify a claim — do not tell the operator you lack web access, and do not ask them to run `/search` manually. The slash commands `/search <q>` and `/fetch <url>` are also available as shortcuts they can type. Cite sources inline as `[domain](url)`.

### 3. No other changes

- No DB / RLS / migration changes.
- No UI changes — tool calls happen server-side and only the final assistant markdown is saved to `ceo_chat_messages`, exactly like today.
- Allowed-models rule respected: tools work over OpenRouter on the existing tool-capable models (Grok 4.3 default, etc.); no model added or swapped.

### Technical notes

- `chatCompletion` (`src/server/llm.server.ts`) already supports `tools` / `tool_choice` and sets `provider: { require_parameters: true }`, so no helper changes needed.
- Tool-call message shape sent back to OpenRouter:
  ```ts
  { role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls }
  { role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result) }
  ```
- If a model returns a 404 "no tool-capable endpoint" (already handled in `chatCompletion`), the error surfaces normally — the operator can switch model.
