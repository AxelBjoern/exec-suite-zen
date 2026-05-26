## Problem

`@board` dispatch crashes with `Failed to parse tool args: Expected ',' or ']' after array element in JSON at position 7139`. The agent's `emit_artifact` tool call returns a JSON string that is cut off mid-array because the model hit its output token limit. `callTool` in `src/server/llm.server.ts` does a single `JSON.parse` on the raw arguments, so any truncation kills the whole boardroom run (primary artifact + every consult that follows).

Root cause: no `max_tokens` is sent to OpenRouter, so providers apply their own (often small) default; and `callTool` has no truncation detection, no repair, and no retry.

## Fix

Three small, surgical changes in `src/server/llm.server.ts` — no schema, UI, or dispatch-logic changes.

### 1. Give the model enough room

In `chatCompletion`, add a generous default `max_tokens` for tool-call responses (e.g. `8000`), overridable per call. Boardroom artifacts routinely exceed 4–6k chars of JSON, so the current implicit cap is the real trigger.

### 2. Robust tool-arg parsing in `callTool`

Wrap the existing `JSON.parse(call.function.arguments)` in a helper that:
- Trims and strips accidental ```json fences.
- Tries `JSON.parse` directly.
- On failure, runs a small repair pass: remove trailing commas, strip control chars, and if braces/brackets are unbalanced, append the missing `]` / `}` in the right order to close the structure.
- Tries `JSON.parse` again.
- If still failing, throws a clearer error that includes the model label, the OpenRouter `finish_reason` (e.g. `length`), and a short snippet around the failure offset — so future failures are diagnosable instead of opaque.

### 3. One automatic retry on truncation

In `callTool`, if the first response comes back with `finish_reason === "length"` OR parsing fails after repair, retry the same request once with a larger `max_tokens` (e.g. `12000`) and a stricter system nudge appended ("Return compact JSON. Keep each `body_md` under 400 words. Max 6 action items."). If the retry also fails, surface the improved error from step 2.

## Out of scope

- No changes to `ARTIFACT_TOOL` schema, `dispatch`, or consult flow.
- No streaming. No model switching. No UI changes.
- VDNX code-context preflight stays as-is.

## Files touched

- `src/server/llm.server.ts` — add `max_tokens`, JSON repair helper, single retry on truncation, better error messages.

## Verification

- Re-run the failing `@board` prompt; expect a complete artifact or, on worst case, a clear error naming `finish_reason: length` instead of a JSON position error.
- Existing solo `:cto`, `:ceo`, and `chat_reply` paths keep working (same `callTool` signature).
