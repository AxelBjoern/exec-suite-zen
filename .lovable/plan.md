## Goal

Only these 5 models may ever appear in code, logs, errors, or UI:
- Hermes 4 405B
- Grok 4.3
- ChatGPT 5.3
- Claude Opus 4.7
- DeepSeek V4 Pro

No fallback model. No "gpt-4o-mini", no "gpt-5", no "deepseek-chat", no Opus 4.1/4.5/etc.

## Changes

### `src/server/llm.server.ts`

1. **Update `gpt` slug**: `openai/gpt-5` → `openai/gpt-5.3` (ChatGPT 5.3 is what the picker advertises; current code lies and routes to GPT-5).

2. **Remove the tool fallback block entirely.** Currently if a selected model has no tool-capable endpoint, the code silently retries against `HERMES_TOOL_FALLBACK_MODEL` (defaulting to `openai/gpt-5`). This violates "no fallback models". Replace with a hard error that names only the selected model:
   ```
   throw new Error(`${selectedLabel} has no tool-capable endpoint right now. Pick another model.`)
   ```

3. **Remove `DEFAULT_MODEL` env override.** `HERMES_MODEL` could silently point anywhere. Hard-code default to `nousresearch/hermes-4-405b`.

4. **`resolveChatModel` unknown id**: instead of falling back to Hermes silently, throw — so unknown selector values surface as a real error rather than being masked as Hermes usage.

### `src/lib/chat-models.ts`

Rename `gpt` label `"ChatGPT 5.3"` stays as-is (already correct). Verify all 5 labels match the allowed list exactly.

### Error messages

Audit all `throw new Error(...)` strings in `src/server/llm.server.ts`, `src/serverfns/terminal.functions.ts`, `src/serverfns/ceo-chat.functions.ts` to ensure no disallowed model name leaks into user-facing copy.

### OpenRouter slug verification

Confirmed against OpenRouter catalog:
- `nousresearch/hermes-4-405b` ✓
- `x-ai/grok-4.3` ✓
- `anthropic/claude-opus-4.7` ✓
- `deepseek/deepseek-v4-pro` ✓
- `openai/gpt-5.3` — needs verification at implementation time; if not published, ask user which OpenRouter slug to map "ChatGPT 5.3" to (do not silently substitute).

## Out of scope

- UI selector layout, model picker styling.
- Any change to ceo-chat / terminal dispatch flow (model is already threaded correctly).

## Result

If the user selects DeepSeek V4 Pro and it can't handle the tool call, they see "DeepSeek V4 Pro has no tool-capable endpoint right now. Pick another model." — never a silent swap to another model.
