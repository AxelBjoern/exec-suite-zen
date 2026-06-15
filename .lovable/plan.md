## Goal
In the Cowork page, let the user (1) pick which model powers Vibe Coder, and (2) start an "Auto-improve" loop that keeps asking the model to suggest improvements to the current preview content until they stop it.

## UI changes — `src/routes/_authenticated/cowork.tsx`

Add a small toolbar above the chat input:

- **Model dropdown** (shadcn `Select`) with the 7 text models from `src/server/llm.server.ts`:
  Hermes 4 405B, Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro, DeepSeek V4 Flash, Nemotron 3 Nano Omni 30B. (Kling is video-only — excluded.) Default: Grok 4.3. Stored in component state (no DB change).
- **Auto-improve** toggle button with:
  - Iteration count input (1–20, default 5)
  - Delay between iterations (slider 0–10s, default 2s)
  - Start / Stop button
- Status line: "Iteration 2 / 5 — improving…" with a Stop button while running.

## Loop behavior

When the user clicks **Start**:
1. Requires an existing session with `preview_content` (otherwise toast "Generate something first").
2. For each iteration `i = 1..N`:
   - Build a prompt: `"Here is the current draft:\n\n\`\`\`{type}\n{preview_content}\n\`\`\`\n\nSuggest the single most impactful improvement and return the FULL improved version in one fenced \`\`\`{type}\`\`\` block. Be concrete."`
   - Append to messages as a user turn, call `chatFn({ data: { messages, model } })`.
   - Parse last fenced block; if found, update `preview_content` / `preview_type` via `updateFn`, and append assistant reply to messages.
   - If no fenced block, stop the loop and toast a warning.
   - Wait `delay` ms (cancellable).
3. Stoppable at any time via an `AbortController`-style flag (`loopAbort.current = true`) checked between iterations.
4. Errors stop the loop and show a toast with model name.

The existing `send()` and `regenerate()` are updated to also pass `model`.

## Server changes
None required — `vibeChat` already accepts `model` and validates against the allowlist.

## Files touched
- `src/routes/_authenticated/cowork.tsx` — model select, loop controls, loop runner, pass `model` to all `chatFn` calls.

No DB migration, no new server functions.
