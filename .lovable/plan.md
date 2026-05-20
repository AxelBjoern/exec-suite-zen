## Why the selector "doesn't work"

The model picker IS wired for plain CEO replies and document generation (both call `resolveChatModel(data.model)`), but the **@mention dispatch path ignores it**:

- In `src/serverfns/ceo-chat.functions.ts`, when the message starts with `@board` / `@ceo` / `@cfo` / etc., the handler calls `routePrompt(...)` and `dispatch(...)` from `terminal.functions.ts`.
- Those server functions call `callTool({...})` in `src/server/llm.server.ts` **without a `model` argument**, so every dispatch falls back to `DEFAULT_MODEL` (Hermes 4 405B), no matter what the user picked.
- That's why selecting "Claude Opus 4.7", "GPT-5", "DeepSeek V4 Pro", or "Grok 4.3" doesn't change the actual model used for @mentions.

`callTool` already accepts an optional `model`; the chain just isn't passed through.

## Fix

Thread the selected model id from the client all the way to `callTool`.

1. `src/serverfns/terminal.functions.ts`
   - `dispatch` input: add optional `model?: string`.
   - `routePrompt` input: add optional `model?: string`.
   - In both, compute `const chosen = resolveChatModel(data.model);` and pass `model: chosen` to every `callTool({...})` call (router, free-form solo, structured artifact, and each consult).

2. `src/serverfns/ceo-chat.functions.ts`
   - In the `@mention` branch, pass `model: data.model` into `routePrompt(...)` and both `dispatch(...)` calls (boardroom + solo agent).

3. `src/server/llm.server.ts` — no change. `callTool` and `chatCompletion` already accept `model`.

4. Client — no change. `src/routes/index.tsx` already sends `model` with `sendCeoMessage` and `generateCeoDocument`.

## Allowed models (selector ↔ OpenRouter slug)

These are the only models that may be used. The mapping lives in `resolveChatModel` in `src/server/llm.server.ts`:

| Picker label        | OpenRouter slug                  |
|---------------------|----------------------------------|
| Hermes 4 405B       | `nousresearch/hermes-4-405b`     |
| Grok 4.3            | `x-ai/grok-4`                    |
| GPT-5               | `openai/gpt-5`                   |
| Claude Opus 4.7     | `anthropic/claude-opus-4.7`      |
| DeepSeek V4 Pro     | `deepseek/deepseek-chat`         |

Hard rules:
- Claude must resolve to `anthropic/claude-opus-4.7` — never `claude-opus-4.1` or any earlier Opus.
- GPT-5, DeepSeek V4 Pro, and Grok 4.3 are explicitly allowed and must be honored by the selector everywhere (including @mention dispatch after the fix above).
- No code path may hard-code a different model when one of the five picker options is selected.

## Out of scope

- No UI changes to the picker itself.
- No changes to cron / cadence callers (they're scheduled jobs, not user-driven).
- No changes to the model list or labels.

## Verification

After implementation: pick each model in turn and send `@cfo summarize Q3`. The outgoing OpenRouter request should use the slug from the table above for every selection — not the Hermes default.